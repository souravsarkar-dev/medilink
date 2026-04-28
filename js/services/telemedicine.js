// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Telemedicine (Firebase RTDB Realtime Chat)
// ═══════════════════════════════════════════════════════════════════

import { rtdb } from '../firebase/config.js';
import { ref, push, onValue, off, set, serverTimestamp as rtdbTimestamp }
  from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { createConsultation, endConsultation, savePrescription } from '../firebase/firestore.js';
import ENV from '../env-config.js';
import { GEMINI_BASE_URL } from '../utils/constants.js';
import { cacheTranslation, getCachedTranslation } from '../utils/offlineCache.js';

// ── Active session ────────────────────────────────────────────────
let activeConsultationId = null;

/**
 * Start a new telemedicine consultation
 */
export async function startConsultation(patientId, reason) {
  const consultationId = await createConsultation(patientId, reason);
  activeConsultationId = consultationId;

  // Initialize RTDB chat node
  const chatRef = ref(rtdb, `consultations/${consultationId}/metadata`);
  await set(chatRef, {
    patientId,
    reason,
    startedAt: rtdbTimestamp(),
    status: 'active',
  });

  return consultationId;
}

/**
 * Send a text message in consultation
 */
export async function sendMessage(consultationId, text, senderId, senderType = 'patient') {
  if (!text?.trim()) return;
  const msgRef = ref(rtdb, `consultations/${consultationId}/messages`);
  return push(msgRef, {
    text: text.trim(),
    senderId,
    senderType,
    type: 'text',
    timestamp: rtdbTimestamp(),
    read: false,
  });
}

/**
 * Send an image message
 */
export async function sendImageMessage(consultationId, imageBase64, senderId) {
  try {
    const { storage } = await import('../firebase/config.js');
    const { ref: storageRef, uploadString, getDownloadURL }
      = await import('https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js');

    const imgRef = storageRef(storage, `consultations/${consultationId}/${Date.now()}.jpg`);
    await uploadString(imgRef, imageBase64, 'base64', { contentType: 'image/jpeg' });
    const url = await getDownloadURL(imgRef);

    const msgRef = ref(rtdb, `consultations/${consultationId}/messages`);
    return push(msgRef, {
      imageURL: url,
      senderId,
      senderType: 'patient',
      type: 'image',
      timestamp: rtdbTimestamp(),
      read: false,
    });
  } catch (e) {
    console.error('[Telemedicine] Image upload failed:', e);
    throw new Error('Could not send image. Please try again.');
  }
}

/**
 * Listen to messages in real-time
 * @returns {Function} Unsubscribe function
 */
export function listenToMessages(consultationId, callback) {
  const msgRef = ref(rtdb, `consultations/${consultationId}/messages`);
  const handler = snapshot => {
    const messages = [];
    snapshot.forEach(child => {
      messages.push({ id: child.key, ...child.val() });
    });
    callback(messages);
  };
  onValue(msgRef, handler);
  return () => off(msgRef, 'value', handler);
}

/**
 * Translate medical conversation text using Gemini
 */
export async function translateMessage(text, targetLanguage = 'hi') {
  if (!text || !navigator.onLine) return text;

  // Check cache first (avoid repeated API calls)
  const cached = getCachedTranslation(text, targetLanguage);
  if (cached) return cached;

  const langNames = { hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', en: 'English' };
  const lang = langNames[targetLanguage] || targetLanguage;

  try {
    const url = `${GEMINI_BASE_URL}/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
    const body = {
      contents: [{
        role: 'user',
        parts: [{ text: `Translate this medical conversation to ${lang}. Keep medical terms accurate. Reply with ONLY the translation, no explanation:\n\n"${text}"` }],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    const translation = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;

    cacheTranslation(text, targetLanguage, translation);
    return translation;
  } catch (e) {
    console.warn('[Telemedicine] Translation failed:', e.message);
    return text; // Return original on failure
  }
}

/**
 * Generate AI doctor response (simulated AI consultant)
 */
export async function generateAIResponse(patientMessage, conversationHistory = []) {
  if (!navigator.onLine) {
    return 'I understand. Please tell me more about your symptoms. I am currently operating in offline mode.';
  }

  try {
    const url = `${GEMINI_BASE_URL}/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
    
    // Maintain more history for better context (last 10 messages)
    const history = conversationHistory.slice(-10).map(m => ({
      role: m.senderType === 'patient' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const body = {
      system_instruction: {
        parts: [{ text: `You are the MediLink AI Medical Assistant, a professional, empathetic, and highly knowledgeable digital doctor helping patients in India. 
        
        YOUR ROLE:
        1. Ask targeted follow-up questions (one at a time) to understand the symptoms better.
        2. Provide evidence-based medical information, not just generic advice.
        3. Use a tone that is professional yet accessible.
        4. If symptoms sound severe (chest pain, severe bleeding, etc.), immediately advise the patient to go to the nearest emergency room.
        5. Keep responses professional and under 80 words.
        6. Always respond in the SAME LANGUAGE the patient is using (Hindi, English, etc.).
        7. DO NOT use a fake human name like "Anamika". You are the MediLink AI Assistant.` }],
      },
      contents: [
        ...history,
        { role: 'user', parts: [{ text: patientMessage }] },
      ],
      generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
    };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Please describe your symptoms in more detail so I can assist you better.';
  } catch (e) {
    console.error('[Telemedicine] AI Response Error:', e);
    return 'I am processing your information. In the meantime, please ensure you are resting and staying hydrated. Are you experiencing any dizziness or high fever?';
  }
}

/**
 * Generate AI medical notes from conversation
 */
export async function generateAINotes(messages, patientName = 'Patient') {
  if (!navigator.onLine) return null;

  const conversation = messages
    .filter(m => m.type === 'text')
    .map(m => `${m.senderType === 'patient' ? 'Patient' : 'Doctor'}: ${m.text}`)
    .join('\n');

  try {
    const url = `${GEMINI_BASE_URL}/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
    const prompt = `Based on this telemedicine consultation, generate structured medical notes in JSON:\n\n${conversation}\n\nJSON format:\n{"chiefComplaint": "", "history": "", "probableDiagnosis": [""], "redFlags": [], "plan": "", "followUp": "", "prescribedMedicines": [{"name": "", "dose": "", "duration": ""}]}`;

    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    return null;
  }
}

/**
 * End consultation and save to Firestore
 */
export async function closeConsultation(consultationId, uid, notes = null) {
  await endConsultation(consultationId, uid);
  if (notes) {
    await savePrescription(consultationId, notes);
  }
  activeConsultationId = null;
}

export { activeConsultationId };
