const fs = require('fs');
const path = require('path');

const CONTEXT_MEMORY_PATH = path.join(__dirname, '..', 'memory', 'contextMemory.json');
const MAX_DAYS = 30;

function readMemory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTEXT_MEMORY_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeMemory(records) {
  fs.writeFileSync(CONTEXT_MEMORY_PATH, JSON.stringify(records, null, 2));
}

function getRecentContext() {
  return readMemory().slice(-MAX_DAYS);
}

function updateContextMemory(todayData = {}) {
  const normalized = {
    date: todayData.date || new Date().toISOString().slice(0, 10),
    emotion: todayData.emotion || 'mixed',
    tone: todayData.tone || 'steady',
    dominantCluster: todayData.dominantCluster || 'actional',
  };

  const records = readMemory().filter((entry) => entry && entry.date !== normalized.date);
  records.push(normalized);

  const recent = records.slice(-MAX_DAYS);
  writeMemory(recent);
  return recent;
}

/** Returns frequency counts for emotions across stored context sessions. */
function getEmotionFrequency() {
  return getRecentContext().reduce((acc, item) => {
    const emotion = item.emotion || 'mixed';
    acc[emotion] = (acc[emotion] || 0) + 1;
    return acc;
  }, {});
}

/** Returns the most frequent emotion + dominant cluster pairing in context memory. */
function getDominantPattern() {
  const counts = {};

  getRecentContext().forEach((item) => {
    const emotion = item.emotion || 'mixed';
    const dominantCluster = item.dominantCluster || 'actional';
    const key = `${emotion}|${dominantCluster}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!winner) return null;

  const [emotion, dominantCluster] = winner[0].split('|');
  return { emotion, dominantCluster };
}

/** Builds a short narrative summary of recent emotional context trends. */
function buildContextSummary() {
  const recent = getRecentContext();
  if (recent.length < 3) return '';

  const frequency = getEmotionFrequency();
  const topEmotion = Object.entries(frequency).sort((a, b) => b[1] - a[1])[0];
  const dominantPattern = getDominantPattern();

  if (!topEmotion || !dominantPattern) return '';

  return `Over the last ${recent.length} sessions, ${topEmotion[0]} appears most often. A recurring ${dominantPattern.dominantCluster} pattern suggests this mood is cycling through similar themes.`;
}

module.exports = {
  getRecentContext,
  updateContextMemory,
  getEmotionFrequency,
  getDominantPattern,
  buildContextSummary,
};
