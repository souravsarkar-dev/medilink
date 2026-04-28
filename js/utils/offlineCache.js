// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Offline Cache (LocalStorage based)
//  Enables the app to work on 2G/3G with cached data
// ═══════════════════════════════════════════════════════════════════

const CACHE_PREFIX    = 'medilink_v2_';
const DEFAULT_TTL_MS  = 15 * 60 * 1000;  // 15 minutes
const LONG_TTL_MS     = 24 * 60 * 60 * 1000; // 24 hours

// ── Core Cache Functions ───────────────────────────────────────────

/**
 * Store data in local cache with optional TTL
 */
export function setCache(key, data, ttlMs = DEFAULT_TTL_MS) {
  try {
    const entry = {
      data,
      expiresAt: ttlMs === Infinity ? Infinity : Date.now() + ttlMs,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    return true;
  } catch (e) {
    // Storage full — clear oldest entries
    clearOldCache();
    return false;
  }
}

/**
 * Get data from cache (returns null if expired or not found)
 */
export function getCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.expiresAt !== Infinity && Date.now() > entry.expiresAt) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch (e) {
    return null;
  }
}

/**
 * Delete a cache entry
 */
export function removeCache(key) {
  localStorage.removeItem(CACHE_PREFIX + key);
}

/**
 * Clear all MediLink cache entries
 */
export function clearAllCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
}

/**
 * Clear expired + oldest entries when storage is full
 */
function clearOldCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  const entries = keys.map(key => {
    try {
      const entry = JSON.parse(localStorage.getItem(key));
      return { key, cachedAt: entry.cachedAt || 0, expiresAt: entry.expiresAt };
    } catch { return { key, cachedAt: 0, expiresAt: 0 }; }
  });
  // Remove expired first
  entries.filter(e => Date.now() > e.expiresAt).forEach(e => localStorage.removeItem(e.key));
  // Then remove oldest until we've freed 20% of entries
  entries.sort((a, b) => a.cachedAt - b.cachedAt)
    .slice(0, Math.ceil(entries.length * 0.2))
    .forEach(e => localStorage.removeItem(e.key));
}

// ── Specialized Cache Helpers ──────────────────────────────────────

/** Cache user profile (24h TTL) */
export function cacheUserProfile(uid, profile) {
  setCache(`user_${uid}`, profile, LONG_TTL_MS);
}
export function getCachedUserProfile(uid) {
  return getCache(`user_${uid}`);
}

/** Cache clinic search results (15 min TTL) */
export function cacheClinics(lat, lng, clinics) {
  const key = `clinics_${lat.toFixed(3)}_${lng.toFixed(3)}`;
  setCache(key, clinics, DEFAULT_TTL_MS);
}
export function getCachedClinics(lat, lng) {
  const key = `clinics_${lat.toFixed(3)}_${lng.toFixed(3)}`;
  return getCache(key);
}

/** Cache health articles (24h TTL) */
export function cacheArticles(articles) {
  setCache('health_articles', articles, LONG_TTL_MS);
}
export function getCachedArticles() {
  return getCache('health_articles');
}

/** Cache last symptom check (session only) */
export function cacheSymptomResult(result) {
  setCache('last_symptom_result', result, 60 * 60 * 1000); // 1 hour
}
export function getCachedSymptomResult() {
  return getCache('last_symptom_result');
}

/** Cache Gemini translation results (24h to avoid repeated API calls) */
export function cacheTranslation(text, lang, translation) {
  const key = `translate_${lang}_${btoa(text.substring(0, 50))}`;
  setCache(key, translation, LONG_TTL_MS);
}
export function getCachedTranslation(text, lang) {
  const key = `translate_${lang}_${btoa(text.substring(0, 50))}`;
  return getCache(key);
}

/** Pending actions queue (for offline sync) */
export function queueOfflineAction(action) {
  const queue = getCache('offline_queue') || [];
  queue.push({ ...action, queuedAt: Date.now() });
  setCache('offline_queue', queue, Infinity);
}
export function getOfflineQueue() {
  return getCache('offline_queue') || [];
}
export function clearOfflineQueue() {
  removeCache('offline_queue');
}

// ── Network Status Listener ────────────────────────────────────────
export function initOfflineSync(syncCallback) {
  window.addEventListener('online', async () => {
    console.log('[MediLink] Back online — syncing queued actions...');
    if (typeof window.showToast === 'function') {
      window.showToast('✅ Back online! Syncing your data...', 'success', 3000);
    }
    const queue = getOfflineQueue();
    if (queue.length > 0 && typeof syncCallback === 'function') {
      await syncCallback(queue);
      clearOfflineQueue();
    }
  });

  window.addEventListener('offline', () => {
    if (typeof window.showToast === 'function') {
      window.showToast('📶 You\'re offline. Core features still work!', 'warning', 4000);
    }
  });
}
