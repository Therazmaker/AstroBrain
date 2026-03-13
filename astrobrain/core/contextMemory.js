const fs = require('fs');
const path = require('path');

const CONTEXT_MEMORY_PATH = path.join(__dirname, '..', 'memory', 'contextMemory.json');
const MAX_DAYS = 3;

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

module.exports = {
  getRecentContext,
  updateContextMemory,
};
