const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const FEEDBACK_PATH = path.join(MEMORY_DIR, 'feedback.json');
const WEIGHTS_PATH = path.join(MEMORY_DIR, 'neuronWeights.json');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

/** Records interpretation feedback for later learning updates. */
function recordFeedback({ sessionId, rating, narrative }) {
  if (!sessionId || ![1, -1].includes(rating)) return null;

  const feedback = readJson(FEEDBACK_PATH, []);
  const entry = {
    sessionId,
    rating,
    narrative,
    timestamp: new Date().toISOString(),
  };

  feedback.push(entry);
  writeJson(FEEDBACK_PATH, feedback);
  return entry;
}

/** Adjusts neuron weights based on accumulated feedback entries. */
function adjustWeightsFromFeedback() {
  const feedback = readJson(FEEDBACK_PATH, []);
  if (!feedback.length) return readJson(WEIGHTS_PATH, {});

  const weights = readJson(WEIGHTS_PATH, {});

  feedback.forEach((entry) => {
    const delta = entry.rating === 1 ? 0.08 : -0.05;
    const activeNeuronIds = entry.narrative?.activeNeuronIds || [];

    activeNeuronIds.forEach((id) => {
      const current = Number(weights[id] ?? 0.4);
      const next = Math.min(1, Math.max(0.1, current + delta));
      weights[id] = Number(next.toFixed(4));
    });
  });

  writeJson(WEIGHTS_PATH, weights);
  return weights;
}

/** Calculates the average user rating across all stored feedback entries. */
function getAverageRating() {
  const feedback = readJson(FEEDBACK_PATH, []);
  if (!feedback.length) return 0;

  const total = feedback.reduce((sum, entry) => sum + (Number(entry.rating) || 0), 0);
  return total / feedback.length;
}

module.exports = {
  recordFeedback,
  adjustWeightsFromFeedback,
  getAverageRating,
};
