// Test the exact same JSON extraction logic used in symptomChecker.js and asliDawa.js
const text = '```json\n{\n  "urgency": "LOW",\n  "urgencyColor": "green",\n  "urgencyReason": "Common viral symptoms",\n  "possibleConditions": ["Viral Fever", "Common Cold"],\n  "recommendation": "Rest and drink water",\n  "recommendationHindi": "Aaram karo aur paani piyo",\n  "homeRemedies": ["Drink fluids", "Rest"],\n  "warningSigns": ["High fever above 103F"],\n  "shouldSeeDoctor": false,\n  "timeframe": "3 days",\n  "disclaimer": "AI analysis only"\n}\n```';

console.log("=== RAW TEXT ===");
console.log(text);
console.log("\n=== REGEX TEST ===");
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  console.log("MATCH FOUND! Length:", jsonMatch[0].length);
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("PARSE SUCCESS!");
    console.log("urgency:", parsed.urgency);
    console.log("conditions:", parsed.possibleConditions);
    console.log("recommendation:", parsed.recommendation);
  } catch (e) {
    console.log("PARSE FAILED:", e.message);
  }
} else {
  console.log("NO MATCH FOUND!");
}
