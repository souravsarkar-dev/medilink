// End-to-end test of the EXACT code path used in the webapp
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY. Set it before running this script.');
}
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

async function testSymptomChecker() {
  console.log("========== TEST 1: SYMPTOM CHECKER ==========");
  const SYSTEM_PROMPT = `You are a medical triage assistant for rural India.
Respond ONLY with this JSON (no markdown, no backticks, no extra text):
{"urgency":"LOW","urgencyColor":"green","urgencyReason":"reason","possibleConditions":["c1","c2"],"recommendation":"rec","recommendationHindi":"hindi","homeRemedies":["r1"],"warningSigns":["w1"],"shouldSeeDoctor":false,"timeframe":"when","disclaimer":"AI only"}
urgency must be exactly one of: LOW, MEDIUM, HIGH, EMERGENCY`;

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nPatient reports these symptoms: Fever, Headache\nDuration: 1-2 days\nSeverity: Moderate` }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    console.log("API Status:", res.status, res.ok ? "OK" : "FAILED");
    
    if (!res.ok) {
      const errBody = await res.text();
      console.log("ERROR BODY:", errBody);
      return;
    }
    
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log("RAW RESPONSE:", text.substring(0, 200) + "...");
    
    // THIS IS THE EXACT CODE FROM symptomChecker.js
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { console.log("FAIL: No JSON found"); return; }
    const result = JSON.parse(jsonMatch[0]);
    console.log("SUCCESS! urgency:", result.urgency, "conditions:", result.possibleConditions?.join(', '));
  } catch (e) {
    console.log("EXCEPTION:", e.message);
  }
}

async function testAsliDawa() {
  console.log("\n========== TEST 2: ASLIDAWA (text-only, no image) ==========");
  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: `You are a pharmaceutical packaging expert. If barcode is 8904131401010, treat it as Authentic Paracetamol. Respond ONLY with JSON: {"verdict":"AUTHENTIC","confidence":85,"medicineName":"Paracetamol","genericName":"Acetaminophen","manufacturer":"Cipla","batchFormat":"Batch A123","regNo":"CDSCO-123","positiveIndicators":["clear print"],"suspiciousIndicators":[],"recommendation":"Safe to consume","analysisNote":"Authentic medicine"}` }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    console.log("API Status:", res.status, res.ok ? "OK" : "FAILED");
    
    if (!res.ok) {
      const errBody = await res.text();
      console.log("ERROR BODY:", errBody);
      return;
    }
    
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log("RAW RESPONSE:", text.substring(0, 200) + "...");
    
    // THIS IS THE EXACT CODE FROM asliDawa.js
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { console.log("FAIL: No JSON found"); return; }
    const result = JSON.parse(jsonMatch[0]);
    console.log("SUCCESS! verdict:", result.verdict, "medicine:", result.medicineName, "confidence:", result.confidence);
  } catch (e) {
    console.log("EXCEPTION:", e.message);
  }
}

(async () => {
  await testSymptomChecker();
  await testAsliDawa();
  console.log("\n========== ALL TESTS DONE ==========");
})();
