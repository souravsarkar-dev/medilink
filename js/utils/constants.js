// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — App-Wide Constants
// ═══════════════════════════════════════════════════════════════════

// ── Health Score Points ───────────────────────────────────────────
export const POINTS = {
  medicine_taken:               10,
  symptom_checked:              10,
  medicine_scanned:             15,
  article_read:                  5,
  water_logged:                  5,
  exercise_logged:              15,
  fake_reported:                50,
  consultation_done:            20,
  emergency_profile_complete:   30,
  streak_bonus_7days:           50,
  streak_bonus_30days:         200,
};

// ── Health Score Levels ───────────────────────────────────────────
export const SCORE_LEVELS = [
  { min: 0,    max: 99,   name: 'Newcomer',   icon: '🌱', color: '#9E9E9E' },
  { min: 100,  max: 299,  name: 'Aware',       icon: '👀', color: '#4CAF50' },
  { min: 300,  max: 499,  name: 'Proactive',   icon: '⚡', color: '#2196F3' },
  { min: 500,  max: 699,  name: 'Guardian',    icon: '⚕️', color: '#9C27B0' },
  { min: 700,  max: 899,  name: 'Expert',      icon: '🏆', color: '#FF9800' },
  { min: 900,  max: Infinity, name: 'HealthHero', icon: '🌟', color: '#F44336' },
];

// ── Badge Definitions ─────────────────────────────────────────────
export const BADGE_DEFINITIONS = [
  { id: 'top_scanner',         name: 'Top Scanner',     icon: '🔍', condition: u => u.scansThisWeek >= 5 },
  { id: 'week_streak',         name: 'Week Streak',     icon: '🔥', condition: u => u.dayStreak >= 7 },
  { id: 'med_guardian',        name: 'Med Guardian',    icon: '💊', condition: u => u.totalScans >= 20 },
  { id: 'symptom_pro',         name: 'Symptom Pro',     icon: '🩺', condition: u => u.totalSymptomChecks >= 10 },
  { id: 'health_reader',       name: 'Health Reader',   icon: '📖', condition: u => u.articlesRead >= 10 },
  { id: 'sos_ready',           name: 'SOS Ready',       icon: '🚨', condition: u => u.emergencyProfileComplete === true },
  { id: 'clinic_finder',       name: 'Clinic Finder',   icon: '🏥', condition: u => u.clinicSearches >= 3 },
  { id: 'community_hero',      name: 'Community Hero',  icon: '🌍', condition: u => u.totalPoints >= 500 },
  { id: 'early_bird',          name: 'Early Bird',      icon: '🌅', condition: u => u.createdDaysAgo <= 7 && u.totalPoints >= 50 },
  { id: 'month_streak',        name: 'Month Streak',    icon: '📅', condition: u => u.dayStreak >= 30 },
  { id: 'fake_buster',         name: 'Fake Buster',     icon: '🕵️', condition: u => u.fakeReports >= 1 },
  { id: 'vaccination_advocate',name: 'Vax Advocate',    icon: '💉', condition: u => u.articlesRead >= 5 && u.totalPoints >= 100 },
];

// ── Urgency Level Config ──────────────────────────────────────────
export const URGENCY = {
  LOW:       { color: '#34A853', bgColor: '#E6F4EA', icon: '✅', label: 'Low Risk' },
  MEDIUM:    { color: '#FBBC04', bgColor: '#FEF7E0', icon: '⚠️', label: 'Moderate Risk' },
  HIGH:      { color: '#EA4335', bgColor: '#FCE8E6', icon: '🔴', label: 'High Risk' },
  EMERGENCY: { color: '#B71C1C', bgColor: '#FFEBEE', icon: '🚨', label: 'EMERGENCY' },
};

// ── Medicine Verdict Config ───────────────────────────────────────
export const VERDICT = {
  AUTHENTIC:       { color: '#34A853', icon: '✓', label: 'AUTHENTIC', bg: '#E6F4EA' },
  SUSPICIOUS:      { color: '#FBBC04', icon: '⚠', label: 'SUSPICIOUS', bg: '#FEF7E0' },
  COUNTERFEIT:     { color: '#EA4335', icon: '✕', label: 'COUNTERFEIT', bg: '#FCE8E6' },
  NOT_IN_DATABASE: { color: '#9E9E9E', icon: '?', label: 'UNKNOWN', bg: '#F5F5F5' },
};

// ── Supported Languages ────────────────────────────────────────────
export const LANGUAGES = [
  { code: 'en', name: 'English',   nativeName: 'English' },
  { code: 'hi', name: 'Hindi',     nativeName: 'हिंदी' },
  { code: 'bn', name: 'Bengali',   nativeName: 'বাংলা' },
  { code: 'ta', name: 'Tamil',     nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu',    nativeName: 'తెలుగు' },
  { code: 'mr', name: 'Marathi',   nativeName: 'मराठी' },
  { code: 'gu', name: 'Gujarati',  nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada',   nativeName: 'ಕನ್ನಡ' },
];

// ── Symptom Quick-Select ───────────────────────────────────────────
export const COMMON_SYMPTOMS = [
  { label: '🌡️ Fever',         value: 'fever' },
  { label: '🤕 Headache',      value: 'headache' },
  { label: '💢 Body Ache',     value: 'body ache' },
  { label: '😷 Cough',         value: 'cough' },
  { label: '🤢 Nausea',        value: 'nausea' },
  { label: '🌊 Diarrhoea',     value: 'diarrhoea' },
  { label: '😴 Fatigue',       value: 'fatigue' },
  { label: '🤧 Rash',          value: 'rash' },
  { label: '❤️‍🔥 Chest Pain',  value: 'chest pain', sos: true },
  { label: '😮‍💨 Breathlessness', value: 'breathlessness', sos: true },
];

// ── Firestore Collection Names ─────────────────────────────────────
export const COLLECTIONS = {
  USERS:            'users',
  SCANS:            'scans',
  FAKE_REPORTS:     'fakeReports',
  CONSULTATIONS:    'consultations',
  HEALTH_ARTICLES:  'healthArticles',
  MEDICINES:        'medicines',
  COMMUNITY:        'community',
};

// ── Emergency Numbers ──────────────────────────────────────────────
export const EMERGENCY_NUMBERS = [
  { number: '108', label: 'Ambulance',       icon: '🚑' },
  { number: '102', label: 'Maternal Health', icon: '👶' },
  { number: '104', label: 'Medical Helpline',icon: '🏥' },
  { number: '100', label: 'Police',          icon: '🚓' },
  { number: '1800-180-1104', label: 'Poison Control', icon: '☠️' },
];

// ── Gemini API Endpoints ───────────────────────────────────────────
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
