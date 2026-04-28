// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Firebase Authentication
//  Supports: Phone OTP (primary), Google Sign-in (secondary)
// ═══════════════════════════════════════════════════════════════════

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';

import {
  doc, setDoc, getDoc, serverTimestamp, updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

import { auth, db } from './config.js';
import { COLLECTIONS } from '../utils/constants.js';
import { handleError, showErrorToast } from '../utils/errorHandler.js';
import { cacheUserProfile, getCachedUserProfile } from '../utils/offlineCache.js';

// ── Phone OTP Auth ─────────────────────────────────────────────────

let recaptchaVerifier = null;

/**
 * Initialize invisible reCAPTCHA verifier
 * Call this once when the login page loads
 */
export function initRecaptcha(containerId = 'recaptcha-container') {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => { /* reCAPTCHA solved */ },
    'expired-callback': () => {
      console.warn('[Auth] reCAPTCHA expired — reinitializing');
      initRecaptcha(containerId);
    },
  });
  return recaptchaVerifier;
}

/**
 * Send OTP to an Indian phone number
 * @param {string} phoneNumber - Format: +91XXXXXXXXXX
 * @returns {Object} confirmationResult (pass to verifyOTP)
 */
export async function sendPhoneOTP(phoneNumber) {
  try {
    // Normalize Indian phone number
    let normalized = phoneNumber.replace(/\D/g, '');
    if (normalized.length === 10) normalized = '+91' + normalized;
    else if (normalized.length === 12 && normalized.startsWith('91')) normalized = '+' + normalized;
    else if (!normalized.startsWith('+')) normalized = '+' + normalized;

    if (!/^\+91[6-9]\d{9}$/.test(normalized)) {
      throw { code: 'auth/invalid-phone-number' };
    }

    if (!recaptchaVerifier) initRecaptcha();
    const confirmationResult = await signInWithPhoneNumber(auth, normalized, recaptchaVerifier);
    console.log('[Auth] OTP sent to', normalized);
    return confirmationResult;
  } catch (error) {
    const { userMessage } = handleError(error, 'sendPhoneOTP');
    throw new Error(userMessage);
  }
}

/**
 * Verify the OTP code entered by user
 * @param {Object} confirmationResult - From sendPhoneOTP
 * @param {string} otp - 6-digit code
 * @returns {Object} Firebase user object
 */
export async function verifyOTP(confirmationResult, otp) {
  try {
    if (!otp || otp.length !== 6) throw new Error('Please enter the 6-digit OTP.');
    const result = await confirmationResult.confirm(otp);
    const user = result.user;
    await createUserProfileIfNew(user);
    return user;
  } catch (error) {
    const { userMessage } = handleError(error, 'verifyOTP');
    throw new Error(userMessage);
  }
}

// ── Google Sign-In ─────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Sign in with Google popup
 * @returns {Object} Firebase user object
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await createUserProfileIfNew(result.user);
    return result.user;
  } catch (error) {
    const { userMessage } = handleError(error, 'signInWithGoogle');
    throw new Error(userMessage);
  }
}

// ── User Profile ───────────────────────────────────────────────────

/**
 * Create Firestore user document if it doesn't already exist
 */
export async function createUserProfileIfNew(user) {
  const userRef = doc(db, COLLECTIONS.USERS, user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const profile = {
      uid:                      user.uid,
      displayName:              user.displayName || 'MediLink User',
      phone:                    user.phoneNumber || '',
      email:                    user.email || '',
      photoURL:                 user.photoURL || '',
      // Health data
      healthScore:              0,
      totalPoints:              0,
      dayStreak:                0,
      lastActiveDate:           null,
      badges:                   [],
      // Stats
      totalScans:               0,
      scansThisWeek:            0,
      totalSymptomChecks:       0,
      articlesRead:             0,
      clinicSearches:           0,
      fakeReports:              0,
      // Medical profile
      bloodGroup:               '',
      allergies:                [],
      currentMedicines:         [],
      emergencyContacts:        [],
      medicalConditions:        [],
      emergencyProfileComplete: false,
      // App preferences
      preferredLanguage:        'hi',
      fcmToken:                 '',
      notificationsEnabled:     false,
      // Timestamps
      createdAt:                serverTimestamp(),
      lastActive:               serverTimestamp(),
    };

    await setDoc(userRef, profile);
    cacheUserProfile(user.uid, profile);
    console.log('[Auth] New user profile created:', user.uid);
    return profile;
  } else {
    // Update last active
    await updateDoc(userRef, { lastActive: serverTimestamp() });
    const profile = snap.data();
    cacheUserProfile(user.uid, profile);
    return profile;
  }
}

/**
 * Update any fields in the user's Firestore document
 * @param {string} uid - User ID
 * @param {Object} data - Fields to update
 */
export async function updateUserProfile(uid, data) {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, { ...data, lastActive: serverTimestamp() });
    // Invalidate cache
    const cached = getCachedUserProfile(uid);
    if (cached) cacheUserProfile(uid, { ...cached, ...data });
  } catch (error) {
    showErrorToast(error, 'updateUserProfile');
    throw error;
  }
}

/**
 * Get user profile from Firestore (with cache fallback)
 * @param {string} uid
 * @returns {Object|null} User profile data
 */
export async function getUserProfile(uid) {
  // Try cache first (offline support)
  const cached = getCachedUserProfile(uid);
  if (cached && !navigator.onLine) return cached;

  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    if (snap.exists()) {
      const data = snap.data();
      cacheUserProfile(uid, data);
      return data;
    }
    return null;
  } catch (error) {
    // Fallback to cache on network error
    return cached || null;
  }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  try {
    await signOut(auth);
    // Clear sensitive cache on logout
    localStorage.removeItem('medilink_v2_user_' + auth.currentUser?.uid);
    console.log('[Auth] User signed out');
  } catch (error) {
    showErrorToast(error, 'signOut');
  }
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Called with user object (or null)
 * @returns {Function} Unsubscribe function
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current user (synchronous)
 */
export function getCurrentUser() {
  return auth.currentUser;
}
