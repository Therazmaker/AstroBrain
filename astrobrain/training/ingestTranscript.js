const fs = require('fs');
const path = require('path');

const TONE_WORDS = [
  'angry',
  'sad',
  'anxious',
  'calm',
  'tense',
  'hopeful',
  'frustrated',
  'sensitive',
  'overwhelmed',
  'clear',
];

function extractRepeatedPhrases(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const counts = {};
  for (let i = 0; i < words.length - 2; i += 1) {
    const phrase = words.slice(i, i + 3).join(' ');
    counts[phrase] = (counts[phrase] || 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

function detectToneWords(text) {
  const lower = text.toLowerCase();
  return TONE_WORDS.filter((word) => lower.includes(word));
}

function ingestTranscript(transcript, memoryKey = 'transcript_training') {
  const memoryPath = path.join(__dirname, '..', 'memory', 'hippocampus.json');
  const hippocampus = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));

  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const usefulLines = lines.filter((line) => line.split(/\s+/).length >= 5).slice(0, 20);
  const phrases = extractRepeatedPhrases(transcript);
  const tones = detectToneWords(transcript);

  hippocampus[memoryKey] = {
    emotion: tones.join(', ') || 'mixed',
    phrases,
    usefulLines,
  };

  fs.writeFileSync(memoryPath, `${JSON.stringify(hippocampus, null, 2)}\n`, 'utf8');

  return hippocampus[memoryKey];
}

module.exports = {
  ingestTranscript,
  extractRepeatedPhrases,
  detectToneWords,
};
