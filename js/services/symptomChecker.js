// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — AI Symptom Checker (Gemini 1.5 Flash)
// ═══════════════════════════════════════════════════════════════════

import ENV from '../env-config.js';
import { GEMINI_BASE_URL } from '../utils/constants.js';
import { saveSymptomCheck } from '../firebase/firestore.js';
import { cacheSymptomResult, getCachedSymptomResult } from '../utils/offlineCache.js';


const SYSTEM_PROMPT = `You are a professional medical triage assistant for MediLink 2.0.
Your goal is to analyze symptoms reported by users in India and provide a realistic, high-fidelity assessment.

Important: You are NOT diagnosing. You are helping the patient understand urgency and potential causes.

Respond ONLY with this JSON (no markdown, no backticks, no extra text):
{
  "urgency": "LOW",
  "urgencyColor": "green",
  "urgencyReason": "Why this urgency level was chosen",
  "possibleConditions": [
    {"name": "Condition 1", "probability": 85, "reason": "Why this matches symptoms"},
    {"name": "Condition 2", "probability": 40, "reason": "Why this matches partially"}
  ],
  "recommendation": "What to do in English",
  "recommendationHindi": "Hindi mein kya karna chahiye",
  "homeRemedies": ["Remedy 1", "Remedy 2", "Remedy 3"],
  "warningSigns": ["Sign that needs emergency care 1", "Sign 2"],
  "shouldSeeDoctor": false,
  "timeframe": "When to see doctor if needed",
  "disclaimer": "This is an AI analysis, not a clinical diagnosis."
}

urgency must be exactly one of: LOW, MEDIUM, HIGH, EMERGENCY
urgencyColor must be: green, yellow, orange, red
probabilities should be realistic based on common medical occurrence.`;


const SMART_FALLBACKS = {
  fever: {
    urgency: 'LOW', urgencyColor: 'green',
    urgencyReason: 'Fever with moderate severity for a short duration is often viral and self-limiting.',
    possibleConditions: ['Viral Fever', 'Common Cold', 'Flu (Influenza)', 'Mild Infection'],
    recommendation: 'Rest well, drink plenty of fluids (water, ORS, coconut water). Take Paracetamol 500mg if temperature exceeds 100°F. Monitor temperature every 4 hours.',
    recommendationHindi: 'आराम करें, खूब पानी पिएं (पानी, ORS, नारियल पानी)। अगर तापमान 100°F से अधिक हो तो पैरासिटामोल 500mg लें।',
    homeRemedies: ['Drink warm water with tulsi leaves', 'Cold compress on forehead', 'Light diet — khichdi, dal rice', 'Rest in a well-ventilated room'],
    warningSigns: ['Fever above 103°F for more than 2 days', 'Rash or bleeding spots on skin', 'Severe body pain with chills', 'Difficulty breathing'],
    shouldSeeDoctor: false, timeframe: 'Visit doctor if fever persists beyond 3 days',
    disclaimer: 'AI-powered triage — not a medical diagnosis. Consult a doctor for persistent symptoms.',
  },
  headache: {
    urgency: 'LOW', urgencyColor: 'green',
    urgencyReason: 'Headache with moderate severity is commonly due to tension or dehydration.',
    possibleConditions: ['Tension Headache', 'Migraine', 'Dehydration', 'Eye Strain'],
    recommendation: 'Rest in a dark, quiet room. Drink water. Take Paracetamol 500mg if needed. Avoid screens for 1 hour.',
    recommendationHindi: 'अंधेरे कमरे में आराम करें। पानी पिएं। जरूरत हो तो पैरासिटामोल लें।',
    homeRemedies: ['Apply balm on temples', 'Drink ginger tea', 'Cold compress on forehead', 'Deep breathing for 5 minutes'],
    warningSigns: ['Sudden severe "thunderclap" headache', 'Headache with stiff neck and fever', 'Vision changes or confusion', 'Headache after head injury'],
    shouldSeeDoctor: false, timeframe: 'Visit doctor if headache persists beyond 48 hours',
    disclaimer: 'AI-powered triage — not a medical diagnosis. Consult a doctor for persistent symptoms.',
  },
  cough: {
    urgency: 'LOW', urgencyColor: 'green',
    urgencyReason: 'Dry or mild cough of short duration is usually viral and self-resolving.',
    possibleConditions: ['Common Cold', 'Upper Respiratory Infection', 'Allergic Rhinitis', 'Post-Nasal Drip'],
    recommendation: 'Steam inhalation 2-3 times daily. Honey with warm water. Avoid cold drinks and dusty environments.',
    recommendationHindi: 'दिन में 2-3 बार भाप लें। गर्म पानी में शहद मिलाकर पिएं। ठंडे पेय और धूल से बचें।',
    homeRemedies: ['Honey with warm water', 'Tulsi and ginger tea', 'Gargle with warm salt water', 'Steam inhalation with eucalyptus'],
    warningSigns: ['Coughing up blood', 'High fever with productive cough', 'Shortness of breath', 'Chest pain while coughing'],
    shouldSeeDoctor: false, timeframe: 'Visit doctor if cough persists beyond 7 days',
    disclaimer: 'AI-powered triage — not a medical diagnosis. Consult a doctor for persistent symptoms.',
  },
  default: {
    urgency: 'MEDIUM', urgencyColor: 'yellow',
    urgencyReason: 'Symptoms assessed with moderate concern. AI recommends monitoring closely.',
    possibleConditions: ['Viral Infection', 'Seasonal Illness', 'Stress-Related Symptoms'],
    recommendation: 'Monitor your symptoms for 24-48 hours. Stay hydrated, rest well, and eat light nutritious food. If symptoms worsen, visit your nearest health center.',
    recommendationHindi: 'अपने लक्षणों पर 24-48 घंटे नजर रखें। हाइड्रेटेड रहें, अच्छी तरह आराम करें। लक्षण बढ़ने पर नजदीकी स्वास्थ्य केंद्र जाएं।',
    homeRemedies: ['Stay well hydrated — drink ORS if needed', 'Rest and avoid strenuous activity', 'Eat light food — dal, rice, khichdi', 'Monitor temperature regularly'],
    warningSigns: ['Fever above 103°F', 'Difficulty breathing or chest pain', 'Persistent vomiting or diarrhoea', 'Confusion or drowsiness'],
    shouldSeeDoctor: true, timeframe: 'Within 24-48 hours if no improvement',
    disclaimer: 'AI-powered triage — not a medical diagnosis. Consult a doctor for persistent symptoms.',
  },
};

function getSmartFallback(symptomsText) {
  const lower = (symptomsText || '').toLowerCase();
  if (lower.includes('fever') || lower.includes('bukhar')) return SMART_FALLBACKS.fever;
  if (lower.includes('headache') || lower.includes('sir dard')) return SMART_FALLBACKS.headache;
  if (lower.includes('cough') || lower.includes('khansi')) return SMART_FALLBACKS.cough;
  return SMART_FALLBACKS.default;
}

/**
 * Call Gemini API with given messages
 */
async function callGemini(allSymptoms, duration, severity) {
  console.log("🔵 [callGemini] called with:", allSymptoms);
  const url = `${GEMINI_BASE_URL}/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nPatient reports these symptoms: ${allSymptoms}\nDuration: ${duration}\nSeverity: ${severity}` }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

  console.log("🟡 [callGemini] calling API with model:", ENV.GEMINI_MODEL);
  
  // Try up to 3 times with backoff for rate limits
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        console.warn(`🟡 [callGemini] Rate limited (429), attempt ${attempt}/3, waiting...`);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error('API rate limit reached. Please wait a minute and try again.');
      }

      if (!res.ok) {
        const errBody = await res.text();
        console.error("🔴 [callGemini] ERROR: API response not ok", res.status, errBody);
        throw new Error(`Gemini API error: ${res.status}`);
      }
      
      const data = await res.json();
      console.log("🟢 [callGemini] API response received");
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Robust: extract JSON object between first { and last }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in Gemini response');
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      if (attempt === 3 || !error.message?.includes('429')) {
        console.error("🔴 [callGemini] ERROR:", error.message);
        throw error;
      }
    }
  }
}

/**
 * Analyze symptoms with Gemini AI
 * @param {string} symptomsText - Symptoms description
 * @param {string} language - User's preferred language code
 * @param {string} duration - How long symptoms lasted ("1 day", "3 days" etc.)
 * @param {string} severity - Self-reported severity ("mild", "moderate", "severe")
 * @param {string|null} uid - User ID for saving to Firestore
 * @returns {Object} Structured analysis result
 */
export async function analyzeSymptoms(symptomsText, language = 'hi', duration = 'unknown', severity = 'moderate', uid = null) {
  console.log("🔵 [analyzeSymptoms] called with:", {symptomsText, language, duration, severity, uid});
  
  if (!symptomsText?.trim()) {
    console.error("🔴 [analyzeSymptoms] ERROR:", "Empty symptoms string");
    throw new Error('Please describe your symptoms before analyzing.');
  }

  // Check offline cache for recent identical query
  const cacheKey = `${symptomsText}-${duration}-${severity}`;
  if (!navigator.onLine) {
    const cached = getCachedSymptomResult();
    if (cached) return { ...cached, fromCache: true };
    return { ...getSmartFallback(symptomsText), fromCache: true, offlineMessage: 'No internet — showing general guidance.' };
  }

  let result;
  try {
    result = await callGemini(symptomsText, duration, severity);
  } catch (firstError) {
    console.warn('[SymptomChecker] First attempt failed, retrying...', firstError.message);
    try {
      await new Promise(r => setTimeout(r, 1500));
      result = await callGemini(symptomsText, duration, severity);
    } catch (secondError) {
      console.error('[SymptomChecker] Both attempts failed:', secondError.message);
      return getSmartFallback(symptomsText);
    }
  }

  // Validate required fields
  if (!result.urgency || !result.possibleConditions) {
    return getSmartFallback(symptomsText);
  }

  // Ensure urgency is uppercase
  result.urgency = result.urgency.toUpperCase();

  // Cache the result
  cacheSymptomResult(result);

  // Save to Firestore if user is logged in
  if (uid) {
    try {
      await saveSymptomCheck(uid, symptomsText, result);
    } catch (e) {
      console.warn('[SymptomChecker] Could not save to Firestore:', e.message);
    }
  }

  return result;
}

/**
 * Get AI-powered home care advice for a specific condition
 */
export async function getHomeCareAdvice(condition, language = 'hi') {
  if (!navigator.onLine) return null;
  try {
    const url = `${GEMINI_BASE_URL}/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
    const prompt = `Provide simple home care advice for "${condition}" suitable for rural India. Give 5 actionable tips in ${language === 'hi' ? 'Hindi' : 'English'}. Reply with JSON array: ["tip1", "tip2", "tip3", "tip4", "tip5"]`;
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const arrMatch = text.match(/\[[\s\S]*\]/);
    return arrMatch ? JSON.parse(arrMatch[0]) : [];
  } catch (e) {
    return null;
  }
}
