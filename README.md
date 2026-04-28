<div align="center">

<img src="https://img.shields.io/badge/Google%20Hackathon-2026-4285F4?style=for-the-badge&logo=google&logoColor=white" />
<img src="https://img.shields.io/badge/Powered%20By-Gemini%20AI-8E24AA?style=for-the-badge&logo=google&logoColor=white" />
<img src="https://img.shields.io/badge/Built%20With-Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
<img src="https://img.shields.io/badge/Status-Live%20%F0%9F%9F%A2-00C853?style=for-the-badge" />

<br/><br/>

<h1>🏥 MediLink 2.0</h1>
<h3><em>AI-Powered Healthcare Intelligence for 1.4 Billion Indians</em></h3>

<br/>

> **Breaking barriers in rural healthcare access through the power of Gemini AI, real-time data, and zero-cost infrastructure.**

<br/>

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-medilink--488c3.web.app-blue?style=for-the-badge)](https://medilink-488c3.web.app)
[![GitHub Repo](https://img.shields.io/badge/GitHub-souravsarkar--dev%2Fmedilink-181717?style=for-the-badge&logo=github)](https://github.com/souravsarkar-dev/medilink)

<br/>

</div>

---

## 🎯 The Problem We're Solving

<table>
<tr>
<td width="50%">

### 📊 The Crisis
- **65%** of India's population lives in rural areas with **limited healthcare access**
- **10,000+ villages** have no doctor within 5 km
- **₹3,000 Cr** lost annually to counterfeit medicines
- **1 in 3** patients misuse antibiotics due to lack of guidance
- Rural patients travel **50+ km** for basic medical consultations

</td>
<td width="50%">

### 💡 Our Solution
MediLink 2.0 brings an **entire healthcare system** into a single PWA:
- 🤖 Gemini AI diagnoses symptoms in **under 5 seconds**
- 💊 Instantly detects **fake medicines** via camera scan
- 🗺️ Finds **real nearby clinics** using OpenStreetMap
- 👨‍⚕️ AI Telemedicine in **8 Indian languages**
- 📅 Medicine reminders **saved to cloud**, never forgotten

</td>
</tr>
</table>

---

## ✨ Features

<div align="center">

| Feature | Technology | Description |
|---------|-----------|-------------|
| 🔍 **AI Symptom Checker** | Gemini 2.0 Flash | Real-time triage with probabilistic diagnosis |
| 💊 **AsliDawa Scanner** | Gemini Vision API | Camera-based medicine authenticity verification |
| 🗺️ **Clinic Finder** | OpenStreetMap + Gemini | 3-tier fallback: Google Maps → Gemini → OSM |
| 👨‍⚕️ **AI Telemedicine** | Gemini 2.0 Flash | Professional AI medical consultation |
| 📅 **Smart Reminders** | Firebase Firestore | Real-time medicine schedule with cloud sync |
| 📰 **Health Feed** | Gemini AI | Personalized health articles in 8 languages |
| 🏆 **Health Score** | Firebase RTDB | Gamified wellness tracking & leaderboard |
| 🔐 **Auth System** | Firebase Auth | Phone OTP + Google Sign-In |

</div>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MediLink 2.0                              │
│                   Progressive Web Application                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌─────────────┐ ┌──────────┐ ┌────────────────┐
   │  Gemini AI  │ │ Firebase │ │  OpenStreetMap  │
   │  (Primary)  │ │  Suite   │ │  (Free Fallback)│
   └─────────────┘ └──────────┘ └────────────────┘
          │              │              │
    ┌─────┴─────┐  ┌─────┴─────┐  ┌───┴────────┐
    │ Symptom   │  │Firestore  │  │ Overpass   │
    │ Checker   │  │ RTDB      │  │ API        │
    │ AsliDawa  │  │ Auth      │  │ Leaflet.js │
    │ Telemed   │  │ Storage   │  │            │
    └───────────┘  └───────────┘  └────────────┘
```

---

## 🛠️ Tech Stack

<div align="center">

### Frontend
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.0-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

### AI & Backend
![Gemini](https://img.shields.io/badge/Gemini%202.0%20Flash-8E24AA?style=flat-square&logo=google&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase%20v12-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=flat-square&logo=openstreetmap&logoColor=white)

### Infrastructure
![Firebase Hosting](https://img.shields.io/badge/Firebase%20Hosting-FFA000?style=flat-square&logo=firebase&logoColor=white)
![Firestore](https://img.shields.io/badge/Cloud%20Firestore-4285F4?style=flat-square&logo=google-cloud&logoColor=white)
![RTDB](https://img.shields.io/badge/Realtime%20Database-FF6D00?style=flat-square&logo=firebase&logoColor=white)

</div>

---

## 🤖 AI Features Deep Dive

### 1. 🔍 AI Symptom Checker
Uses **Gemini 2.0 Flash** with a medical triage prompt engineered to return:
- **Probabilistic conditions** (e.g., Dengue: 78%, Viral Fever: 45%)
- **Urgency classification** (LOW / MEDIUM / HIGH / EMERGENCY)
- **Home remedies** specific to Indian household resources
- **Warning signs** requiring immediate emergency care
- Bilingual output **(English + Hindi)**

```javascript
// Real probability data from Gemini — never hardcoded
{
  "possibleConditions": [
    {"name": "Dengue Fever", "probability": 78, "reason": "Platelet drop pattern matches"},
    {"name": "Viral Fever",  "probability": 45, "reason": "Seasonal correlation high"}
  ]
}
```

### 2. 💊 AsliDawa — Medicine Authenticity Scanner
- **Camera → Gemini Vision** pipeline for real-time medicine scanning
- Cross-references CDSCO drug database patterns
- Returns: `AUTHENTIC` / `SUSPICIOUS` / `COUNTERFEIT` / `NOT_A_MEDICINE`
- Works on **medicine strips, blister packs, boxes**

### 3. 🗺️ Clinic Finder — 3-Tier Resilient Search
```
Tier 1: Google Places API  ──► (If billing enabled)
    ↓ FAIL
Tier 2: Gemini AI          ──► (Location-aware AI query + exponential backoff)
    ↓ FAIL  
Tier 3: OpenStreetMap      ──► (100% FREE, always works, global coverage)
```
**Result: Users ALWAYS get real hospital data regardless of API status.**

### 4. 👨‍⚕️ AI Telemedicine
- **Context-aware** conversation (remembers last 10 messages)
- Professional **MediLink AI Medical Assistant** persona
- Responds in the patient's language automatically
- Generates structured **AI Notes + Prescription** after consultation
- Saved to **Firebase Firestore** permanently

---

## 📊 Impact Metrics

<div align="center">

| Metric | Value |
|--------|-------|
| 🎯 Target Users | 500M+ rural Indians |
| ⚡ Symptom Analysis Time | < 3 seconds |
| 🌍 Languages Supported | 8 Indian languages |
| 💰 Cost to User | ₹0 (Completely Free) |
| 📱 Device Requirement | Any smartphone with browser |
| 🌐 Works Offline | ✅ (IndexedDB caching) |
| 🔒 Data Security | Firebase + Firestore rules |

</div>

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Firebase CLI
- A Google Cloud account with Gemini API access

### Installation

```bash
# Clone the repository
git clone https://github.com/souravsarkar-dev/medilink.git
cd medilink

# Install dependencies
npm install

# Set up environment variables
cp .env.example js/env-config.js
# Edit js/env-config.js with your API keys

# Start local development server
npx http-server . -p 3000 -c-1
```

Open **http://localhost:3000/app.html**

### Deployment

```bash
# Login to Firebase
npx firebase-tools@latest login

# Deploy to Firebase Hosting
npx firebase-tools@latest deploy --only hosting --project medilink-488c3
```

---

## 🔑 Environment Configuration

Create `js/env-config.js` with the following:

```javascript
const ENV = {
  GEMINI_API_KEY:              'your-gemini-api-key',
  GEMINI_MODEL:                'gemini-2.0-flash',
  GOOGLE_MAPS_API_KEY:         'your-google-maps-api-key',
  FIREBASE_API_KEY:            'your-firebase-api-key',
  FIREBASE_AUTH_DOMAIN:        'your-project.firebaseapp.com',
  FIREBASE_PROJECT_ID:         'your-project-id',
  FIREBASE_STORAGE_BUCKET:     'your-project.appspot.com',
  FIREBASE_MESSAGING_SENDER_ID:'your-sender-id',
  FIREBASE_APP_ID:             'your-app-id',
  FIREBASE_DATABASE_URL:       'https://your-project-rtdb.region.firebasedatabase.app',
};
export default ENV;
```

---

## 📁 Project Structure

```
medilink/
├── 📄 app.html                    # Main application
├── 📄 index.html                  # Landing page
├── 📄 firebase.json               # Firebase config
├── 📄 firestore.rules             # Security rules
│
├── 📂 css/
│   ├── app.css                   # Application styles
│   ├── landing.css               # Landing page styles
│   └── animations.css            # Micro-animations
│
├── 📂 js/
│   ├── app-backend.js            # Main application controller
│   ├── env-config.js             # API keys & environment
│   │
│   ├── 📂 firebase/
│   │   ├── config.js             # Firebase initialization
│   │   ├── auth.js               # Phone OTP + Google Auth
│   │   └── firestore.js          # Database operations
│   │
│   ├── 📂 services/
│   │   ├── symptomChecker.js     # AI triage engine
│   │   ├── asliDawa.js           # Medicine scanner
│   │   ├── clinicFinder.js       # 3-tier clinic search
│   │   ├── telemedicine.js       # AI doctor chat
│   │   ├── reminders.js          # Medicine reminders
│   │   ├── healthFeed.js         # AI health articles
│   │   └── healthScore.js        # Gamification engine
│   │
│   └── 📂 utils/
│       ├── constants.js          # Global constants
│       ├── errorHandler.js       # Error management
│       └── offlineCache.js       # IndexedDB caching
│
└── 📂 images/                    # App assets
```

---

## 🔒 Firebase Security

Firestore rules ensure users can **only access their own data**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null 
                        && request.auth.uid == userId;
    }
  }
}
```

---

## 🌟 What Makes MediLink Different

| Feature | Competitors | MediLink 2.0 |
|---------|------------|---------------|
| Works without internet | ❌ | ✅ (IndexedDB) |
| Hindi/Regional language | ❌ | ✅ (8 languages) |
| Medicine verification | ❌ | ✅ (Camera AI) |
| Free clinic finder | ❌ | ✅ (OSM fallback) |
| Real probability scores | ❌ | ✅ (Gemini AI) |
| Cost to user | $$$ | ₹0 |
| Rural-first design | ❌ | ✅ |

---

## 🏆 Built for Google Hackathon 2026

This project was built as part of the **Google Hackathon 2026**, leveraging:

- **Gemini 2.0 Flash** — Google's most efficient multimodal AI
- **Firebase Suite** — Google's scalable backend infrastructure  
- **Google Maps Platform** — Location intelligence
- **Google Cloud** — Deployment and hosting

### Our Vision
> *"Every person in India, regardless of where they live, deserves access to intelligent healthcare guidance."*

MediLink 2.0 demonstrates how **Google's AI technology** can bridge the healthcare gap for **500 million underserved Indians** — at **zero cost** to the user.

---

## 👨‍💻 Developer

<div align="center">

| | |
|--|--|
| **Developer** | Sourav Sarkar |
| **GitHub** | [@souravsarkar-dev](https://github.com/souravsarkar-dev) |
| **Project** | MediLink 2.0 |
| **Hackathon** | Google Hackathon 2026 |

</div>

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Google Gemini Team** — For the incredible Gemini 2.0 Flash API
- **Firebase Team** — For the scalable, real-time infrastructure
- **OpenStreetMap Community** — For the free, open global map data
- **Leaflet.js** — For the lightweight mapping library

---

<div align="center">

**⭐ Star this repo if MediLink inspires you! ⭐**

Made with ❤️ for 1.4 Billion Indians

[![Live Demo](https://img.shields.io/badge/🚀%20Try%20MediLink%20Now-medilink--488c3.web.app-4285F4?style=for-the-badge)](https://medilink-488c3.web.app)

</div>
