const EMOTION_LEXICON = {
  anger: ['angry', 'anger', 'furious', 'irritated', 'frustrated', 'mad'],
  anxiety: ['anxious', 'nervous', 'worried', 'overthinking', 'uncertain'],
  sadness: ['sad', 'down', 'hurt', 'grief', 'lonely'],
  overwhelm: ['overwhelmed', 'too much', 'burned out', 'exhausted', 'drained'],
  calm: ['calm', 'steady', 'grounded', 'peaceful'],
  hope: ['hopeful', 'optimistic', 'relieved', 'encouraged'],
};

const ADVICE_CUES = [
  'should',
  'need to',
  'try',
  'remember to',
  'focus on',
  'avoid',
  'do not',
  "don't",
  'must',
];

const SITUATION_CUES = [
  'when',
  'if',
  'at work',
  'in my relationship',
  'with my family',
  'during',
  'because',
  'after',
  'before',
];

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function splitSentences(text = '') {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function extractEmotions(text = '') {
  const lower = text.toLowerCase();
  return Object.entries(EMOTION_LEXICON)
    .filter(([, variants]) => variants.some((variant) => lower.includes(variant)))
    .map(([emotion]) => emotion);
}

function extractSituations(sentences = []) {
  return sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return SITUATION_CUES.some((cue) => lower.includes(cue));
  });
}

function extractAdvice(sentences = []) {
  return sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return ADVICE_CUES.some((cue) => lower.includes(cue));
  });
}

function extractRepeatedPhrases(text = '', size = 3) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const counts = {};
  for (let i = 0; i <= words.length - size; i += 1) {
    const phrase = words.slice(i, i + size).join(' ');
    counts[phrase] = (counts[phrase] || 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase, count]) => ({ phrase, count }));
}

function detectTone({ emotions = [], advice = [], repeatedPhrases = [] }) {
  if (emotions.some((emotion) => ['anger', 'anxiety', 'overwhelm'].includes(emotion))) return 'intense';
  if (advice.length >= 3 || repeatedPhrases.length >= 2) return 'active';
  if (emotions.includes('calm') || emotions.includes('hope')) return 'soft';
  return 'active';
}

function parseRaw(rawText = '') {
  const normalized = normalizeText(rawText);
  const sentences = splitSentences(normalized);
  const emotions = extractEmotions(normalized);
  const situations = extractSituations(sentences);
  const advice = extractAdvice(sentences);
  const repeatedPhrases = extractRepeatedPhrases(normalized);
  const tone = detectTone({ emotions, advice, repeatedPhrases });

  return {
    rawText: normalized,
    emotions,
    situations,
    advice,
    repeatedPhrases,
    tone,
  };
}

module.exports = {
  parseRaw,
  _internal: {
    normalizeText,
    splitSentences,
    extractEmotions,
    extractSituations,
    extractAdvice,
    extractRepeatedPhrases,
    detectTone,
  },
};
