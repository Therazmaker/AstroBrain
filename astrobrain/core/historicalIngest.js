const fs = require('fs');
const path = require('path');
const { parseHistoricalText } = require('./historicalParser');

const HISTORICAL_MEMORY_PATH = path.join(__dirname, '..', 'memory', 'historicalMemory.json');
const MAX_PHRASES = 5;
const MAX_THEMES = 6;

function readHistoricalMemory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORICAL_MEMORY_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeHistoricalMemory(memory = []) {
  fs.writeFileSync(HISTORICAL_MEMORY_PATH, JSON.stringify(memory, null, 2));
}

function uniqueMerge(existing = [], incoming = [], maxItems = 5) {
  const merged = [...existing, ...incoming]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);

  return merged.slice(0, maxItems);
}

function ingestHistoricalText(rawText = '', trigger = 'general') {
  const parsed = parseHistoricalText(rawText, trigger);
  const memory = readHistoricalMemory();
  const existingIndex = memory.findIndex((entry) => entry.trigger === parsed.trigger);

  const normalized = {
    trigger: parsed.trigger,
    themes: parsed.themes.slice(0, MAX_THEMES),
    tone: parsed.tone,
    phrases: parsed.phrases.slice(0, MAX_PHRASES),
  };

  if (existingIndex >= 0) {
    const existing = memory[existingIndex];
    memory[existingIndex] = {
      trigger: existing.trigger,
      themes: uniqueMerge(existing.themes, normalized.themes, MAX_THEMES),
      tone: normalized.tone || existing.tone || 'reflective',
      phrases: uniqueMerge(existing.phrases, normalized.phrases, MAX_PHRASES),
    };
  } else {
    memory.push(normalized);
  }

  writeHistoricalMemory(memory);
  return normalized;
}

function getHistoricalSignals(trigger = '') {
  const normalizedTrigger = String(trigger).toLowerCase().trim();
  const memory = readHistoricalMemory();

  return memory.find((entry) => entry.trigger === normalizedTrigger) || null;
}

module.exports = {
  ingestHistoricalText,
  getHistoricalSignals,
  _internal: {
    readHistoricalMemory,
    writeHistoricalMemory,
    uniqueMerge,
  },
};
