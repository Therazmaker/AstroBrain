const SYNONYMS = {
  energy: ['vibe', 'drive', 'momentum'],
  intense: ['strong', 'high-voltage'],
  soft: ['gentle', 'calm'],
  focus: ['center', 'attention'],
  avoid: ['skip', 'steer clear of'],
  use: ['apply', 'lean on'],
  clear: ['direct', 'crisp'],
  simple: ['easy', 'clean'],
  tension: ['strain', 'pressure'],
  weight: ['load', 'gravity'],
  block: ['stall', 'jam'],
  move: ['shift', 'advance'],
  slow: ['ease', 'decelerate'],
  pause: ['stop', 'take a beat'],
  ground: ['stabilize', 'root'],
  shift: ['pivot', 'reorient'],
  release: ['let go', 'unclench'],
  open: ['unfold', 'welcome'],
  hold: ['contain', 'steady'],
  carry: ['bear', 'support'],
  push: ['press', 'drive'],
  pull: ['draw', 'attract'],
  break: ['split', 'disrupt'],
  build: ['create', 'assemble'],
  trust: ['rely', 'believe'],
  flow: ['stream', 'current'],
  sit: ['rest', 'settle'],
  rise: ['lift', 'ascend'],
  fall: ['drop', 'descend'],
  turn: ['rotate', 'redirect'],
  meet: ['encounter', 'greet'],
  face: ['confront', 'address'],
  stay: ['remain', 'hold steady'],
  leave: ['exit', 'step away'],
  choose: ['select', 'commit to'],
  respond: ['reply', 'answer'],
  act: ['move', 'engage'],
  feel: ['sense', 'experience'],
  see: ['notice', 'recognize'],
  name: ['label', 'identify'],
  know: ['understand', 'grasp'],
  breathe: ['inhale', 'take a breath'],
  settle: ['stabilize', 'calm down'],
  wait: ['pause', 'hold'],
  reach: ['extend', 'connect'],
  tend: ['care for', 'attend to'],
  allow: ['permit', 'make room for'],
};

const ROBOTIC_REPLACEMENTS = [
  [/\byou should\b/gi, 'you could'],
  [/\byou must\b/gi, "it's better to"],
  [/\bit is important to\b/gi, 'it helps to'],
  [/\byou need to\b/gi, 'you may want to'],
  [/\bdo not\b/gi, "don't"],
  [/\bcannot\b/gi, "can't"],
  [/\btherefore\b/gi, 'so'],
  [/\bin order to\b/gi, 'to'],
  [/\butilize\b/gi, 'use'],
  [/\bcommence\b/gi, 'begin'],
  [/\bterminate\b/gi, 'end'],
  [/\bmoreover\b/gi, 'also'],
];

function swapRepeatedWords(text) {
  const seen = new Map();
  return text.replace(/\b([a-zA-Z']+)\b/g, (word, raw) => {
    const lower = raw.toLowerCase();
    const count = seen.get(lower) || 0;
    seen.set(lower, count + 1);

    if (count === 0) return word;

    const options = SYNONYMS[lower];
    if (!options || !options.length) return word;

    const replacement = options[Math.min(count - 1, options.length - 1)];
    return /^[A-Z]/.test(word)
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  });
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkWords(words, minSize, maxSize) {
  const chunks = [];
  let i = 0;

  while (i < words.length) {
    const remaining = words.length - i;
    let size = Math.min(maxSize, remaining);

    if (remaining > maxSize && remaining - size < minSize) {
      size = Math.max(minSize, remaining - minSize);
    }

    chunks.push(words.slice(i, i + size).join(' '));
    i += size;
  }

  return chunks;
}

function normalizeRhythm(text, tone) {
  const settings = tone === 'intense'
    ? { min: 6, max: 11 }
    : tone === 'soft'
      ? { min: 10, max: 18 }
      : { min: 8, max: 16 };

  const rebuilt = [];

  splitSentences(text).forEach((sentence) => {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= settings.max) {
      rebuilt.push(sentence);
      return;
    }

    chunkWords(words, settings.min, settings.max).forEach((part, index, arr) => {
      const trimmed = part.replace(/[.!?]+$/, '');
      const ending = index === arr.length - 1 ? '.' : ';';
      rebuilt.push(`${trimmed}${ending}`);
    });
  });

  return rebuilt.join(' ');
}

function applySoftPolish(text) {
  return ROBOTIC_REPLACEMENTS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

function refineNarrative(narrative, tone = 'active') {
  if (!narrative || typeof narrative !== 'object') return narrative;

  const refined = {};

  Object.entries(narrative).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      refined[key] = value;
      return;
    }

    let text = value;
    text = swapRepeatedWords(text);
    text = normalizeRhythm(text, tone);
    text = applySoftPolish(text);
    refined[key] = text;
  });

  return refined;
}

module.exports = {
  refineNarrative,
  _internal: {
    swapRepeatedWords,
    normalizeRhythm,
    applySoftPolish,
  },
};
