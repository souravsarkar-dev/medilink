// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Backend Integration Bridge
//  This file connects all backend services to the app.html UI
//  Add to app.html: <script type="module" src="js/app-backend.js"></script>
// ═══════════════════════════════════════════════════════════════════

import ENV from './env-config.js';
import { GEMINI_BASE_URL } from './utils/constants.js';
import { onAuthChange, signInWithGoogle, signOutUser, getCurrentUser } from './firebase/auth.js';
import { analyzeSymptoms } from './services/symptomChecker.js';
import { verifyMedicine, DEMO_MEDICINES } from './services/asliDawa.js';
import { findNearbyClinics, getUserLocation, getDirectionsURL, initGoogleMap, addClinicMarker, calculateDistance } from './services/clinicFinder.js';
import { startConsultation, sendMessage, listenToMessages, generateAIResponse, generateAINotes } from './services/telemedicine.js';
import { addReminder, initReminders, takeMedicine, removeReminder, getTodayReminders } from './services/reminders.js';
import { getPersonalizedFeed, getArticlesByCategory, readArticle, SEED_ARTICLES } from './services/healthFeed.js';
import { getScoreLevel, getLevelProgress, checkAndAwardBadges, getBadgeDetails } from './services/healthScore.js';
import { listenToUser, updateUser, getLeaderboard, getRecentScans } from './firebase/firestore.js';
import { initOfflineSync } from './utils/offlineCache.js';

// ── Google Maps billing error handler ─────────────────────────────
window.gm_authFailure = function() {
  console.warn("🔴 Google Maps billing/auth error detected");
  window._gmapsBillingError = true;
};

// ── Global app state ───────────────────────────────────────────────
window.MediLink = window.MediLink || {};
const ML = window.MediLink;
ML.user = null;
ML.profile = null;
ML.consultationId = null;
ML.unsubscribers = []; // Firestore/RTDB listeners to clean up

// ── Auth State ─────────────────────────────────────────────────────
onAuthChange(async (user) => {
  console.log("🔵 [onAuthChange] called with:", user ? user.uid : 'null');
  ML.user = user;
  if (user) {
    console.log("🟡 [onAuthChange] listening to Firestore user profile...");
    // Hide auth modal if shown
    document.getElementById('authModal')?.classList.add('hidden');

    // Real-time user profile listener
    const unsub = listenToUser(user.uid, (profile) => {
      console.log("📦 [onAuthChange] data received (UserProfile):", profile);
      ML.profile = profile;
      updateDashboardWithRealData(profile);
      checkAndAwardBadges(user.uid);
    });
    ML.unsubscribers.push(unsub);

    // Initialize reminders
    const reminderUnsub = initReminders(user.uid, (reminders) => {
      ML.reminders = reminders;
      updateRemindersUI(reminders);
    });
    ML.unsubscribers.push(reminderUnsub);

    // Load health feed
    loadHealthFeed();
    window.showToast?.(`Welcome, ${user.displayName || 'User'}! 👋`, 'success');
  } else {
    // Not logged in — show auth modal after brief delay
    console.log('[MediLink] Running in guest mode — showing auth prompt');
    loadHealthFeed();
    setTimeout(() => {
      const modal = document.getElementById('authModal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
      }
    }, 2000);
  }
});

// ── Auth Modal ─────────────────────────────────────────────────────
window.showAuthModal = function() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
};

// ── Dashboard Integration ──────────────────────────────────────────
function updateDashboardWithRealData(profile) {
  console.log("🔵 [updateDashboardWithRealData] called with:", profile);
  if (!profile) return;

  const userName = profile.displayName || ML.user?.displayName || 'User';
  const userScore = profile.healthScore || 0;
  const userStreak = profile.dayStreak || 0;
  const userScans = profile.scansThisWeek || 0;
  const userInitial = userName.charAt(0).toUpperCase();

  // Update stat cards
  safeSet('stat-health-score', userScore);
  safeSet('stat-streak', `${userStreak} 🔥`);
  safeSet('stat-scans', `${userScans} 💊`);

  // Update sidebar profile
  safeSet('sidebar-user-name', userName);
  const level = getScoreLevel(userScore);
  safeSet('sidebar-user-level', `${userScore} pts - ${level.name}`);
  safeSet('stat-level-name', level.name);

  // Update avatar
  const avatarEl = document.getElementById('topAvatar');
  if (avatarEl) {
    if (ML.user?.photoURL) {
      avatarEl.innerHTML = `<img src="${ML.user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.parentNode.textContent='${userInitial}'">`;
    } else {
      avatarEl.textContent = userInitial;
    }
  }

  // Update greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  safeSet('topBarSubtitle', `${greeting}, ${userName.split(' ')[0]} 👋`);

  // Update leaderboard with real user + community data
  renderLeaderboard(userName, userScore, userInitial);

  // Update health score page
  safeSet('healthScoreSubtitle', `${userScore} / 1000 - ${level.name}`);
  safeSet('hsStreak', userStreak);
  safeSet('hsScans', userScans);
  safeSet('hsPointsToday', profile.totalPoints || userScore);
}

function renderLeaderboard(userName, userScore, userInitial) {
  const container = document.getElementById('leaderboardList');
  if (!container) return;

  // Try to fetch real leaderboard from Firestore, otherwise use dynamic data
  const communityUsers = [
    { name: userName, score: userScore, initial: userInitial, isYou: true },
  ];

  // Fetch real leaderboard
  if (typeof getLeaderboard === 'function') {
    getLeaderboard(10).then(leaders => {
      if (leaders && leaders.length > 0) {
        const combined = leaders.map(l => ({
          name: l.displayName || 'User',
          score: l.healthScore || 0,
          initial: (l.displayName || 'U').charAt(0).toUpperCase(),
          isYou: l.uid === ML.user?.uid,
        }));
        // Ensure current user is included
        if (!combined.find(c => c.isYou)) {
          combined.push({ name: userName, score: userScore, initial: userInitial, isYou: true });
        }
        combined.sort((a, b) => b.score - a.score);
        renderLeaderboardHTML(container, combined.slice(0, 5));
      } else {
        renderLeaderboardHTML(container, communityUsers);
      }
    }).catch(() => renderLeaderboardHTML(container, communityUsers));
  } else {
    renderLeaderboardHTML(container, communityUsers);
  }
}

function renderLeaderboardHTML(container, users) {
  const medals = ['🏆', '🥈', '🥉'];
  const colors = [
    { bg: 'bg-green-100', text: 'text-green-700' },
    { bg: 'bg-blue-100', text: 'text-blue-700' },
    { bg: 'bg-purple-100', text: 'text-purple-700' },
    { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    { bg: 'bg-pink-100', text: 'text-pink-700' },
  ];

  container.innerHTML = users.map((u, i) => `
    <div class="flex items-center gap-3 p-3 rounded-xl ${u.isYou ? 'bg-white shadow-sm border border-orange-100 my-1' : 'hover:bg-white/50 transition-colors'}">
      <div class="w-5 text-center font-bold ${i < 3 ? 'text-orange-500' : 'text-slate-400'} text-sm">${i < 3 ? medals[i] : `#${i+1}`}</div>
      <div class="w-8 h-8 rounded-full ${u.isYou ? 'bg-blue-600 text-white' : (colors[i] || colors[0]).bg + ' ' + (colors[i] || colors[0]).text} font-bold flex items-center justify-center text-xs">${u.initial}</div>
      <div class="flex-1 ${u.isYou ? 'font-bold' : 'font-semibold'} text-sm text-slate-800">${u.isYou ? `${u.name} (You)` : u.name}</div>
      <div class="font-bold text-blue-600">${u.score}</div>
    </div>
  `).join('');
}

// ── Symptom Checker Integration ────────────────────────────────────
window.analyzeSymptoms = async function() {
  const textarea = document.getElementById('symptomTextarea');
  const btn = document.getElementById('symptomAnalyzeBtn');
  const btnText = document.getElementById('symptomBtnText');
  const btnIcon = document.getElementById('symptomBtnIcon');

  const customText = textarea?.value?.trim() || '';
  const selectedSymptoms = window.symptomState?.selected || [];
  
  const allSymptoms = [...selectedSymptoms, customText].filter(Boolean).join(', ');
  const duration = window.symptomState?.duration || '1-2 days';
  const severity = window.symptomState?.severity || 'Moderate';

  console.log("🔵 [analyzeSymptoms] UI called with:", { allSymptoms, duration, severity });
  
  if (!allSymptoms) {
    window.showToast?.('Please select or enter at least one symptom.', 'error');
    return;
  }

  if (btn) btn.disabled = true;
  if (btnIcon) btnIcon.textContent = '⏳';
  if (btnText) btnText.textContent = 'Analyzing with Gemini AI…';

  try {
    const uid = ML.user?.uid || null;
    console.log("🟡 [analyzeSymptoms] calling API...");
    const result = await analyzeSymptoms(allSymptoms, 'hi', duration, severity, uid);
    console.log("🟢 [analyzeSymptoms] API response:", result);

    // Render result in the existing renderSymptomResult function
    if (typeof window.renderSymptomResult === 'function') {
      window.renderSymptomResult(convertGeminiToAppFormat(result));
    } else {
      renderGeminiResult(result);
    }
  } catch (error) {
    console.error("🔴 [analyzeSymptoms] ERROR:", error.message, error);
    const msg = error.message.includes('429') || error.message.includes('rate limit')
      ? '⏳ API rate limit reached. Please wait 1 minute and try again.'
      : error.message;
    window.showToast?.(msg, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnIcon) btnIcon.textContent = '🔍';
    if (btnText) btnText.textContent = 'Analyze with Gemini AI';
  }
};

function convertGeminiToAppFormat(result) {
  const urgencyMap = {
    LOW: { cls: 'ub-low', levelCls: 'low', icon: '✅', color: 'var(--green)' },
    MEDIUM: { cls: 'ub-moderate', levelCls: 'moderate', icon: '⚠️', color: '#E65100' },
    HIGH: { cls: 'ub-critical', levelCls: 'critical', icon: '🔴', color: 'var(--red)' },
    EMERGENCY: { cls: 'ub-critical', levelCls: 'critical', icon: '🚨', color: 'var(--red)' },
  };
  const u = urgencyMap[result.urgency] || urgencyMap.MEDIUM;
  
  const conditions = (result.possibleConditions || []).map((c) => {
    const name = typeof c === 'string' ? c : (c.name || 'Condition');
    const prob = typeof c === 'string' ? 50 : (c.probability || 50);
    const desc = typeof c === 'string' ? '' : (c.reason || '');
    return {
      name,
      prob: `${prob}%`,
      color: u.color,
      bar: prob,
      desc
    };
  });

  return {
    cls: u.cls, levelCls: u.levelCls, icon: u.icon, color: u.color,
    level: result.urgency === 'EMERGENCY' ? 'EMERGENCY — CALL 108 NOW' : result.urgencyReason || result.urgency,
    desc: result.recommendation,
    conditions: conditions,
    steps: result.homeRemedies?.concat(result.warningSigns?.map(w => `⚠️ ${w}`) || []) || [],
    recommendationHindi: result.recommendationHindi,
    disclaimer: result.disclaimer,
  };
}

function renderGeminiResult(result) {
  const container = document.getElementById('symptomResultContent');
  if (!container) return;
  document.getElementById('symptomResultEmpty')?.classList.add('hidden');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="urgency-banner ${result.urgency === 'LOW' ? 'ub-low' : result.urgency === 'EMERGENCY' || result.urgency === 'HIGH' ? 'ub-critical' : 'ub-moderate'}" style="border-radius:var(--r-xl);padding:20px;margin-bottom:20px">
      <div style="font-size:1.5rem;font-weight:700;margin-bottom:8px">${result.urgency} RISK</div>
      <div style="font-size:0.9rem;opacity:0.85">${result.recommendation}</div>
      ${result.recommendationHindi ? `<div style="font-size:0.85rem;margin-top:6px;opacity:0.75">${result.recommendationHindi}</div>` : ''}
    </div>
    <div style="font-weight:700;margin-bottom:12px">🔬 Possible Conditions</div>
    ${(result.possibleConditions || []).map(c => `<div style="padding:10px;background:#f8f9fa;border-radius:8px;margin-bottom:8px">${c}</div>`).join('')}
    ${result.homeRemedies?.length ? `<div style="font-weight:700;margin:16px 0 8px">🏠 Home Care</div>${result.homeRemedies.map(r => `<div style="padding:8px;font-size:0.875rem">• ${r}</div>`).join('')}` : ''}
    ${result.warningSigns?.length ? `<div style="font-weight:700;color:#EA4335;margin:16px 0 8px">⚠️ Seek Emergency Care If</div>${result.warningSigns.map(w => `<div style="padding:8px;font-size:0.875rem;color:#EA4335">• ${w}</div>`).join('')}` : ''}
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn-blue" onclick="navigateTo('clinic-finder')">🏥 Find Clinic</button>
      <button class="btn-ghost" onclick="navigateTo('telemedicine')">📹 Consult Doctor</button>
      ${result.urgency === 'EMERGENCY' ? '<button class="btn-red" onclick="navigateTo(\'sos\')">🆘 SOS</button>' : ''}
    </div>
    <div style="font-size:0.75rem;color:var(--grey);margin-top:12px">${result.disclaimer || 'AI analysis only. Consult a doctor.'}</div>
  `;
}

// ── AsliDawa Integration ───────────────────────────────────────────
let cameraStream = null;
let capturedImageBase64 = null;

window.openCamera = async function() {
  const video = document.getElementById('scannerVideo');
  const preview = document.getElementById('scannerPreview');
  const targetBox = document.getElementById('scannerTargetBox');
  const btnOpenCamera = document.getElementById('btnOpenCamera');
  const activeCameraControls = document.getElementById('activeCameraControls');
  const placeholderText = document.getElementById('scannerPlaceholderText');
  const scanLine = document.getElementById('scanLineAnim');
  const statusText = document.getElementById('scannerStatusText');
  
  if (!video) return;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    
    video.srcObject = cameraStream;
    video.classList.remove('hidden');
    preview.classList.add('hidden');
    btnOpenCamera.classList.add('hidden');
    activeCameraControls.classList.remove('hidden');
    activeCameraControls.classList.add('grid');
    placeholderText.classList.add('hidden');
    scanLine.classList.remove('hidden');
    statusText.textContent = 'Camera active • Align barcode';
    
    document.getElementById('adResultPlaceholder')?.classList.remove('hidden');
    document.getElementById('adResultContent')?.classList.add('hidden');
    document.getElementById('adResultContent')?.classList.remove('flex');
    
  } catch (err) {
    console.error('Camera error:', err);
    window.showToast?.('Camera access denied or no camera found.', 'error');
  }
};

window.capturePhoto = function() {
  const video = document.getElementById('scannerVideo');
  const canvas = document.getElementById('scannerCanvas');
  const preview = document.getElementById('scannerPreview');
  const activeCameraControls = document.getElementById('activeCameraControls');
  const previewControls = document.getElementById('previewControls');
  const scanLine = document.getElementById('scanLineAnim');
  const statusText = document.getElementById('scannerStatusText');

  if (!video || !canvas) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.8);
  
  preview.src = capturedImageBase64;
  preview.classList.remove('hidden');
  video.classList.add('hidden');
  scanLine.classList.add('hidden');
  
  activeCameraControls.classList.add('hidden');
  activeCameraControls.classList.remove('grid');
  previewControls.classList.remove('hidden');
  previewControls.classList.add('grid');
  statusText.textContent = 'Photo captured • Ready to verify';
  
  window.stopCamera(false); // Stop hardware but keep preview UI
};

window.stopCamera = function(resetUI = true) {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  if (resetUI) {
    document.getElementById('scannerVideo')?.classList.add('hidden');
    document.getElementById('scannerPreview')?.classList.add('hidden');
    document.getElementById('btnOpenCamera')?.classList.remove('hidden');
    document.getElementById('activeCameraControls')?.classList.add('hidden');
    document.getElementById('activeCameraControls')?.classList.remove('grid');
    document.getElementById('previewControls')?.classList.add('hidden');
    document.getElementById('previewControls')?.classList.remove('grid');
    document.getElementById('scannerPlaceholderText')?.classList.remove('hidden');
    document.getElementById('scanLineAnim')?.classList.add('hidden');
    const statusText = document.getElementById('scannerStatusText');
    if (statusText) statusText.textContent = 'Ready to scan medicine';
    capturedImageBase64 = null;
  }
};

window.retakePhoto = function() {
  window.stopCamera(true);
  window.openCamera();
};

window.analyzeMedicine = async function() {
  if (!capturedImageBase64) return;
  
  const statusText = document.getElementById('scannerStatusText');
  const btnVerify = document.getElementById('btnVerify');
  
  if (btnVerify) {
      btnVerify.disabled = true;
      btnVerify.textContent = '🔄 Analyzing...';
  }
  if (statusText) statusText.textContent = 'Sending to Gemini Vision AI...';

  try {
    const uid = ML.user?.uid || null;
    const result = await verifyMedicine('scanned-from-camera', capturedImageBase64, uid);
    
    if (statusText) statusText.textContent = 'Verification complete ✓';
    if (typeof window.renderVerificationResult === 'function') {
      window.renderVerificationResult(result);
    } else {
      renderVerificationResult(result);
    }
  } catch (err) {
    const msg = err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')
      ? '⏳ API rate limit reached. Please wait 1 minute and try again.'
      : err.message.includes('rate limit')
      ? '⏳ Too many requests. Please wait a moment and retry.'
      : 'Analysis failed. Please try again.';
    window.showToast?.(msg, 'error');
    if (statusText) statusText.textContent = 'Analysis failed — please retry';
  } finally {
    if (btnVerify) {
      btnVerify.disabled = false;
      btnVerify.textContent = '🔍 Verify Medicine';
    }
  }
};
window.startDemoScan = async function(barcodeOrId) {
  const uid = ML.user?.uid || null;
  const statusEl = document.getElementById('scannerStatusText');

  const steps = ['Reading barcode…', 'Querying CDSCO database…', 'Running ML Kit analysis…', 'Verifying packaging…', 'Finalising report…'];
  steps.forEach((s, i) => setTimeout(() => { if (statusEl) statusEl.textContent = s; }, i * 700));

  try {
    // Map demo IDs to barcodes
    const demoMap = {
      paracetamol: '8904131401010',
      azithral:    '8922345678901',
      amox:        '8903456789012',
      fake:        'FAKE123456789',
    };
    const barcode = demoMap[barcodeOrId] || barcodeOrId;
    const result = await verifyMedicine(barcode, null, uid);

    setTimeout(() => {
      if (statusEl) statusEl.textContent = 'Verification complete ✓';
      renderVerificationResult(result);
    }, steps.length * 700);
  } catch (error) {
    window.showToast?.(error.message, 'error');
  }
};

function renderVerificationResult(result) {
  const badge = document.getElementById('adResultBadge');
  if (!badge) return;

  const icons = { AUTHENTIC: '✓', SUSPICIOUS: '⚠', COUNTERFEIT: '✕', NOT_IN_DATABASE: '?' };
  const labels = { AUTHENTIC: 'AUTHENTIC', SUSPICIOUS: 'SUSPICIOUS', COUNTERFEIT: 'COUNTERFEIT', NOT_IN_DATABASE: 'UNKNOWN' };

  badge.className = `result-badge ${result.verdict.toLowerCase()}`;
  badge.innerHTML = `<div class="rb-circle">${icons[result.verdict]}</div><div class="rb-status">${labels[result.verdict]}</div><div class="rb-conf">${result.confidence}% confidence · AI verified</div>`;

  safeSet('dtName', result.medicineName || 'Unknown');
  safeSet('dtIngredient', result.genericName || '-');
  safeSet('dtMfr', result.manufacturer || '-');
  safeSet('dtBatch', result.batchFormat || '-');
  safeSet('dtExpiry', result.verdict === 'AUTHENTIC' ? 'Valid' : '⚠ Check packaging');
  safeSet('dtCdsco', result.regNo || '-');

  const toast = { AUTHENTIC: '✅ Authentic!', SUSPICIOUS: '⚠️ Suspicious batch!', COUNTERFEIT: '🚨 COUNTERFEIT DETECTED!', NOT_IN_DATABASE: '❓ Not in database' };
  const type = { AUTHENTIC: 'success', SUSPICIOUS: 'warning', COUNTERFEIT: 'error', NOT_IN_DATABASE: 'info' };
  window.showToast?.(toast[result.verdict], type[result.verdict], 5000);
}

// ── Clinic Finder Integration ──────────────────────────────────────
window.initClinicFinder = async function(forceRefresh = false) {
  console.log("🔵 [initClinicFinder] called, forceRefresh:", forceRefresh);
  if (window._clinicLoading) return;
  if (window.clinicMapInstance && !forceRefresh) return;
  window._clinicLoading = true;

  window.showToast?.('📍 Getting your real location…', 'info', 3000);
  try {
    const { lat, lng } = await getUserLocation();
    window._userLat = lat;
    window._userLng = lng;
    console.log("🟢 Real location:", lat, lng);
    
    window.showToast?.('🔍 Searching real hospitals near you…', 'info', 4000);
    
    // Get real clinics (Places API → Gemini AI fallback)
    const clinics = await findNearbyClinics(lat, lng, {}, ML.user?.uid);
    console.log("🟢 Found", clinics.length, "real places");
    
    window._allClinics = clinics;
    renderClinicResults(clinics, lat, lng);
    window.showToast?.(`✅ Found ${clinics.length} real healthcare facilities near you`, 'success');

    // Try Google Maps — detect billing error and fall back to Leaflet
    let mapWorking = false;
    try {
      // Check if Google Maps had a billing error (watermark = unusable)
      if (window._gmapsBillingError || document.querySelector('.gm-err-container')) {
        throw new Error('Google Maps billing not enabled');
      }
      if (!window.clinicMapInstance) {
        window.clinicMapInstance = await initGoogleMap('clinicMap', { lat, lng });
      } else {
        window.clinicMapInstance.panTo({ lat, lng });
      }
      // Check for billing error after map init
      await new Promise(r => setTimeout(r, 500));
      if (document.querySelector('.gm-err-container') || document.querySelector('.dismissButton')) {
        throw new Error('Google Maps billing error detected');
      }
      mapWorking = true;
    } catch (mapErr) {
      console.warn("🟡 Google Map not usable, loading FREE Leaflet map:", mapErr.message);
      window.clinicMapInstance = null;
    }

    if (mapWorking && window.google?.maps) {
      // Add user location marker
      if (window._userMarker) window._userMarker.setMap(null);
      window._userMarker = new window.google.maps.Marker({
        position: { lat, lng }, map: window.clinicMapInstance,
        title: 'You are here',
        icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png', zIndex: 999,
      });
      
      if (window._clinicMarkers) window._clinicMarkers.forEach(m => m.setMap(null));
      window._clinicMarkers = [];
      const infoWindow = new window.google.maps.InfoWindow();

      clinics.forEach(c => {
        const marker = addClinicMarker(window.clinicMapInstance, c);
        if (marker) {
          window._clinicMarkers.push(marker);
          marker.addListener('click', () => {
            infoWindow.setContent(`
              <div style="padding:10px;font-family:sans-serif;max-width:250px">
                <h3 style="margin:0 0 5px 0;font-size:14px;color:#1A73E8;font-weight:bold">${c.name}</h3>
                <div style="font-size:12px;color:#666">${c.address || ''}</div>
                <div style="font-size:12px;margin-top:5px;font-weight:bold;color:${c.isGovernment ? '#34A853' : '#FF9800'}">${c.isGovernment ? '🏥 Govt/Free' : '🏨 Private'}</div>
                <div style="font-size:12px;margin-top:3px">⭐ ${c.rating || 'N/A'} · ${c.distance} km</div>
                <a href="${getDirectionsURL(c.location.lat, c.location.lng)}" target="_blank" style="display:inline-block;margin-top:8px;padding:6px 12px;background:#1A73E8;color:white;border-radius:6px;text-decoration:none;font-size:12px;font-weight:bold">🗺 Directions</a>
              </div>`);
            infoWindow.open(window.clinicMapInstance, marker);
          });
        }
      });
    } else {
      // FALLBACK: Use FREE Leaflet/OpenStreetMap
      await loadLeafletMap(lat, lng, clinics);
    }

  } catch (error) {
    console.error("🔴 [initClinicFinder] ERROR:", error.message);
    const container = document.getElementById('clinicListContainer');
    if (container) {
      container.innerHTML = `
        <div style="padding:24px;text-align:center">
          <div style="font-size:40px;margin-bottom:12px">⚠️</div>
          <div style="font-weight:700;color:#1e293b;font-size:15px;margin-bottom:8px">${error.message}</div>
          <button onclick="window.initClinicFinder(true)" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer">🔄 Retry</button>
        </div>`;
    }
    window.showToast?.(error.message, 'error', 5000);
  } finally {
    window._clinicLoading = false;
  }
};

// ── Leaflet Map Fallback (FREE, no billing needed) ────────────────
async function loadLeafletMap(lat, lng, clinics) {
  // Load Leaflet CSS + JS if not loaded
  if (!window.L) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  const mapEl = document.getElementById('clinicMap');
  if (!mapEl) return;
  mapEl.innerHTML = ''; // Clear any failed Google Map
  
  const map = window.L.map(mapEl).setView([lat, lng], 13);
  window.leafletMapInstance = map;
  
  // OpenStreetMap tiles (FREE)
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);
  
  // User location marker (red)
  window.L.marker([lat, lng], {
    icon: window.L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    })
  }).addTo(map).bindPopup('<b>📍 You are here</b>').openPopup();
  
  // Clinic markers (blue)
  clinics.forEach(c => {
    if (!c.location?.lat || !c.location?.lng) return;
    const icon = window.L.icon({
      iconUrl: c.isGovernment 
        ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'
        : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    });
    
    window.L.marker([c.location.lat, c.location.lng], { icon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family:sans-serif">
          <b style="color:#1A73E8">${c.name}</b><br>
          <span style="font-size:12px;color:#666">${c.address}</span><br>
          <span style="font-size:12px;font-weight:bold;color:${c.isGovernment ? '#34A853' : '#FF9800'}">${c.isGovernment ? '🏥 Govt/Free' : '🏨 Private'}</span><br>
          <span style="font-size:12px">⭐ ${c.rating} · ${c.distance} km</span><br>
          <a href="${getDirectionsURL(c.location.lat, c.location.lng)}" target="_blank" style="font-size:12px;color:#1A73E8;font-weight:bold">🗺 Get Directions</a>
        </div>
      `);
  });
  
  // Fit map to show all markers
  if (clinics.length > 0) {
    const bounds = window.L.latLngBounds(
      clinics.filter(c => c.location?.lat && c.location?.lng)
        .map(c => [c.location.lat, c.location.lng])
    );
    bounds.extend([lat, lng]);
    map.fitBounds(bounds, { padding: [30, 30] });
  }
  
  console.log("🟢 Leaflet map loaded with", clinics.length, "markers");
}

window.focusClinic = function(id, lat, lng) {
  if (window.clinicMapInstance && lat && lng) {
    window.clinicMapInstance.panTo({ lat, lng });
    window.clinicMapInstance.setZoom(15);
  } else if (window.leafletMapInstance && lat && lng) {
    window.leafletMapInstance.setView([lat, lng], 16);
  }
  
  // Update selection style in the list
  document.querySelectorAll('.clinic-card').forEach(c => c.classList.remove('selected'));
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('selected');
  }
};

function renderClinicResults(clinics, userLat, userLng) {
  const container = document.getElementById('clinicListContainer');
  if (!container) return;
  container.innerHTML = clinics.map((c, i) => `
    <div class="clinic-card ${i === 0 ? 'selected' : ''}" onclick="focusClinic('${c.id}', ${c.location.lat}, ${c.location.lng})">
      <div class="clinic-card-name">${c.name}</div>
      <div class="${c.isOpenNow ? 'clinic-open open' : 'clinic-open closed'}">${c.isOpenNow ? '● Open Now' : '● Closed'}</div>
      <div class="clinic-dist">📍 ${c.distance} km · ${c.address?.substring(0, 40) || ''}</div>
      ${c.isFree ? '<span class="low-data-tag">Free</span>' : ''}
      <div class="clinic-card-actions">
        <div style="font-size:0.8rem;color:var(--yellow)">⭐ ${c.rating || 'N/A'}</div>
        <button class="btn-call" onclick="event.stopPropagation();window.open('${getDirectionsURL(c.location.lat, c.location.lng)}','_blank')">🗺 Directions</button>
      </div>
    </div>`).join('');
}

window.searchClinics = async function() {
  const btn = event?.currentTarget;
  if(btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Searching...';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
      window.initClinicFinder(true);
    }, 800);
  } else {
    window.initClinicFinder(true);
  }
};

// Store clinics globally for filtering
window._allClinics = [];
window._userLat = 0;
window._userLng = 0;

window.searchClinicsByText = async function() {
  const query = document.getElementById('clinicSearchInput')?.value?.trim();
  if (!query) { window.showToast?.('Please enter a search term', 'warning'); return; }
  
  window.showToast?.(`🔍 Searching for "${query}"...`, 'info', 2000);
  
  try {
    const { lat, lng } = await getUserLocation();
    
    // Use Google Places textSearch
    if (window.google?.maps?.places) {
      const service = new window.google.maps.places.PlacesService(
        window.clinicMapInstance || document.createElement('div')
      );
      
      service.textSearch({
        query: query + ' hospital clinic pharmacy',
        location: { lat, lng },
        radius: 15000,
      }, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.length) {
          const clinics = results.map(p => ({
            id: p.place_id,
            name: p.name,
            address: p.formatted_address || p.vicinity || '',
            rating: p.rating || 0,
            totalRatings: p.user_ratings_total || 0,
            isOpenNow: p.opening_hours?.open_now ?? null,
            location: { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() },
            distance: calculateDistance(lat, lng, p.geometry.location.lat(), p.geometry.location.lng()),
            isGovernment: /govt|government|phc|chc|district|civil/i.test(p.name),
            isFree: /govt|government|phc|chc|district|civil/i.test(p.name),
            placeId: p.place_id,
          }));
          
          clinics.sort((a, b) => a.distance - b.distance);
          window._allClinics = clinics;
          renderClinicResults(clinics, lat, lng);
          window.showToast?.(`Found ${clinics.length} results for "${query}"`, 'success');
        } else {
          window.showToast?.('No results found. Try a different search term.', 'warning');
        }
      });
    } else {
      window.showToast?.('Google Maps not loaded yet. Click "Near Me" first.', 'warning');
    }
  } catch (e) {
    window.showToast?.('Could not get location. Please allow location access.', 'error');
  }
};

window.filterClinicsBy = function() {
  const typeFilter = document.getElementById('clinicSpecFilter')?.value || 'all';
  const ratingFilter = parseFloat(document.getElementById('clinicRatingFilter')?.value || '0');
  
  let filtered = [...(window._allClinics || [])];
  
  if (typeFilter === 'government') {
    filtered = filtered.filter(c => c.isGovernment);
  } else if (typeFilter === 'hospital') {
    filtered = filtered.filter(c => /hospital|medical|nursing/i.test(c.name));
  } else if (typeFilter === 'pharmacy') {
    filtered = filtered.filter(c => /pharmacy|chemist|medical store|dawai/i.test(c.name));
  } else if (typeFilter === 'doctor') {
    filtered = filtered.filter(c => /doctor|clinic|dr\./i.test(c.name));
  }
  
  if (ratingFilter > 0) {
    filtered = filtered.filter(c => c.rating >= ratingFilter);
  }
  
  renderClinicResults(filtered, window._userLat, window._userLng);
  window.showToast?.(`Showing ${filtered.length} results`, 'info', 1500);
};

// ── Telemedicine Integration ───────────────────────────────────────
window.initTelemedicine = async function() {
  const uid = ML.user?.uid || 'demo_patient';
  window._chatHistory = [];
  window._telemedLang = 'en';
  try {
    const id = await startConsultation(uid, 'General consultation');
    ML.consultationId = id;
    window.showToast?.('Connected to AI Doctor', 'success');
  } catch (e) {
    console.warn('[Telemedicine] Using AI mode:', e.message);
  }
};

// Tab switching
window.switchTelemedTab = function(tab) {
  ['chat', 'notes', 'rx'].forEach(t => {
    const panel = document.getElementById(`telemedPanel-${t}`);
    if (panel) panel.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('#telemedTabs button').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.className = `flex-1 py-3 text-sm ${isActive ? 'font-bold text-blue-600 border-b-2 border-blue-600' : 'font-semibold text-slate-500 hover:text-slate-700'}`;
  });
  
  // Generate AI notes when switching to notes tab
  if (tab === 'notes' && window._chatHistory?.length > 0) {
    window.generateAINotes();
  }
};

// Language toggle
window.setTelemedLang = function(lang) {
  window._telemedLang = lang;
  document.querySelectorAll('#langToggle > div').forEach(el => {
    const isActive = el.dataset.lang === lang;
    el.className = `px-3 py-1 ${isActive ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-600 font-medium'} rounded-full cursor-pointer`;
  });
  window.showToast?.(`Language set to ${lang === 'hi' ? 'Hindi' : 'English'}`, 'info', 1500);
};

// Send chat message with AI doctor response
window.sendChatMsg = async function(text) {
  if (!text) {
    const input = document.getElementById('chatInput');
    text = input?.value?.trim();
    if (input) input.value = '';
  }
  if (!text) return;
  
  // Show user message immediately
  window.addChatMessage('patient', text);
  window._chatHistory = window._chatHistory || [];
  window._chatHistory.push({ role: 'user', text });
  
  // Show typing indicator
  const chatPanel = document.getElementById('telemedPanel-chat');
  const typingDiv = document.createElement('div');
  typingDiv.id = 'typingIndicator';
  typingDiv.className = 'self-start max-w-[85%]';
  typingDiv.innerHTML = `
    <div class="text-xs text-slate-500 mb-1 ml-1 font-medium">Dr. AI Assistant</div>
    <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 shadow-sm text-sm text-slate-500 italic">typing...</div>
  `;
  chatPanel?.appendChild(typingDiv);
  chatPanel?.scrollTo(0, chatPanel.scrollHeight);
  
  try {
    // Use Gemini AI for doctor response
    const langInstruction = window._telemedLang === 'hi' ? 'Respond in Hindi (Devanagari script).' : 'Respond in English.';
    const url = `${GEMINI_BASE_URL}/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
    
    const conversationContext = window._chatHistory.map(m => 
      `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.text}`
    ).join('\n');
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `You are a qualified Indian medical doctor providing an online consultation. 
${langInstruction}
Be professional, empathetic, and thorough. Ask relevant follow-up questions. 
If symptoms sound serious, advise the patient to visit a hospital immediately.
Keep responses concise (2-4 sentences).
Do NOT diagnose definitively — suggest possibilities and recommend tests if needed.

Conversation so far:
${conversationContext}

Respond as the doctor:` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
      })
    });
    
    // Remove typing indicator
    document.getElementById('typingIndicator')?.remove();
    
    if (res.ok) {
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I understand. Could you tell me more about when this started?';
      window._chatHistory.push({ role: 'doctor', text: reply });
      window.addChatMessage('doctor', reply);
    } else {
      throw new Error('API error');
    }
  } catch (e) {
    document.getElementById('typingIndicator')?.remove();
    // Fallback responses
    const fallbacks = [
      'I understand your concern. How long have you been experiencing these symptoms?',
      'That\'s helpful information. Are you currently taking any medications?',
      'I see. Do you have any allergies or pre-existing conditions I should know about?',
      'Based on what you\'ve described, I\'d recommend getting some basic blood tests done. Please visit your nearest lab.',
      'This could be related to seasonal changes. Stay hydrated and rest. If symptoms persist for more than 3 days, please visit a doctor in person.',
    ];
    const reply = fallbacks[Math.min(window._chatHistory.length - 1, fallbacks.length - 1)];
    window._chatHistory.push({ role: 'doctor', text: reply });
    window.addChatMessage('doctor', reply);
  }
  
  // Save to Firebase if connected
  if (ML.consultationId) {
    const uid = ML.user?.uid || 'demo_patient';
    sendMessage(ML.consultationId, text, uid, 'patient').catch(() => {});
  }
};

// Generate AI notes from conversation
window.generateAINotes = function() {
  const notesEl = document.getElementById('aiNotesContent');
  if (!notesEl || !window._chatHistory?.length) return;
  
  const symptoms = window._chatHistory.filter(m => m.role === 'user').map(m => m.text);
  const doctorNotes = window._chatHistory.filter(m => m.role === 'doctor').map(m => m.text);
  
  notesEl.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl p-4 mb-3">
      <div class="font-bold text-slate-800 mb-2">📋 Patient Symptoms</div>
      <ul class="text-sm text-slate-600 space-y-1">${symptoms.map(s => `<li class="flex gap-2"><span>•</span><span>${s}</span></li>`).join('')}</ul>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl p-4 mb-3">
      <div class="font-bold text-slate-800 mb-2">🩺 Doctor Observations</div>
      <ul class="text-sm text-slate-600 space-y-1">${doctorNotes.map(n => `<li class="flex gap-2"><span>•</span><span>${n}</span></li>`).join('')}</ul>
    </div>
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div class="font-bold text-blue-800 mb-1">⏱ Consultation Duration</div>
      <div class="text-sm text-blue-600">${window._chatHistory.length} messages exchanged</div>
    </div>
  `;
};

// Add chat message to the panel
window.addChatMessage = function(senderType, text) {
  const chatPanel = document.getElementById('telemedPanel-chat');
  if (!chatPanel) return;
  
  const isUser = senderType === 'patient' || senderType === 'user';
  const userName = window.MediLink?.profile?.displayName || window.MediLink?.user?.displayName || 'You';
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `${isUser ? 'self-end' : 'self-start'} max-w-[85%]`;
  msgDiv.innerHTML = `
    <div class="text-xs text-slate-500 mb-1 ${isUser ? 'mr-1 text-right' : 'ml-1'} font-medium">
      ${isUser ? userName : 'Dr. AI Assistant'}
    </div>
    <div class="${isUser ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'} rounded-2xl p-3 shadow-sm text-sm leading-relaxed">
      ${text}
    </div>
  `;
  chatPanel.appendChild(msgDiv);
  chatPanel.scrollTo(0, chatPanel.scrollHeight);
};

// ── Health Feed Integration ────────────────────────────────────────
async function loadHealthFeed() {
  const grid = document.getElementById('feedGrid');
  if (!grid) return;
  try {
    const articles = await getPersonalizedFeed(ML.user?.uid, ML.profile);
    renderFeedArticles(articles, 'all');
    window.ML_ARTICLES = articles;
  } catch (e) {
    // Use seed articles as fallback
    window.ML_ARTICLES = SEED_ARTICLES;
    renderFeedArticles(SEED_ARTICLES, 'all');
  }
}

window.loadFeedCategory = async function(category) {
  try {
    const articles = category === 'all'
      ? (window.ML_ARTICLES || SEED_ARTICLES)
      : await getArticlesByCategory(category);
    renderFeedArticles(articles, category);
  } catch {
    renderFeedArticles(SEED_ARTICLES.filter(a => category === 'all' || a.category === category), category);
  }
};

function renderFeedArticles(articles, category) {
  const grid = document.getElementById('feedGrid');
  if (!grid) return;
  const filtered = category === 'all' ? articles : articles.filter(a => a.category === category);
  const catColors = {
    'Prevention': { bg: 'bg-green-100', text: 'text-green-600' },
    'Nutrition': { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    'Mental': { bg: 'bg-blue-100', text: 'text-blue-600' },
    'First Aid': { bg: 'bg-red-100', text: 'text-red-600' },
    'Fitness': { bg: 'bg-orange-100', text: 'text-orange-600' },
    'Ayurveda': { bg: 'bg-emerald-100', text: 'text-emerald-600' },
    'General': { bg: 'bg-purple-100', text: 'text-purple-600' },
  };
  grid.innerHTML = filtered.map(a => {
    const colors = catColors[a.category] || { bg: 'bg-slate-100', text: 'text-slate-600' };
    return `
    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col h-64" onclick="openArticle('${a.id}')">
      <div class="h-24 ${colors.bg} flex items-center justify-center text-4xl">${a.emoji || '📰'}</div>
      <div class="p-5 flex-1 flex flex-col">
        <div class="text-[10px] font-bold tracking-wider ${colors.text} mb-2">${(a.category || '').toUpperCase()}</div>
        <h3 class="font-bold text-slate-800 mb-2 leading-snug line-clamp-2">${a.title}</h3>
        <p class="text-xs text-slate-500 line-clamp-2 flex-1">${a.content?.substring(0, 120) || ''}…</p>
        <div class="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
          <span>⏱️ ${a.readTime || '3 min'} read</span>
          <span class="hover:text-blue-600">📤 Share</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.openArticle = async function(articleId) {
  const articles = window.ML_ARTICLES || SEED_ARTICLES;
  const article = articles.find(a => a.id === articleId);
  if (!article) { window.showToast?.('Article not found', 'error'); return; }
  
  if (ML.user?.uid) await readArticle(ML.user.uid, articleId);
  
  // Create full-screen article modal
  const overlay = document.createElement('div');
  overlay.id = 'articleModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
  const catColors = { 'Prevention':'#16a34a', 'Nutrition':'#ca8a04', 'Mental':'#2563eb', 'First Aid':'#dc2626', 'Fitness':'#ea580c', 'Ayurveda':'#059669', 'General':'#7c3aed' };
  const color = catColors[article.category] || '#2563eb';
  
  overlay.innerHTML = `
    <div style="background:white;border-radius:20px;max-width:640px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,0.25);animation:slideUp 0.3s ease">
      <div style="background:linear-gradient(135deg,${color}15,${color}08);padding:32px;border-bottom:1px solid ${color}20">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="font-size:48px">${article.emoji || '📰'}</div>
          <button onclick="document.getElementById('articleModal').remove()" style="width:36px;height:36px;border-radius:50%;border:none;background:rgba(0,0,0,0.08);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">✕</button>
        </div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:${color};margin:12px 0 8px;text-transform:uppercase">${article.category}</div>
        <h2 style="font-size:24px;font-weight:800;color:#1e293b;line-height:1.3;margin:0">${article.title}</h2>
        <div style="display:flex;gap:16px;margin-top:12px;font-size:13px;color:#64748b">
          <span>⏱️ ${article.readTime || '3 min'} read</span>
          <span>📅 ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
      <div style="padding:32px;font-size:15px;line-height:1.8;color:#334155">
        <p>${article.content || 'Full article content loading...'}</p>
        <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:12px;border-left:4px solid ${color}">
          <div style="font-weight:700;font-size:13px;color:${color};margin-bottom:4px">💡 Key Takeaway</div>
          <div style="font-size:14px;color:#475569">Always consult a qualified healthcare professional for medical advice specific to your condition.</div>
        </div>
      </div>
      <div style="padding:16px 32px 24px;display:flex;gap:12px;border-top:1px solid #f1f5f9">
        <button onclick="window.shareArticle('${articleId}')" style="flex:1;padding:12px;background:#f1f5f9;border:none;border-radius:12px;font-weight:600;cursor:pointer;font-size:14px">📤 Share</button>
        <button onclick="document.getElementById('articleModal').remove()" style="flex:1;padding:12px;background:#2563eb;color:white;border:none;border-radius:12px;font-weight:600;cursor:pointer;font-size:14px">Done Reading</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  window.showToast?.('📖 Article opened!', 'success', 1500);
};

// Share article with proper content
window.shareArticle = async function(articleId) {
  const articles = window.ML_ARTICLES || SEED_ARTICLES;
  const article = articles.find(a => a.id === articleId);
  if (!article) return;
  
  // Strip HTML tags for plain text share
  const plainContent = (article.content || '').replace(/<[^>]*>/g, '').substring(0, 200);
  
  const shareData = {
    title: `${article.emoji} ${article.title}`,
    text: `${article.emoji} ${article.title}\n\n${plainContent}...\n\n📱 Read more on MediLink 2.0 — Your AI Health Companion`,
    url: window.location.href,
  };
  
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      window.showToast?.('📤 Shared successfully!', 'success');
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(shareData.text);
      window.showToast?.('📋 Copied to clipboard! Paste in WhatsApp/any app.', 'success');
    }
  } catch (e) {
    // User cancelled share or error — try clipboard
    try {
      await navigator.clipboard.writeText(shareData.text);
      window.showToast?.('📋 Copied to clipboard!', 'success');
    } catch {
      window.showToast?.('Could not share. Please copy manually.', 'warning');
    }
  }
};

function updateRemindersUI(reminders) {
  console.log("🔵 [updateRemindersUI] called with:", reminders);
  renderTimeline(reminders);
  renderCabinet(reminders);
}

function renderTimeline(reminders) {
  const container = document.getElementById('reminderTimeline');
  if (!container) return;
  
  if (!reminders || reminders.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <div class="text-3xl mb-2">💊</div>
        <p class="text-sm font-medium text-slate-500">No active reminders. Add one from your cabinet!</p>
      </div>
    `;
    return;
  }

  // Sort by time
  const sorted = [...reminders].sort((a, b) => a.time.localeCompare(b.time));
  
  container.innerHTML = sorted.map(r => `
    <div class="relative pl-8 pb-8 last:pb-0">
      <div class="absolute left-0 top-0 w-px h-full bg-slate-200 last:h-2"></div>
      <div class="absolute left-[-4px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-50"></div>
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex justify-between items-start mb-2">
          <div>
            <div class="font-bold text-slate-800">${r.medicineName}</div>
            <div class="text-xs text-slate-500">${r.dosage} • ${r.frequency}</div>
          </div>
          <div class="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold">${r.time}</div>
        </div>
        <button onclick="window.takeMedicine('${ML.user?.uid}', '${r.id}', '${r.medicineName}')" class="w-full mt-2 py-2 bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-600 rounded-xl text-xs font-bold transition-colors">
          Mark as Taken
        </button>
      </div>
    </div>
  `).join('');
}

function renderCabinet(reminders) {
  const container = document.getElementById('cabinetGrid');
  if (!container) return;
  
  if (!reminders || reminders.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p class="text-sm font-medium text-slate-500">Your cabinet is empty.</p>
        <button onclick="window.showAddReminderModal()" class="mt-3 text-blue-600 font-bold text-sm">+ Add Medicine</button>
      </div>
    `;
    return;
  }

  container.innerHTML = reminders.map(r => `
    <div class="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors bg-white relative">
      <button onclick="window.removeRealReminder('${r.id}')" class="absolute top-2 right-2 text-slate-300 hover:text-red-500">✕</button>
      <div class="text-xl mb-2">${r.icon || '💊'}</div>
      <div class="font-bold text-slate-800">${r.medicineName}</div>
      <div class="text-xs text-slate-500 mb-3">${r.dosage} • ${r.frequency}</div>
      <div class="bg-slate-100 h-1.5 rounded-full overflow-hidden mb-1">
        <div class="bg-blue-500 w-full h-full rounded-full"></div>
      </div>
      <div class="text-[10px] font-bold text-slate-400">Next: ${r.time}</div>
    </div>
  `).join('');
}

window.showAddReminderModal = function() {
  const name = prompt("Medicine Name:");
  if (!name) return;
  const time = prompt("Time (HH:MM, e.g., 09:00):", "09:00");
  if (!time) return;
  const dosage = prompt("Dosage (e.g., 1 tablet):", "1 tablet");
  const frequency = prompt("Frequency (e.g., Once daily):", "Once daily");
  
  window.addRealReminder({
    medicineName: name,
    time: time,
    dosage: dosage,
    frequency: frequency,
    icon: '💊',
    createdAt: new Date().toISOString()
  });
};

window.removeRealReminder = async function(reminderId) {
  if (!ML.user?.uid) return;
  if (!confirm("Remove this reminder?")) return;
  await removeReminder(ML.user.uid, reminderId);
  window.showToast?.('Reminder removed', 'success');
};

window.addRealReminder = async function(reminderData) {
  console.log("🔵 [addRealReminder] called with:", reminderData);
  const uid = ML.user?.uid;
  if (!uid) { window.showToast?.('Login to save reminders', 'info'); return; }
  
  // Request notification permission if not granted
  if (window.Notification && Notification.permission !== 'granted') {
    console.log("🟡 [addRealReminder] requesting notification permission...");
    const permission = await Notification.requestPermission();
    console.log("🟢 [addRealReminder] Notification permission:", permission);
    if (permission === 'granted') {
      new Notification("MediLink", { body: "Notifications enabled! You will receive medicine reminders." });
    }
  }

  console.log("🟡 [addRealReminder] calling Firestore addReminder...");
  const id = await addReminder(uid, reminderData);
  console.log("🟢 [addRealReminder] Reminder saved, ID:", id);
  window.showToast?.(`✅ Reminder added for ${reminderData.medicineName}`, 'success');
  return id;
};

window.takeMedicine = async function(uid, reminderId, medicineName) {
  if (!uid) uid = ML.user?.uid;
  if (!uid) return;
  await takeMedicine(uid, reminderId, medicineName);
};

// ── Health Score Integration ───────────────────────────────────────
window.getHealthScoreData = function() {
  if (!ML.profile) return null;
  const score = ML.profile.healthScore || 0;
  const level = getScoreLevel(score);
  const { progress, nextLevel, pointsNeeded } = getLevelProgress(score);
  const badges = getBadgeDetails(ML.profile.badges || []);
  return { score, level, progress, nextLevel, pointsNeeded, badges };
};

// ── Utility helpers ────────────────────────────────────────────────
function safeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ── Google Sign-In button ──────────────────────────────────────────
window.signInWithGoogleBtn = async function() {
  try {
    const user = await signInWithGoogle();
    window.showToast?.(`Welcome, ${user.displayName}! 👋`, 'success');
  } catch (e) {
    window.showToast?.(e.message, 'error');
  }
};

window.signOutBtn = async function() {
  await signOutUser();
  window.showToast?.('Signed out successfully', 'info');
};

// ── Offline sync setup ─────────────────────────────────────────────
initOfflineSync(async (queue) => {
  // Process queued offline actions when back online
  console.log('[MediLink] Processing', queue.length, 'offline actions');
});

// ── Add Medicine Modal ─────────────────────────────────────────────
window.showAddMedicineModal = function() {
  const existing = document.getElementById('addMedicineModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'addMedicineModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;max-width:480px;width:100%;box-shadow:0 25px 50px rgba(0,0,0,0.25);animation:slideUp 0.3s ease;overflow:hidden">
      <div style="padding:24px 24px 0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:20px;font-weight:800;color:#1e293b;margin:0">💊 Add Medicine</h3>
        <button onclick="document.getElementById('addMedicineModal').remove()" style="width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:16px">✕</button>
      </div>
      <div style="padding:24px;display:flex;flex-direction:column;gap:16px">
        <div>
          <label style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;display:block">Medicine Name *</label>
          <input id="medName" type="text" placeholder="e.g. Paracetamol 500mg" style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;outline:none;transition:border 0.2s" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e2e8f0'">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;display:block">Dosage</label>
            <input id="medDose" type="text" placeholder="e.g. 1 tablet" style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;outline:none" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e2e8f0'">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;display:block">Frequency</label>
            <select id="medFreq" style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;background:white;outline:none;cursor:pointer">
              <option>Once daily</option><option>Twice daily</option><option>Thrice daily</option><option>As needed</option><option>Once weekly</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;display:block">Time</label>
            <input id="medTime" type="time" value="09:00" style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;outline:none" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e2e8f0'">
          </div>
          <div>
            <label style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;display:block">Instruction</label>
            <select id="medInstr" style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;background:white;outline:none;cursor:pointer">
              <option>After food</option><option>Before food</option><option>With food</option><option>Empty stomach</option>
            </select>
          </div>
        </div>
        <button onclick="window.saveMedicineFromModal()" style="width:100%;padding:14px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px;transition:transform 0.2s" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
          ✅ Add Reminder
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveMedicineFromModal = function() {
  const name = document.getElementById('medName')?.value?.trim();
  if (!name) { window.showToast?.('Please enter medicine name', 'error'); return; }
  
  const dose = document.getElementById('medDose')?.value?.trim() || '1 tablet';
  const freq = document.getElementById('medFreq')?.value || 'Once daily';
  const time = document.getElementById('medTime')?.value || '09:00';
  const instruction = document.getElementById('medInstr')?.value || 'After food';
  
  // Add to medicine cabinet display
  const cabinet = document.querySelector('#page-reminders .grid.grid-cols-2');
  if (cabinet) {
    const colors = ['blue','green','purple','orange','pink'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const card = document.createElement('div');
    card.className = `bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow`;
    card.innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-full bg-${color}-100 flex items-center justify-center text-lg">💊</div>
        <div>
          <div class="font-bold text-slate-800">${name}</div>
          <div class="text-xs text-slate-500">${dose} • ${freq}</div>
        </div>
      </div>
      <div class="text-xs text-slate-400">${instruction} • ${time}</div>
      <div class="w-full bg-${color}-100 h-1.5 rounded-full mt-3"><div class="h-full bg-${color}-500 rounded-full" style="width:10%"></div></div>
    `;
    cabinet.appendChild(card);
  }
  
  // Save to Firebase if logged in
  if (ML.user?.uid) {
    addReminder(ML.user.uid, {
      medicineName: name, dosage: dose, frequency: freq,
      times: [time], instruction, startDate: new Date().toISOString().split('T')[0],
    }).then(() => console.log('[MediLink] Reminder saved to Firebase'))
      .catch(e => console.warn('[MediLink] Could not save to Firebase:', e.message));
  }
  
  document.getElementById('addMedicineModal')?.remove();
  window.showToast?.(`✅ ${name} added to your medicines!`, 'success');
};

// ── Emergency SOS ──────────────────────────────────────────────────
window.triggerSOS = function() {
  const existing = document.getElementById('sosModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'sosModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(220,38,38,0.15);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;max-width:420px;width:100%;box-shadow:0 25px 50px rgba(220,38,38,0.3);animation:slideUp 0.3s ease;overflow:hidden">
      <div style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:32px;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">🚨</div>
        <h2 style="color:white;font-size:22px;font-weight:800;margin:0">Emergency SOS</h2>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0">Tap to call emergency services immediately</p>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:10px">
        <a href="tel:112" onclick="navigator.clipboard?.writeText('112');window.showToast?.('📞 Number 112 copied! Dial from your phone.','success')" style="display:flex;align-items:center;gap:14px;padding:16px;background:#fef2f2;border:2px solid #fecaca;border-radius:14px;text-decoration:none;transition:all 0.2s;cursor:pointer" onmouseover="this.style.borderColor='#ef4444'" onmouseout="this.style.borderColor='#fecaca'">
          <div style="width:44px;height:44px;border-radius:12px;background:#dc2626;color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold">📞</div>
          <div><div style="font-weight:700;color:#1e293b;font-size:16px">112 — National Emergency</div><div style="font-size:12px;color:#64748b">Police, Fire, Ambulance (click to copy)</div></div>
        </a>
        <a href="tel:108" onclick="navigator.clipboard?.writeText('108');window.showToast?.('📞 Number 108 copied! Dial from your phone.','success')" style="display:flex;align-items:center;gap:14px;padding:16px;background:#fef2f2;border:2px solid #fecaca;border-radius:14px;text-decoration:none;transition:all 0.2s;cursor:pointer" onmouseover="this.style.borderColor='#ef4444'" onmouseout="this.style.borderColor='#fecaca'">
          <div style="width:44px;height:44px;border-radius:12px;background:#ea580c;color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold">🚑</div>
          <div><div style="font-weight:700;color:#1e293b;font-size:16px">108 — Ambulance Service</div><div style="font-size:12px;color:#64748b">Free government ambulance (click to copy)</div></div>
        </a>
        <a href="tel:104" onclick="navigator.clipboard?.writeText('104');window.showToast?.('📞 Number 104 copied! Dial from your phone.','success')" style="display:flex;align-items:center;gap:14px;padding:16px;background:#eff6ff;border:2px solid #bfdbfe;border-radius:14px;text-decoration:none;transition:all 0.2s;cursor:pointer" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#bfdbfe'">
          <div style="width:44px;height:44px;border-radius:12px;background:#2563eb;color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold">🏥</div>
          <div><div style="font-weight:700;color:#1e293b;font-size:16px">104 — Health Helpline</div><div style="font-size:12px;color:#64748b">Medical advice & nearest hospital (click to copy)</div></div>
        </a>
        <a href="tel:18602662345" onclick="navigator.clipboard?.writeText('18602662345');window.showToast?.('📞 Number copied! Dial from your phone.','success')" style="display:flex;align-items:center;gap:14px;padding:16px;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:14px;text-decoration:none;transition:all 0.2s;cursor:pointer" onmouseover="this.style.borderColor='#22c55e'" onmouseout="this.style.borderColor='#bbf7d0'">
          <div style="width:44px;height:44px;border-radius:12px;background:#16a34a;color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold">🧠</div>
          <div><div style="font-weight:700;color:#1e293b;font-size:16px">1860-266-2345 — Mental Health</div><div style="font-size:12px;color:#64748b">Vandrevala Foundation — 24/7 (click to copy)</div></div>
        </a>
        <button onclick="document.getElementById('sosModal').remove()" style="width:100%;padding:12px;background:#f1f5f9;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;color:#64748b;margin-top:4px">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.showToast?.('🚨 Emergency options displayed', 'warning');
};

// ── Expose ML namespace for debugging ─────────────────────────────
window.MediLink = ML;
console.log('[MediLink] Backend integration loaded ✓ Mode:', ENV.DEBUG_MODE ? 'DEBUG' : 'PRODUCTION');
