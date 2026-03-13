'use strict';

// ─── EVENT CLASSIFIER ─────────────────────────────────────────────────────────
// Detects if the loaded transits constitute a collective astrological event.

function normalizeAspect(aspect) {
  return String(aspect || '').trim().toLowerCase();
}

function normalizePlanet(planet) {
  return String(planet || '').trim();
}

/**
 * detectEventType(transits)
 *
 * Analyzes a list of transits and returns the collective event type, if any.
 *
 * Rules:
 *  1. LUNA NUEVA  – Moon conjunction Sun, orb <= 10
 *  2. LUNA LLENA  – Moon opposition Sun
 *  3. STELLIUM    – 3 or more planets in the same sign
 *
 * @param {Array} transits - Array of transit objects (enriched or raw)
 * @returns {string|null} "luna_nueva" | "luna_llena" | "stellium" | null
 */
function detectEventType(transits = []) {
  if (!Array.isArray(transits) || transits.length === 0) return null;

  // ── 1 & 2. Luna Nueva / Luna Llena ──────────────────────────────────────────
  for (const transit of transits) {
    const planet = normalizePlanet(transit.planet);
    const target = normalizePlanet(transit.target);
    const aspect = normalizeAspect(transit.aspect);
    const orb    = Number(transit.orb);

    const isMoonSun = (planet === 'Moon' && target === 'Sun') ||
                      (planet === 'Sun'  && target === 'Moon');

    if (isMoonSun) {
      if (aspect === 'conjunction' && !Number.isNaN(orb) && orb <= 10) {
        return 'luna_nueva';
      }
      if (aspect === 'opposition') {
        return 'luna_llena';
      }
    }
  }

  // ── 3. Stellium: 3+ distinct planets in the same sign ───────────────────────
  // Each transit contributes its planet to a sign bucket.
  // We track unique (planet, sign) pairs to avoid counting the same planet twice
  // when it appears in multiple transits (e.g. Mars square Sun AND Mars trine Jupiter
  // would otherwise count as two hits for the same planet).
  //
  // Sign resolution order: transit.context.planetSign (enriched) → transit.sign (raw)
  const planetsBySign = {};
  for (const transit of transits) {
    const context = transit.context || {};
    const sign    = context.planetSign || transit.sign;
    const planet  = normalizePlanet(transit.planet);
    if (sign && planet) {
      if (!planetsBySign[sign]) {
        planetsBySign[sign] = new Set();
      }
      planetsBySign[sign].add(planet);
    }
  }

  if (Object.values(planetsBySign).some((planets) => planets.size >= 3)) {
    return 'stellium';
  }

  return null;
}

module.exports = { detectEventType };
