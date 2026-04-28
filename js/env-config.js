// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Environment Configuration
//  Centralized settings for all APIs.
// ═══════════════════════════════════════════════════════════════════

const ENV = {
  // ── Gemini API (AI Symptom Checker) ──────────────────────────────
  GEMINI_API_KEY: 'AIzaSyBhJAWtw1UIPB0fE9tgATQdb73wetKldSA',
  GEMINI_MODEL: 'gemini-2.0-flash',

  // ── Google Maps API (Clinic Finder) ──────────────────────────────
  GOOGLE_MAPS_API_KEY: 'AIzaSyCFk9z-RNODsVuL-QkE4Os5u5PQSJPge8A',

  // ── Firebase Configuration ───────────────────────────────────────
  FIREBASE_API_KEY: 'AIzaSyABYMmtPRziDnM2KXuPZ9xTXcHjdOHa5dg',
  FIREBASE_AUTH_DOMAIN: 'medilink-488c3.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'medilink-488c3',
  FIREBASE_STORAGE_BUCKET: 'medilink-488c3.firebasestorage.app',
  FIREBASE_MESSAGING_SENDER_ID: '346118242483',
  FIREBASE_APP_ID: '1:346118242483:web:f7d71dc1b04027b90df0c6',
  FIREBASE_MEASUREMENT_ID: 'G-N4PYGDWY73',
  FIREBASE_DATABASE_URL: 'https://medilink-488c3-default-rtdb.asia-southeast1.firebasedatabase.app',

  // ── Application Modes ────────────────────────────────────────────
  // When true, skips real API calls and uses local dummy data (for dev without internet)
  OFFLINE_MODE: false,
};

// Log the configuration loading
console.log('🌍 [ENV] Configuration loaded:', {
  GEMINI_API_KEY: ENV.GEMINI_API_KEY ? "✅ SET" : "❌ MISSING",
  GOOGLE_MAPS_API_KEY: ENV.GOOGLE_MAPS_API_KEY ? "✅ SET" : "❌ MISSING",
  FIREBASE_API_KEY: ENV.FIREBASE_API_KEY ? "✅ SET" : "❌ MISSING",
  OFFLINE_MODE: ENV.OFFLINE_MODE
});

export default ENV;
