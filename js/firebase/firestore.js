// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Firestore CRUD Helpers
// ═══════════════════════════════════════════════════════════════════

import {
  doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, increment, arrayUnion, GeoPoint,
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';

import { db } from './config.js';
import { COLLECTIONS, POINTS } from '../utils/constants.js';

// ── Action Logger (updates score + logs action) ────────────────────
export async function logUserAction(uid, actionType, extraData = {}) {
  const points = POINTS[actionType] || 0;
  await addDoc(collection(db, COLLECTIONS.USERS, uid, 'actions'), {
    type: actionType, points, ...extraData, timestamp: serverTimestamp(),
  });
  if (points > 0) {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      totalPoints: increment(points),
      healthScore: increment(points),
      lastActive: serverTimestamp(),
    });
  }
  return points;
}

// ── User Helpers ───────────────────────────────────────────────────
export async function getUser(uid) {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function updateUser(uid, data) {
  return updateDoc(doc(db, COLLECTIONS.USERS, uid), { ...data, lastActive: serverTimestamp() });
}
export function listenToUser(uid, callback) {
  return onSnapshot(doc(db, COLLECTIONS.USERS, uid), snap => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
}

// ── Streak ─────────────────────────────────────────────────────────
export async function updateDayStreak(uid) {
  const user = await getUser(uid);
  if (!user) return 0;
  const now = new Date();
  const today = now.toDateString();
  const lastDate = user.lastActiveDate?.toDate?.()?.toDateString?.() || null;
  if (lastDate === today) return user.dayStreak;
  const yesterday = new Date(now - 86400000).toDateString();
  const newStreak = lastDate === yesterday ? (user.dayStreak || 0) + 1 : 1;
  const updates = { dayStreak: newStreak, lastActiveDate: serverTimestamp() };
  if (newStreak === 7) updates.totalPoints = increment(POINTS.streak_bonus_7days);
  if (newStreak === 30) updates.totalPoints = increment(POINTS.streak_bonus_30days);
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), updates);
  return newStreak;
}

// ── Symptom History ────────────────────────────────────────────────
export async function saveSymptomCheck(uid, symptoms, result) {
  const docRef = await addDoc(collection(db, COLLECTIONS.USERS, uid, 'symptomHistory'), {
    symptoms, result, urgency: result.urgency, timestamp: serverTimestamp(),
  });
  await logUserAction(uid, 'symptom_checked');
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { totalSymptomChecks: increment(1) });
  return docRef.id;
}
export async function getSymptomHistory(uid, limitCount = 10) {
  const q = query(collection(db, COLLECTIONS.USERS, uid, 'symptomHistory'), orderBy('timestamp', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Scans ──────────────────────────────────────────────────────────
export async function saveScanResult(uid, scanData) {
  const docRef = await addDoc(collection(db, COLLECTIONS.SCANS), {
    userId: uid, ...scanData, timestamp: serverTimestamp(), reported: false,
  });
  await addDoc(collection(db, COLLECTIONS.USERS, uid, 'scans'), {
    scanId: docRef.id, medicineName: scanData.medicineName,
    verdict: scanData.verdict, timestamp: serverTimestamp(),
  });
  await logUserAction(uid, 'medicine_scanned');
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { totalScans: increment(1), scansThisWeek: increment(1) });
  return docRef.id;
}
export async function getRecentScans(uid, limitCount = 10) {
  const q = query(collection(db, COLLECTIONS.USERS, uid, 'scans'), orderBy('timestamp', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Reminders ─────────────────────────────────────────────────────
export async function createReminder(uid, data) {
  const docRef = await addDoc(collection(db, COLLECTIONS.USERS, uid, 'reminders'), { ...data, active: true, createdAt: serverTimestamp() });
  return docRef.id;
}
export function listenToReminders(uid, callback) {
  const q = query(collection(db, COLLECTIONS.USERS, uid, 'reminders'), where('active', '==', true));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function markReminderTaken(uid, reminderId) {
  await addDoc(collection(db, COLLECTIONS.USERS, uid, 'reminderLogs'), { reminderId, takenAt: serverTimestamp() });
  await logUserAction(uid, 'medicine_taken');
  await updateDayStreak(uid);
}
export async function deactivateReminder(uid, reminderId) {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid, 'reminders', reminderId), { active: false });
}

// ── Articles ───────────────────────────────────────────────────────
export async function getArticles(category = null, limitCount = 20) {
  let constraints = [where('active', '==', true), orderBy('publishedAt', 'desc'), limit(limitCount)];
  if (category) constraints.splice(1, 0, where('category', '==', category));
  const q = query(collection(db, COLLECTIONS.HEALTH_ARTICLES), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function markArticleRead(uid, articleId) {
  const logRef = collection(db, COLLECTIONS.USERS, uid, 'articlesRead');
  const existing = await getDocs(query(logRef, where('articleId', '==', articleId)));
  if (existing.empty) {
    await addDoc(logRef, { articleId, readAt: serverTimestamp() });
    await logUserAction(uid, 'article_read');
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { articlesRead: increment(1) });
  }
}

// ── Fake Reports ───────────────────────────────────────────────────
export async function createFakeReport(uid, scanId, location, notes) {
  const docRef = await addDoc(collection(db, COLLECTIONS.FAKE_REPORTS), {
    userId: uid, scanId,
    location: location ? new GeoPoint(location.lat, location.lng) : null,
    notes: notes || '', status: 'pending', timestamp: serverTimestamp(),
  });
  if (scanId) await updateDoc(doc(db, COLLECTIONS.SCANS, scanId), { reported: true });
  await logUserAction(uid, 'fake_reported');
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { fakeReports: increment(1) });
  return docRef.id;
}

// ── Consultations ──────────────────────────────────────────────────
export async function createConsultation(patientId, reason) {
  const docRef = await addDoc(collection(db, COLLECTIONS.CONSULTATIONS), {
    patientId, doctorId: 'ai_assistant', reason,
    status: 'active', startTime: serverTimestamp(), prescription: null,
  });
  return docRef.id;
}
export async function endConsultation(consultationId, uid) {
  await updateDoc(doc(db, COLLECTIONS.CONSULTATIONS, consultationId), { status: 'completed', endTime: serverTimestamp() });
  await logUserAction(uid, 'consultation_done');
}
export async function savePrescription(consultationId, prescriptionData) {
  await updateDoc(doc(db, COLLECTIONS.CONSULTATIONS, consultationId), {
    prescription: { ...prescriptionData, savedAt: serverTimestamp() },
  });
}

// ── Leaderboard ────────────────────────────────────────────────────
export async function getLeaderboard(limitCount = 20) {
  const q = query(collection(db, COLLECTIONS.USERS), orderBy('healthScore', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => ({
    rank: i + 1, uid: d.id,
    name: d.data().displayName || 'Anonymous',
    score: d.data().healthScore || 0,
    streak: d.data().dayStreak || 0,
  }));
}

// ── Emergency Profile ──────────────────────────────────────────────
export async function updateEmergencyProfile(uid, data) {
  const complete = !!(data.bloodGroup && data.emergencyContacts?.length > 0);
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { ...data, emergencyProfileComplete: complete });
  if (complete) await logUserAction(uid, 'emergency_profile_complete');
}

export { doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, increment, arrayUnion, db };
