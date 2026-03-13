const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.join(__dirname, '..', 'memory', 'natalProfile.json');

function readProfile() {
  try {
    return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  } catch (_error) {
    return null;
  }
}

/** Saves a natal profile used for personalized narrative adjustments. */
function saveProfile(profile) {
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
  return profile;
}

/** Loads the persisted natal profile, or null when none exists. */
function loadProfile() {
  return readProfile();
}

/** Personalizes a narrative object using core natal profile indicators. */
function personalizeNarrative(narrative, profile) {
  if (!narrative || !profile) return narrative;

  const next = { ...narrative };
  const primaryTransit = narrative.activeTransit || {};

  if (primaryTransit.target === 'Moon' && profile.moonSign) {
    next.focus = `Your natal Moon in ${profile.moonSign} amplifies this: ${next.focus}`;
  }

  const dominant = profile.dominantPlanet;
  if (dominant && (primaryTransit.planet === dominant || primaryTransit.target === dominant)) {
    const addition = `This activates your dominant ${dominant} energy.`;
    next.energy = next.energy ? `${next.energy} ${addition}` : addition;
  }

  if (profile.risingSign) {
    next.focus = `${next.focus} Through your ${profile.risingSign} rising lens, lead with embodiment and present-moment awareness.`;
  }

  return next;
}

module.exports = {
  saveProfile,
  loadProfile,
  personalizeNarrative,
};
