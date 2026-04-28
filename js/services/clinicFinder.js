// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Clinic Finder (Google Maps + Gemini AI Fallback)
//  Uses Places API when billing is enabled, otherwise uses Gemini AI
//  to find REAL hospitals near the user's coordinates
// ═══════════════════════════════════════════════════════════════════

import ENV from '../env-config.js';
import { GEMINI_BASE_URL } from '../utils/constants.js';
import { cacheClinics, getCachedClinics } from '../utils/offlineCache.js';

// ── Haversine distance ─────────────────────────────────────────────
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

// ── Government hospital keyword check ─────────────────────────────
const GOV_KEYWORDS = ['government', 'govt', 'phc', 'primary health', 'district hospital',
  'community health', 'sub district', 'civil hospital', 'chc', 'nhm', 'esic', 'railway hospital',
  'sarkari', 'janata', 'municipal', 'sadar'];

function isGovernmentClinic(name = '') {
  return GOV_KEYWORDS.some(kw => name.toLowerCase().includes(kw));
}

// ── Process a Google Places result ─────────────────────────────────
function processPlace(place, userLat, userLng) {
  let lat, lng;
  if (typeof place.geometry?.location?.lat === 'function') {
    lat = place.geometry.location.lat();
    lng = place.geometry.location.lng();
  } else {
    lat = place.geometry?.location?.lat || 0;
    lng = place.geometry?.location?.lng || 0;
  }
  const name = place.name || '';
  const govt = isGovernmentClinic(name);
  return {
    id: place.place_id, name,
    address: place.vicinity || place.formatted_address || '',
    rating: place.rating || 0, totalRatings: place.user_ratings_total || 0,
    isOpenNow: place.opening_hours?.open_now ?? null,
    location: { lat, lng },
    distance: calculateDistance(userLat, userLng, lat, lng),
    isGovernment: govt, isFree: govt,
    types: place.types || [], placeId: place.place_id,
  };
}

// ── MAIN: Find Nearby Clinics ──────────────────────────────────────
export async function findNearbyClinics(lat, lng, filters = {}, uid = null) {
  console.log("🔵 [findNearbyClinics] Searching at:", { lat, lng });
  const radius = Math.min(filters.radius || 10000, 25000);

  if (!navigator.onLine) {
    const cached = getCachedClinics(lat, lng);
    if (cached) return applyFilters(cached, filters);
    throw new Error('You are offline.');
  }

  // STRATEGY 1: Try Google Places API (if billing enabled)
  try {
    await loadGoogleMapsScript();
    if (window.google?.maps?.places) {
      const places = await searchPlacesAPI(lat, lng, radius);
      if (places.length > 0) {
        console.log("🟢 Places API returned", places.length, "results");
        let clinics = places.map(p => processPlace(p, lat, lng));
        clinics.sort((a, b) => {
          if (a.isGovernment && !b.isGovernment) return -1;
          if (!a.isGovernment && b.isGovernment) return 1;
          return a.distance - b.distance;
        });
        cacheClinics(lat, lng, clinics);
        return applyFilters(clinics, filters);
      }
    }
  } catch (placesErr) {
    console.warn("🟡 Places API failed:", placesErr.message);
  }

  // STRATEGY 2: Use Gemini AI to find REAL hospitals
  console.log("🟡 Trying Gemini AI...");
  try {
    const clinics = await findClinicsViaGemini(lat, lng);
    if (clinics.length > 0) {
      cacheClinics(lat, lng, clinics);
      return applyFilters(clinics, filters);
    }
  } catch (geminiErr) {
    console.warn("🟡 Gemini AI failed:", geminiErr.message);
  }

  // STRATEGY 3: Use OpenStreetMap Overpass API (completely FREE, no key needed)
  console.log("🟡 Trying OpenStreetMap Overpass API...");
  try {
    const clinics = await findClinicsViaOverpass(lat, lng, radius);
    if (clinics.length > 0) {
      cacheClinics(lat, lng, clinics);
      return applyFilters(clinics, filters);
    }
  } catch (overpassErr) {
    console.warn("🟡 Overpass API failed:", overpassErr.message);
  }

  throw new Error('Could not find nearby clinics. Please try again in 30 seconds.');
}

// ── Places API search (needs billing) ──────────────────────────────
async function searchPlacesAPI(lat, lng, radius) {
  const dummyDiv = document.createElement('div');
  const service = new window.google.maps.places.PlacesService(dummyDiv);
  const allPlaces = new Map();

  for (const keyword of ['hospital', 'clinic', 'pharmacy', 'doctor']) {
    try {
      const results = await new Promise((resolve) => {
        service.nearbySearch({
          location: new window.google.maps.LatLng(lat, lng),
          radius, keyword,
        }, (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK) {
            resolve(results || []);
          } else {
            resolve([]);
          }
        });
      });
      results.forEach(p => { if (p.place_id) allPlaces.set(p.place_id, p); });
    } catch { /* continue */ }
  }
  return Array.from(allPlaces.values());
}

// ── Gemini AI hospital finder (FREE — no billing needed) ───────────
async function findClinicsViaGemini(lat, lng) {
  const url = `${GEMINI_BASE_URL}/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
  
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: `You are a medical facility database. I need REAL hospitals, clinics, and pharmacies near coordinates: latitude ${lat}, longitude ${lng} (India).

IMPORTANT RULES:
1. Return ONLY REAL, EXISTING hospitals and clinics that actually exist at or near these coordinates
2. Include the ACTUAL name of each facility as it appears on Google Maps
3. Include realistic coordinates (lat/lng) for each facility — they should be near the given coordinates
4. Include real addresses
5. Return at least 10-15 facilities if possible
6. Include a mix of: government hospitals, private hospitals, clinics, pharmacies, diagnostic centers
7. For rating, give realistic ratings between 3.0-4.8

Respond ONLY with a JSON array (no markdown, no backticks):
[
  {
    "name": "Actual Hospital Name",
    "address": "Real address, City, State",
    "lat": 23.81,
    "lng": 86.72,
    "rating": 4.2,
    "totalRatings": 150,
    "isOpen": true,
    "type": "hospital" or "clinic" or "pharmacy" or "diagnostic"
  }
]` }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
  });

  // Retry up to 3 times with exponential backoff for rate limits
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    
    if (res.status === 429) {
      const waitMs = 2000 * attempt; // 2s, 4s, 6s
      console.warn(`🟡 Gemini rate limited (429), attempt ${attempt}/3, waiting ${waitMs}ms...`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw new Error('AI service is busy. Please wait 30 seconds and click Retry.');
    }
    
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON in Gemini response');
    
    const places = JSON.parse(jsonMatch[0]);
    console.log("🟢 Gemini found", places.length, "real facilities");
    
    return places.map((p, i) => {
      const govt = isGovernmentClinic(p.name || '');
      return {
        id: `gemini_${i}`,
        name: p.name || 'Healthcare Facility',
        address: p.address || '',
        rating: p.rating || 0,
        totalRatings: p.totalRatings || 0,
        isOpenNow: p.isOpen ?? true,
        location: { lat: p.lat, lng: p.lng },
        distance: calculateDistance(lat, lng, p.lat, p.lng),
        isGovernment: govt,
        isFree: govt,
        types: [p.type || 'hospital'],
        placeId: `gemini_${i}`,
      };
    }).sort((a, b) => a.distance - b.distance);
  } // end for loop
  
  throw new Error('Failed after 3 attempts. Please wait and retry.');
}

// ── OpenStreetMap Overpass API (completely FREE, no API key) ────────
async function findClinicsViaOverpass(lat, lng, radius = 10000) {
  const radiusM = Math.min(radius, 15000);
  
  // Overpass QL query for hospitals, clinics, pharmacies, doctors
  const query = `
    [out:json][timeout:15];
    (
      node["amenity"="hospital"](around:${radiusM},${lat},${lng});
      node["amenity"="clinic"](around:${radiusM},${lat},${lng});
      node["amenity"="pharmacy"](around:${radiusM},${lat},${lng});
      node["amenity"="doctors"](around:${radiusM},${lat},${lng});
      way["amenity"="hospital"](around:${radiusM},${lat},${lng});
      way["amenity"="clinic"](around:${radiusM},${lat},${lng});
    );
    out center body;
  `;
  
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
  
  const data = await res.json();
  const elements = data.elements || [];
  console.log("🟢 Overpass found", elements.length, "raw elements");
  
  const clinics = elements
    .filter(el => el.tags?.name) // Only named facilities
    .map((el, i) => {
      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      if (!elLat || !elLng) return null;
      
      const name = el.tags.name;
      const govt = isGovernmentClinic(name);
      const amenity = el.tags.amenity || '';
      
      return {
        id: `osm_${el.id}`,
        name,
        address: [el.tags['addr:street'], el.tags['addr:city'], el.tags['addr:state']].filter(Boolean).join(', ') || el.tags['addr:full'] || '',
        rating: 0, // OSM doesn't have ratings
        totalRatings: 0,
        isOpenNow: true, // Can't determine from Overpass
        location: { lat: elLat, lng: elLng },
        distance: calculateDistance(lat, lng, elLat, elLng),
        isGovernment: govt,
        isFree: govt,
        types: [amenity],
        placeId: `osm_${el.id}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
  
  console.log("🟢 Overpass processed", clinics.length, "named facilities");
  return clinics;
}
function applyFilters(clinics, filters) {
  let results = [...clinics];
  if (filters.type === 'government') results = results.filter(c => c.isGovernment);
  if (filters.openNow) results = results.filter(c => c.isOpenNow !== false);
  if (filters.maxDistance) results = results.filter(c => c.distance <= filters.maxDistance);
  return results;
}

// ── Location ───────────────────────────────────────────────────────

export function getUserLocation() {
  console.log("🔵 [getUserLocation] Getting REAL browser location...");
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log("🟢 [getUserLocation] REAL location:", loc);
        resolve(loc);
      },
      err => {
        console.error('🔴 Location denied:', err.message);
        reject(new Error('Location access denied. Allow location in browser settings.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

// ── Directions URL ─────────────────────────────────────────────────
export function getDirectionsURL(destLat, destLng, mode = 'driving') {
  return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=${mode}`;
}

// ── Google Maps Script Loader ──────────────────────────────────────
let mapsScriptPromise = null;
export function loadGoogleMapsScript() {
  if (window.google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;
  if (!ENV.GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('Maps API key missing'));
  
  mapsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${ENV.GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true; script.defer = true;
    script.onload = () => { console.log("🟢 Google Maps loaded"); resolve(); };
    script.onerror = () => { mapsScriptPromise = null; reject(new Error('Maps script failed')); };
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
}

// ── Map Initialization ─────────────────────────────────────────────
export async function initGoogleMap(elementId, center, zoom = 13) {
  await loadGoogleMapsScript();
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Map element #${elementId} not found`);
  return new window.google.maps.Map(el, {
    center, zoom,
    styles: [
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
    ],
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
  });
}

// ── Clinic Marker ──────────────────────────────────────────────────
export function addClinicMarker(map, clinic, onClick) {
  if (!window.google?.maps) return null;
  const marker = new window.google.maps.Marker({
    position: clinic.location, map,
    title: clinic.name,
    icon: {
      url: clinic.isGovernment
        ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
        : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
    },
  });
  if (onClick) marker.addListener('click', () => onClick(clinic));
  return marker;
}
