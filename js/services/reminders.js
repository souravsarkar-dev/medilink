import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, orderBy } from '../firebase/firestore.js';
import { db } from '../firebase/config.js';
import { COLLECTIONS } from '../utils/constants.js';

export function initReminders(uid, callback) {
  console.log("🔵 [initReminders] called with:", uid);
  const q = query(collection(db, COLLECTIONS.USERS, uid, 'reminders'), orderBy('time'));
  return onSnapshot(q, (snapshot) => {
    const reminders = [];
    snapshot.forEach(doc => reminders.push({ id: doc.id, ...doc.data() }));
    console.log("🟢 [initReminders] Realtime update:", reminders);
    callback(reminders);
  }, error => {
    console.error("🔴 [initReminders] ERROR:", error);
  });
}

export async function addReminder(uid, data) {
  console.log("🔵 [addReminder] called with:", {uid, data});
  const docRef = await addDoc(collection(db, COLLECTIONS.USERS, uid, 'reminders'), data);
  return docRef.id;
}

export async function takeMedicine(uid, reminderId, name) {
  console.log("🔵 [takeMedicine] called with:", {uid, reminderId, name});
  await updateDoc(doc(db, COLLECTIONS.USERS, uid, 'reminders', reminderId), { lastTaken: new Date().toISOString() });
}

export async function removeReminder(uid, reminderId) {
  // Not implemented in this snippet
}

export async function getTodayReminders(uid) {
  return [];
}
