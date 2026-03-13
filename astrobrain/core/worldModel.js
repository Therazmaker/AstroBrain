const fs = require('fs');
const path = require('path');

const HUMAN_SITUATIONS_PATH = path.join(__dirname, '..', 'memory', 'humanSituations.json');

function loadHumanSituations() {
  try {
    return JSON.parse(fs.readFileSync(HUMAN_SITUATIONS_PATH, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function mapEmotionToSituations(emotion) {
  if (!emotion || typeof emotion !== 'string') return [];
  const situations = loadHumanSituations();
  return situations[emotion.toLowerCase()] || [];
}

module.exports = {
  mapEmotionToSituations,
};
