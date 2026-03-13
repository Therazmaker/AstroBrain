function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function normalizeText(text = '') {
  return `${text}`.toLowerCase();
}

function detectNarrativePatterns(text = '') {
  const lower = normalizeText(text);
  const patterns = [];

  if (/hoy|ahora|momento|esta semana|este ciclo/.test(lower)) patterns.push('apertura_contextual');
  if (/signo|casa|tránsito|aspecto|grado|conjunción|cuadratura/.test(lower)) patterns.push('explicacion_tecnica_suave');
  if (/sientes|sentir|te pasa|es normal|válido|acompaña/.test(lower)) patterns.push('validacion_emocional');
  if (/respira|paso|haz|observa|escribe|intención|práctica/.test(lower)) patterns.push('cierre_regulador');
  if (/impulso|acción|calma|equilibrio|regular|pausa/.test(lower)) patterns.push('contraste_energia_accion');

  return patterns;
}

function extractContentNeuronsFromRaw(text = '') {
  const normalized = normalizeText(text).replace(/[^a-záéíóúñü0-9\s]/gi, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const counts = words.reduce((acc, word) => {
    if (word.length < 4) return acc;
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, frequency], idx) => ({
      id: `semantic_${term}_${idx + 1}`,
      match: term,
      confidence: clamp01(frequency / 4),
    }));
}

function buildVoiceProfileFromRaw(text = '') {
  const lower = normalizeText(text);
  const score = (lexicon, divisor = 4) => {
    const hits = lexicon.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
    return clamp01(hits / divisor);
  };

  return {
    proximity: score(['tú', 'te', 'contigo', 'nosotros', 'acompaño']),
    softness: score(['suave', 'gentil', 'pausa', 'respira', 'calma']),
    emotionality: score(['emoc', 'sentir', 'corazón', 'miedo', 'deseo', 'alma']),
    technicality: score(['tránsito', 'orbe', 'casa', 'grado', 'aspecto', 'conjunción'], 5),
    warmth: score(['cariño', 'cuidado', 'acompaña', 'comprensión', 'humano']),
    directness: score(['haz', 'define', 'elige', 'evita', 'enfoca', 'actúa']),
    symbolism: score(['luz', 'sombra', 'portal', 'ritmo', 'ciclo', 'marea']),
    collectiveness: score(['colectivo', 'sociedad', 'equipo', 'comunidad', 'todos']),
  };
}

function evaluateTrainingExampleQuality(text = '') {
  const lower = normalizeText(text);
  const sentences = `${text}`.split(/(?<=[.!?])\s+/).filter(Boolean);
  const avgSentenceLength = sentences.length
    ? sentences.reduce((acc, line) => acc + line.split(/\s+/).length, 0) / sentences.length
    : 0;
  const score = (lexicon, divisor = 4) => {
    const hits = lexicon.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
    return clamp01(hits / divisor);
  };

  return {
    clarity: clamp01(1 - Math.abs(avgSentenceLength - 18) / 18),
    naturalness: score(['hoy', 'ahora', 'sientes', 'puede', 'quizás', 'cuando'], 5),
    warmth: score(['cuidado', 'acompaña', 'respira', 'gentil', 'humano']),
    usefulness: score(['paso', 'acción', 'práctica', 'evita', 'usa', 'foco']),
    coherence: clamp01(sentences.length >= 3 ? 0.85 : 0.45),
    emotionalResonance: score(['emoc', 'sentir', 'miedo', 'amor', 'deseo', 'confianza']),
  };
}

function deriveLearnedRules(example) {
  const rules = [];
  if (example.narrativeLearning.patterns.includes('apertura_contextual')) rules.push('iniciar con contexto temporal y emocional antes de interpretar');
  if (example.narrativeLearning.patterns.includes('explicacion_tecnica_suave')) rules.push('traducir términos técnicos a lenguaje cotidiano');
  if (example.qualityAssessment.usefulness > 0.55) rules.push('cerrar con una acción concreta y reguladora');
  if (example.voiceLearning.warmth > 0.45 && example.voiceLearning.proximity > 0.45) rules.push('mantener cercanía sin perder claridad estructural');
  if (!rules.length) rules.push('priorizar claridad, coherencia y tono humano antes de detalle técnico');
  return rules;
}

function buildLearningExample(text, source = { type: 'human_text', author: '', origin: 'training_room' }) {
  const contentLearning = { neurons: extractContentNeuronsFromRaw(text) };
  const narrativeLearning = { patterns: detectNarrativePatterns(text) };
  const voiceLearning = buildVoiceProfileFromRaw(text);
  const qualityAssessment = evaluateTrainingExampleQuality(text);
  const learning = {
    source,
    contentLearning,
    narrativeLearning,
    voiceLearning,
    qualityAssessment,
    learnedRules: [],
  };
  learning.learnedRules = deriveLearnedRules(learning);
  return learning;
}

module.exports = {
  extractContentNeuronsFromRaw,
  detectNarrativePatterns,
  buildVoiceProfileFromRaw,
  evaluateTrainingExampleQuality,
  deriveLearnedRules,
  buildLearningExample,
};
