'use strict';

/**
 * scoreTransit.js
 *
 * AstroBrain scoring system — computes a `finalScore` for each transit based on
 * strength, aspect type, moon phase, signal density, combo boosts, user preferences,
 * intent, clarity, and noise. No machine learning required.
 *
 * Public API:
 *   scoreTransit(day, transit, context)  → { finalScore, breakdown }
 *   rankDayTransits(day, context)        → sorted array of scored transits
 *   labelScore(score)                    → semantic label string
 */

// ─── WEIGHT TABLES ────────────────────────────────────────────────────────────

const STRENGTH_BASE_SCORE = {
  very_strong: 10,
  strong:       7,
  medium:       4,
  soft:         2,
};

const ASPECT_PRIORITY_SCORE = {
  conjunction: 5,
  square:      4,
  opposition:  4,
  trine:       3,
  sextile:     2,
};

const MOON_PHASE_SCORE = {
  'New Moon':       6,
  'Full Moon':      6,
  'First Quarter':  4,
  'Last Quarter':   4,
  'Waxing Crescent': 2,
  'Waxing Gibbous':  2,
  'Waning Gibbous':  2,
  'Waning Crescent': 3,
};

// ─── COMBO BOOST TABLE ────────────────────────────────────────────────────────
// Each entry: { phase, transitKey, boost }
// Extend this array to add new combo rules without touching core logic.

const COMBO_BOOST_TABLE = [
  { phase: 'New Moon',        transitKey: 'sun_conjunction_moon',  boost: 5 },
  { phase: 'Last Quarter',    transitKey: 'moon_square_venus',     boost: 3 },
  { phase: 'Waning Crescent', transitKey: 'moon_sextile_saturn',   boost: 2 },
];

// ─── DEFAULT USER PROFILE ─────────────────────────────────────────────────────
// Fixed preference profile for immediate use.
// Replace or extend via the `userProfile` argument in context.

const DEFAULT_USER_PROFILE = {
  preferredAspects: {
    conjunction:  2,
    square:       2,
    opposition:   1,
    trine:        0,
    sextile:     -1,
  },
  preferredPlanets: {
    Moon:    2,
    Mercury: 2,
    Mars:    1,
    Venus:   1,
  },
  preferredSignals: {
    introspeccion:    2,
    revision:         2,
    cierre:           1,
    impulso_emocional: 1,
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Returns the base strength score for a transit.
 *
 * @param {object} transit
 * @returns {number}
 */
function getBaseStrengthScore(transit) {
  const strength = transit.strength || 'soft';
  return STRENGTH_BASE_SCORE[strength] || 0;
}

/**
 * Returns the aspect priority score for a transit.
 *
 * @param {object} transit
 * @returns {number}
 */
function getAspectPriorityScore(transit) {
  const aspect = (transit.aspect || '').toLowerCase();
  return ASPECT_PRIORITY_SCORE[aspect] || 0;
}

/**
 * Returns the moon phase score for the given day.
 *
 * @param {object} day - { moonPhase: { phaseName?, phase? } }
 * @returns {number}
 */
function getMoonPhaseScore(day = {}) {
  const moonPhase = day.moonPhase || {};
  const phaseName = moonPhase.phaseName || moonPhase.phase || '';
  return MOON_PHASE_SCORE[phaseName] || 0;
}

/**
 * Returns the signal density score.
 * Each active signal adds 0.5 points, capped at 5.
 *
 * @param {Array} activeSignals
 * @returns {number}
 */
function getSignalDensityScore(activeSignals = []) {
  return Math.min(activeSignals.length * 0.5, 5);
}

/**
 * Derives the canonical transit key (e.g. "moon_square_venus").
 *
 * @param {object} transit
 * @returns {string}
 */
function getTransitKey(transit) {
  return [
    (transit.planet || '').toLowerCase(),
    (transit.aspect || '').toLowerCase(),
    (transit.target || '').toLowerCase(),
  ].join('_');
}

/**
 * Returns the combo boost for a day + transit combination.
 * Matches against COMBO_BOOST_TABLE; multiple rules can stack.
 *
 * @param {object} day
 * @param {object} transit
 * @returns {number}
 */
function getComboBoost(day = {}, transit = {}) {
  const moonPhase  = day.moonPhase || {};
  const phaseName  = moonPhase.phaseName || moonPhase.phase || '';
  const transitKey = getTransitKey(transit);

  let boost = 0;
  for (const rule of COMBO_BOOST_TABLE) {
    if (rule.phase === phaseName && rule.transitKey === transitKey) {
      boost += rule.boost;
    }
  }
  return boost;
}

/**
 * Returns the user preference score based on the active profile.
 *
 * Sums preferences for:
 *   - transit aspect  (preferredAspects)
 *   - transit planet  (preferredPlanets)
 *   - active signals  (preferredSignals — partial key match)
 *
 * @param {object}   transit
 * @param {string[]} activeSignals
 * @param {object}   userProfile   - Partial profile; merged with DEFAULT_USER_PROFILE
 * @returns {number}
 */
function getUserPreferenceScore(transit, activeSignals = [], userProfile = {}) {
  const preferredAspects = Object.assign({}, DEFAULT_USER_PROFILE.preferredAspects,  userProfile.preferredAspects);
  const preferredPlanets = Object.assign({}, DEFAULT_USER_PROFILE.preferredPlanets,  userProfile.preferredPlanets);
  const preferredSignals = Object.assign({}, DEFAULT_USER_PROFILE.preferredSignals,  userProfile.preferredSignals);

  let score = 0;

  const aspect = (transit.aspect || '').toLowerCase();
  if (aspect && preferredAspects[aspect] !== undefined) {
    score += preferredAspects[aspect];
  }

  const planet = transit.planet || '';
  if (planet && preferredPlanets[planet] !== undefined) {
    score += preferredPlanets[planet];
  }

  for (const signal of activeSignals) {
    const sigKey = typeof signal === 'string' ? signal : (signal.key || '');
    if (sigKey && preferredSignals[sigKey] !== undefined) {
      score += preferredSignals[sigKey];
    }
  }

  return score;
}

/**
 * Returns an intent-driven boost for the transit.
 *
 * Supported intents:
 *   'strongest_pick' — boosts very_strong transits and conjunctions
 *   'interesting'    — boosts very_strong and strong transits
 *
 * @param {string|null} intent
 * @param {object}      transit
 * @returns {number}
 */
function getIntentBoost(intent, transit) {
  const strength = transit.strength || 'soft';
  const aspect   = (transit.aspect || '').toLowerCase();
  let boost = 0;

  if (intent === 'strongest_pick') {
    if (strength === 'very_strong')    boost += 3;
    if (aspect   === 'conjunction')    boost += 2;
  }

  if (intent === 'interesting') {
    if (strength === 'very_strong' || strength === 'strong') boost += 2;
  }

  return boost;
}

/**
 * Returns a clarity score based on data completeness and orb precision.
 *
 * Rules:
 *   - Missing essential fields (planet / aspect / target) → 0
 *   - orb ≤ 1.5 → +3
 *   - orb ≤ 3   → +2
 *   - otherwise  → +1 (fields present, orb unavailable or wide)
 *
 * @param {object} transit
 * @returns {number}
 */
function getClarityScore(transit) {
  if (!transit.planet || !transit.aspect || !transit.target) return 0;

  const orb = typeof transit.orb === 'number' ? transit.orb : null;
  if (orb === null) return 1;
  if (orb <= 1.5)   return 3;
  if (orb <= 3)     return 2;
  return 1;
}

/**
 * Returns the noise penalty for a transit.
 *
 * Rules:
 *   - orb ≥ 4          → +2 penalty
 *   - strength = 'soft' → +1 penalty
 *
 * @param {object} transit
 * @returns {number}
 */
function getNoisePenalty(transit) {
  let penalty = 0;
  const orb      = typeof transit.orb === 'number' ? transit.orb : 0;
  const strength = transit.strength || 'soft';

  if (orb >= 4)          penalty += 2;
  if (strength === 'soft') penalty += 1;

  return penalty;
}

// ─── MAIN SCORING FUNCTION ────────────────────────────────────────────────────

/**
 * Scores a single transit for the given day and context.
 *
 * Formula:
 *   finalScore =
 *     baseStrengthScore + aspectPriorityScore + moonPhaseScore +
 *     signalDensityScore + comboBoostScore + userPreferenceScore +
 *     recencyIntentScore + clarityScore - noisePenalty
 *
 * Note: the breakdown field `recencyIntentScore` follows the required API shape.
 * Its value is computed by getIntentBoost (intent-driven boost, no recency
 * component yet — reserved for future temporal preference tracking).
 *
 * @param {object} day           - { moonPhase: { phaseName?, phase?, sign? }, ... }
 * @param {object} transit       - { planet, aspect, target, orb, strength?, ... }
 * @param {object} [context={}]  - { activeSignals?, intent?, userProfile? }
 * @returns {{ finalScore: number, breakdown: object }}
 */
function scoreTransit(day, transit, context = {}) {
  const activeSignals = Array.isArray(context.activeSignals) ? context.activeSignals : [];
  const intent        = context.intent || null;
  const userProfile   = context.userProfile || {};

  const baseStrengthScore   = getBaseStrengthScore(transit);
  const aspectPriorityScore = getAspectPriorityScore(transit);
  const moonPhaseScore      = getMoonPhaseScore(day);
  const signalDensityScore  = getSignalDensityScore(activeSignals);
  const comboBoostScore     = getComboBoost(day, transit);
  const userPreferenceScore = getUserPreferenceScore(transit, activeSignals, userProfile);
  const recencyIntentScore  = getIntentBoost(intent, transit);
  const clarityScore        = getClarityScore(transit);
  const noisePenalty        = getNoisePenalty(transit);

  const finalScore =
    baseStrengthScore   +
    aspectPriorityScore +
    moonPhaseScore      +
    signalDensityScore  +
    comboBoostScore     +
    userPreferenceScore +
    recencyIntentScore  +
    clarityScore        -
    noisePenalty;

  return {
    finalScore,
    breakdown: {
      baseStrengthScore,
      aspectPriorityScore,
      moonPhaseScore,
      signalDensityScore,
      comboBoostScore,
      userPreferenceScore,
      recencyIntentScore,
      clarityScore,
      noisePenalty,
    },
  };
}

// ─── LABEL ────────────────────────────────────────────────────────────────────

/**
 * Maps a numeric finalScore to a semantic priority label.
 *
 * @param {number} score
 * @returns {'premium_pick'|'strong_pick'|'usable_pick'|'low_priority'}
 */
function labelScore(score) {
  if (score >= 22) return 'premium_pick';
  if (score >= 16) return 'strong_pick';
  if (score >= 11) return 'usable_pick';
  return 'low_priority';
}

// ─── RANKING ──────────────────────────────────────────────────────────────────

/**
 * Scores and ranks all transits in a day, sorted descending by finalScore.
 *
 * Each returned transit carries:
 *   - score          {number}  — the finalScore
 *   - scoreBreakdown {object}  — per-component breakdown
 *   - scoreLabel     {string}  — semantic priority label
 *
 * @param {object} day          - { transits: [], moonPhase: {}, date?: string }
 * @param {object} [context={}] - { activeSignals?, intent?, userProfile? }
 * @returns {Array}
 */
function rankDayTransits(day = {}, context = {}) {
  const transits = Array.isArray(day.transits) ? day.transits : [];

  return transits
    .map((transit) => {
      const { finalScore, breakdown } = scoreTransit(day, transit, context);
      return {
        ...transit,
        score:          finalScore,
        scoreBreakdown: breakdown,
        scoreLabel:     labelScore(finalScore),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  scoreTransit,
  rankDayTransits,
  labelScore,
  getSignalDensityScore,
  getComboBoost,
  getUserPreferenceScore,
  getIntentBoost,
  getClarityScore,
  getNoisePenalty,
  STRENGTH_BASE_SCORE,
  ASPECT_PRIORITY_SCORE,
  MOON_PHASE_SCORE,
  COMBO_BOOST_TABLE,
  DEFAULT_USER_PROFILE,
};
