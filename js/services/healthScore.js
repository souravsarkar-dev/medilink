// ═══════════════════════════════════════════════════════════════════
//  MediLink 2.0 — Health Score & Badges Engine
// ═══════════════════════════════════════════════════════════════════

import { BADGE_DEFINITIONS, SCORE_LEVELS } from '../utils/constants.js';
import { getUser, updateUser, logUserAction } from '../firebase/firestore.js';
import { arrayUnion, updateDoc, doc, db } from '../firebase/firestore.js';
import { COLLECTIONS } from '../utils/constants.js';

// ── Get level from score ───────────────────────────────────────────
export function getScoreLevel(score) {
  return SCORE_LEVELS.find(l => score >= l.min && score <= l.max) || SCORE_LEVELS[0];
}

// ── Progress to next level ─────────────────────────────────────────
export function getLevelProgress(score) {
  const current = getScoreLevel(score);
  const nextLevel = SCORE_LEVELS.find(l => l.min > current.min);
  if (!nextLevel) return { progress: 100, nextLevel: null, pointsNeeded: 0 };
  const range = nextLevel.min - current.min;
  const progress = Math.min(100, Math.round(((score - current.min) / range) * 100));
  return { progress, nextLevel, pointsNeeded: nextLevel.min - score };
}

// ── Check and award new badges ─────────────────────────────────────
export async function checkAndAwardBadges(uid) {
  const user = await getUser(uid);
  if (!user) return [];

  const currentBadges = user.badges || [];
  const newBadges = [];

  // Add derived fields for conditions
  const now = new Date();
  const createdAt = user.createdAt?.toDate?.() || now;
  const createdDaysAgo = Math.floor((now - createdAt) / 86400000);

  const userForCondition = { ...user, createdDaysAgo };

  for (const badgeDef of BADGE_DEFINITIONS) {
    if (!currentBadges.includes(badgeDef.id)) {
      try {
        if (badgeDef.condition(userForCondition)) {
          newBadges.push(badgeDef.id);
        }
      } catch (e) { /* Condition evaluation failed */ }
    }
  }

  // Award new badges
  if (newBadges.length > 0) {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      badges: arrayUnion(...newBadges),
    });

    // Notify user
    newBadges.forEach(badgeId => {
      const def = BADGE_DEFINITIONS.find(b => b.id === badgeId);
      if (def && typeof window.showToast === 'function') {
        window.showToast(`🏅 New badge earned: ${def.icon} ${def.name}!`, 'success', 5000);
      }
    });
  }

  return newBadges;
}

// ── Add points to user ─────────────────────────────────────────────
export async function addPoints(uid, actionType, extraData = {}) {
  const pointsEarned = await logUserAction(uid, actionType, extraData);
  // Check for new badges after every action
  setTimeout(() => checkAndAwardBadges(uid), 500);
  return pointsEarned;
}

// ── Get leaderboard ────────────────────────────────────────────────
export async function fetchLeaderboard() {
  const { getLeaderboard } = await import('../firebase/firestore.js');
  return getLeaderboard(20);
}

// ── Calculate weekly reset ─────────────────────────────────────────
export function shouldResetWeeklyScans(lastResetDate) {
  if (!lastResetDate) return true;
  const daysSinceReset = (Date.now() - lastResetDate.toDate?.()?.getTime?.()) / 86400000;
  return daysSinceReset >= 7;
}

// ── Get badge details for display ─────────────────────────────────
export function getBadgeDetails(badgeIds = []) {
  return BADGE_DEFINITIONS.map(def => ({
    ...def,
    earned: badgeIds.includes(def.id),
  }));
}
