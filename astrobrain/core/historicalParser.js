const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'these', 'those', 'into', 'about', 'their', 'there', 'which',
  'como', 'para', 'desde', 'hasta', 'sobre', 'entre', 'cuando', 'donde', 'porque', 'pero', 'tambien', 'muy',
  'una', 'uno', 'unos', 'unas', 'que', 'los', 'las', 'del', 'por', 'con', 'sin', 'sus', 'fue', 'era', 'son', 'han',
  'were', 'was', 'are', 'is', 'be', 'been', 'being', 'it', 'its', 'they', 'them', 'you', 'your', 'our', 'his', 'her',
  'a', 'an', 'or', 'to', 'of', 'in', 'on', 'at', 'by', 'as', 'not', 'no', 'si', 'se', 'al', 'lo', 'le', 'la', 'el', 'y',
  'said', 'described', 'old',
]);

const SYMBOLIC_CUES = [
  'storm', 'shadow', 'fire', 'mirror', 'door', 'night', 'light', 'thunder', 'dawn', 'river', 'fracture', 'seed',
  'tormenta', 'sombra', 'fuego', 'espejo', 'puerta', 'noche', 'luz', 'trueno', 'amanecer', 'rio', 'ruptura', 'semilla',
  'awaken', 'awakening', 'rupture', 'cycle', 'threshold', 'rebirth', 'renacer', 'despertar', 'giro', 'molde',
];

const TONE_KEYWORDS = {
  disruptive: ['rupture', 'sudden', 'shock', 'break', 'collapse', 'disruptive', 'trueno', 'ruptura', 'quiebre', 'caos'],
  hopeful: ['hope', 'renewal', 'dawn', 'opening', 'heal', 'seed', 'amanecer', 'renacer', 'esperanza', 'apertura'],
  reflective: ['mirror', 'memory', 'reflection', 'silence', 'watching', 'espejo', 'memoria', 'silencio', 'observa'],
  heavy: ['grief', 'loss', 'weight', 'dark', 'pain', 'duelo', 'perdida', 'peso', 'dolor'],
  tense: ['fear', 'alarm', 'threat', 'worry', 'anxious', 'miedo', 'alarma', 'amenaza', 'ansiedad'],
};

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function stripDatesAndNames(text = '') {
  const withoutDates = text
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, ' ')
    .replace(/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi, ' ');

  // Remove likely proper names while preserving first word of sentences by only targeting mid-sentence capitalized tokens.
  return withoutDates.replace(/(?<![.!?]\s)\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g, ' ');
}

function tokenize(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !STOPWORDS.has(token));
}

function extractThemes(tokens = [], maxThemes = 6) {
  const counts = {};
  tokens.forEach((token) => {
    counts[token] = (counts[token] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, maxThemes);
}

function extractSymbolicLanguage(text = '') {
  const lowered = text.toLowerCase();
  return SYMBOLIC_CUES.filter((cue) => lowered.includes(cue));
}

function detectTone(text = '') {
  const lowered = text.toLowerCase();
  const scores = Object.entries(TONE_KEYWORDS).map(([tone, keywords]) => {
    const score = keywords.reduce((acc, keyword) => acc + (lowered.includes(keyword) ? 1 : 0), 0);
    return [tone, score];
  });

  const [bestTone, bestScore] = scores.sort((a, b) => b[1] - a[1])[0] || ['reflective', 0];
  return bestScore > 0 ? bestTone : 'reflective';
}

function extractReusablePhrases(text = '', maxPhrases = 5) {
  const sentences = normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((sentence) => sentence.length > 18 && sentence.length < 110);

  return sentences
    .map((sentence) => sentence.replace(/\b\d{4}\b/g, '').trim())
    .map((sentence) => sentence.replace(/^[,;:\-\s]+/, '').trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 4)
    .slice(0, maxPhrases);
}

function parseHistoricalText(rawText = '', trigger = '') {
  const normalizedRaw = normalizeText(rawText);
  const scrubbed = stripDatesAndNames(normalizedRaw);
  const tokens = tokenize(scrubbed);
  const themes = extractThemes(tokens, 6);
  const symbolicLanguage = extractSymbolicLanguage(scrubbed);
  const tone = detectTone(scrubbed);
  const phrases = extractReusablePhrases(scrubbed, 5);

  return {
    trigger: String(trigger || 'general').toLowerCase().trim(),
    themes,
    tone,
    symbolicLanguage,
    phrases,
  };
}

module.exports = {
  parseHistoricalText,
  _internal: {
    normalizeText,
    stripDatesAndNames,
    tokenize,
    extractThemes,
    extractSymbolicLanguage,
    detectTone,
    extractReusablePhrases,
  },
};
