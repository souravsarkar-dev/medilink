// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Firebase Initialization
//  Uses Firebase CDN (v12.12.1) — no bundler needed
// ═══════════════════════════════════════════════════════════════════

import ENV from '../env-config.js';

// ── Firebase SDK imports from CDN ──────────────────────────────────
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import {
  getFirestore,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js';
import { getMessaging } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging.js';

// ── Firebase Config object ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            ENV.FIREBASE_API_KEY,
  authDomain:        ENV.FIREBASE_AUTH_DOMAIN,
  projectId:         ENV.FIREBASE_PROJECT_ID,
  storageBucket:     ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
  appId:             ENV.FIREBASE_APP_ID,
  databaseURL:       ENV.FIREBASE_DATABASE_URL,
  measurementId:     ENV.FIREBASE_MEASUREMENT_ID,
};

// ── Initialize (prevent duplicate initializations) ─────────────────
let app;
if (!getApps().length) {
  console.log("🔥 Firebase Config loaded:", 
    Object.keys(firebaseConfig).map(k => 
      `${k}: ${firebaseConfig[k] ? "✅ SET" : "❌ MISSING"}`
    )
  );
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

console.log("Firebase initialized:", app.name);

// ── Auth ───────────────────────────────────────────────────────────
export const auth = getAuth(app);
auth.languageCode = 'hi'; // Default to Hindi for OTP messages

// ── Firestore with offline persistence ────────────────────────────
// Using new SDK persistent cache (replaces enableIndexedDbPersistence)
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    }),
  });
  console.log('[MediLink] Firestore offline persistence enabled ✓');
} catch (e) {
  // Fallback: basic Firestore if persistence initialization fails
  db = getFirestore(app);
  console.warn('[MediLink] Offline persistence not available:', e.message);
}
export { db };

// ── Realtime Database (for telemedicine low-latency chat) ─────────
export const rtdb = getDatabase(app);

// ── Storage ────────────────────────────────────────────────────────
export const storage = getStorage(app);

// ── Analytics (optional — only if supported in browser) ───────────
let analytics = null;
isSupported().then(supported => {
  if (supported) {
    analytics = getAnalytics(app);
    console.log('[MediLink] Firebase Analytics enabled ✓');
  }
});
export { analytics };

// ── Cloud Messaging ───────────────────────────────────────────────
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn('[MediLink] FCM not available (likely not HTTPS or service worker missing)');
}
export { messaging };

// ── Health check ──────────────────────────────────────────────────
export function isFirebaseReady() {
  return !!app && !!auth && !!db;
}

console.log('[MediLink] Firebase initialized ✓ Project:', ENV.FIREBASE_PROJECT_ID);
export default app;
