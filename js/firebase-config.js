// ═══════════════════════════════════════════════════════════════
//  MediLink 2.0 — Firebase Configuration
//  Google Solution Challenge 2026
//  Author: Sourav Sarkar, JIS College of Engineering
// ═══════════════════════════════════════════════════════════════
//
//  HOW TO SET UP:
//  1. Go to https://console.firebase.google.com/
//  2. Create a new project called "medilink-2-0"
//  3. Click ⚙️ Project Settings → General → Your Apps → Web App
//  4. Register app, copy the firebaseConfig object below
//  5. Enable these in Firebase Console:
//     - Authentication → Sign-in methods → Google + Phone + Email
//     - Firestore Database → Start in test mode
//     - Storage → Start in test mode
//     - Analytics → Enable
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";

// ──────────────────────────────────────────────────────────────
//  🔥 PASTE YOUR FIREBASE CONFIG HERE (from Firebase Console)
// ──────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
  measurementId:     "YOUR_MEASUREMENT_ID"   // Optional: for Analytics
};

// ──────────────────────────────────────────────────────────────
//  Initialize Firebase Services
// ──────────────────────────────────────────────────────────────
const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const storage   = getStorage(app);
const analytics = getAnalytics(app);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ──────────────────────────────────────────────────────────────
//  Auth Helpers
// ──────────────────────────────────────────────────────────────

/** Sign in with Google popup */
async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    await createOrUpdateUserProfile(user);
    logEvent(analytics, 'login', { method: 'Google' });
    return user;
  } catch (error) {
    console.error('Google Sign-In failed:', error.message);
    throw error;
  }
}

/** Sign out current user */
async function signOutUser() {
  try {
    await signOut(auth);
    logEvent(analytics, 'logout');
  } catch (error) {
    console.error('Sign-out failed:', error.message);
  }
}

/** Listen for auth state changes */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ──────────────────────────────────────────────────────────────
//  Firestore Helpers
// ──────────────────────────────────────────────────────────────

/** Create or update user profile in Firestore */
async function createOrUpdateUserProfile(user) {
  const userRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid:          user.uid,
      displayName:  user.displayName || 'MediLink User',
      email:        user.email || '',
      photoURL:     user.photoURL || '',
      healthScore:  0,
      streak:       0,
      badges:       [],
      language:     'en',
      createdAt:    serverTimestamp(),
      lastActive:   serverTimestamp(),
    });
  } else {
    await setDoc(userRef, { lastActive: serverTimestamp() }, { merge: true });
  }
}

/** Save a scan result to Firestore */
async function saveScanResult(userId, scanData) {
  const scansRef = collection(db, 'users', userId, 'scans');
  await addDoc(scansRef, {
    ...scanData,
    timestamp: serverTimestamp(),
  });
  logEvent(analytics, 'medicine_scan', { status: scanData.status });
}

/** Save symptom check result */
async function saveSymptomCheck(userId, checkData) {
  const checksRef = collection(db, 'users', userId, 'symptomChecks');
  await addDoc(checksRef, {
    ...checkData,
    timestamp: serverTimestamp(),
  });
  logEvent(analytics, 'symptom_check', { urgency: checkData.urgency });
}

/** Get user health data */
async function getUserData(userId) {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}

/** Update health score */
async function updateHealthScore(userId, points) {
  const userRef = doc(db, 'users', userId);
  const userData = await getUserData(userId);
  const newScore = (userData?.healthScore || 0) + points;
  await setDoc(userRef, { healthScore: newScore }, { merge: true });
  return newScore;
}

/** Listen to reminders in real-time */
function listenToReminders(userId, callback) {
  const remindersRef = collection(db, 'users', userId, 'reminders');
  const q = query(remindersRef, orderBy('time'));
  return onSnapshot(q, (snapshot) => {
    const reminders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(reminders);
  });
}

// ──────────────────────────────────────────────────────────────
//  Analytics Helpers
// ──────────────────────────────────────────────────────────────

function trackEvent(eventName, params = {}) {
  logEvent(analytics, eventName, params);
}

// ──────────────────────────────────────────────────────────────
//  Exports
// ──────────────────────────────────────────────────────────────
export {
  app, auth, db, storage, analytics,
  // Auth
  signInWithGoogle, signOutUser, onAuthChange,
  // Firestore
  createOrUpdateUserProfile, saveScanResult, saveSymptomCheck,
  getUserData, updateHealthScore, listenToReminders,
  // Analytics
  trackEvent,
  // Firestore SDK re-exports (for use elsewhere)
  collection, doc, setDoc, getDoc, addDoc, onSnapshot,
  query, orderBy, serverTimestamp,
  // Storage SDK re-exports
  ref, uploadBytes, getDownloadURL,
};
