function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function normalizeText(text = '') {
  return `${text}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set([
  'a','al','algo','algunas','algunos','ante','antes','así','aun','aunque','bajo','bien','cada','casi','como','con','contra','cual','cuales','cuando','de','del','desde','donde','dos','el','ella','ellas','ellos','en','entre','era','eramos','eres','es','esa','esas','ese','eso','esos','esta','estaba','están','estar','este','esto','estos','fue','fueron','ha','había','han','hasta','hay','hoy','incluso','la','las','le','les','lo','los','más','me','mi','mis','mientras','muy','ni','no','nos','nosotras','nosotros','nuestra','nuestro','o','otra','otro','para','pero','poco','por','porque','que','quien','se','según','ser','si','sin','sobre','solo','son','su','sus','también','te','tiene','todo','tu','tus','un','una','uno','unos','veces','y','ya','yo','siempre',
]);

const SEMANTIC_PATTERNS = [
  { id: 'luna_nueva_piscis', category: 'event', patterns: [/luna\s+nueva\s+en\s+piscis/, /luna\s+nueva\s+piscis/], context: 'evento astrológico de inicio sensible', signals: ['luna nueva', 'piscis'] },
  { id: 'evento_lunar', category: 'event', patterns: [/luna\s+nueva/, /luna\s+llena/, /eclipse/, /tr[aá]nsito/], context: 'evento o contexto astrológico activo', signals: ['ciclo lunar', 'tránsito'] },
  { id: 'friccion_emocional', category: 'tension', patterns: [/fricci[oó]n\s+emocional/, /tensi[oó]n\s+(interna|emocional)/, /choque\s+interno/], context: 'tensión psíquica o emocional del proceso', signals: ['fricción', 'tensión'] },
  { id: 'incomodidad_interna', category: 'sensation', patterns: [/incomodidad\s+interna/, /nudo\s+interno/, /sensaci[oó]n\s+de\s+inquietud/, /se\s+puede\s+sentir\s+intenso/], context: 'sensación somática o emocional percibida', signals: ['incomodidad', 'inquietud'] },
  { id: 'bajar_ritmo', category: 'regulation', patterns: [/bajar\s+el\s+ritmo/, /pausa\s+consciente/, /respira\s+(profundo|hondo)?/, /regular\s+el\s+sistema/], context: 'guía de regulación emocional y nerviosa', signals: ['pausa', 'respira'] },
  { id: 'sentir_antes_de_entender', category: 'abstraction', patterns: [/sentir\s+antes\s+de\s+entender/, /primero\s+sentir\s+y\s+luego\s+comprender/, /escuchar\s+antes\s+de\s+explicar/], context: 'abstracción interpretativa sobre el proceso humano', signals: ['sentir', 'comprender'] },
  { id: 'inicio_no_evidente', category: 'abstraction', patterns: [/inicio\s+no\s+evidente/, /inicio\s+sutil/, /comienzo\s+interno/, /nueva\s+etapa\s+interior/], context: 'inicio interno de ciclo aún no visible', signals: ['inicio', 'sutil'] },
  { id: 'bajar_ruido_para_escuchar', category: 'regulation', patterns: [/bajar\s+ruido\s+para\s+escuchar/, /menos\s+ruido\s+mental/, /escucha\s+interna\s+antes\s+de\s+actuar/], context: 'regulación por reducción de sobreestimulación', signals: ['silencio', 'escucha'] },
];

const CATEGORY_KEYWORDS = {
  event: ['luna nueva', 'luna llena', 'eclipse', 'tránsito', 'conjunción', 'cuadratura', 'piscis', 'casa', 'grado'],
  tension: ['tensión', 'fricción', 'presión', 'choque', 'ansiedad', 'duda', 'resistencia'],
  sensation: ['sentir', 'sensación', 'cuerpo', 'incomodidad', 'inquietud', 'miedo', 'tristeza', 'emoción'],
  regulation: ['respira', 'pausa', 'bajar el ritmo', 'regular', 'conviene', 'guía', 'observa', 'escribe'],
  abstraction: ['proceso', 'aprendizaje', 'integrar', 'sentir antes de entender', 'interpretar', 'significado'],
};

function splitSentences(text = '') {
  return `${text}`.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
}

function hasStopwordOnlyContent(match = '') {
  const tokens = match.split(/\s+/).filter(Boolean);
  return !tokens.length || tokens.every((token) => STOPWORDS.has(token));
}

function confidenceFromSignals(chunks, signals) {
  const signalHits = signals.reduce((acc, signal) => acc + chunks.filter((chunk) => chunk.includes(signal)).length, 0);
  return clamp01(0.6 + Math.min(0.35, signalHits * 0.08));
}

function extractSemanticChunks(text = '') {
  const lower = normalizeText(text);
  const cleaned = lower.replace(/[^a-záéíóúñü0-9\s]/gi, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const ngrams = [];

  for (let size = 2; size <= 5; size += 1) {
    for (let i = 0; i <= tokens.length - size; i += 1) {
      const gram = tokens.slice(i, i + size).join(' ');
      if (hasStopwordOnlyContent(gram)) continue;
      ngrams.push(gram);
    }
  }

  const sentences = splitSentences(lower);
  return Array.from(new Set([...sentences, ...ngrams]));
}

function buildNeuron(id, match, signals, semanticContext, category, confidence) {
  return {
    id,
    match,
    signals,
    semanticContext,
    category,
    abstractionLevel: 'semantic',
    confidence: clamp01(Math.max(0.6, confidence)),
  };
}

function inferFallbackNeurons(chunks) {
  const neurons = [];
  Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    const matched = keywords.filter((kw) => chunks.some((chunk) => chunk.includes(kw)));
    if (!matched.length) return;
    const match = matched.slice(0, 2).join(' · ');
    if (hasStopwordOnlyContent(match)) return;
    neurons.push(buildNeuron(
      `semantic_${category}_${matched[0].replace(/\s+/g, '_')}`,
      match,
      matched.slice(0, 3),
      `señales ${category} detectadas en narrativa humana`,
      category,
      0.66 + matched.length * 0.06,
    ));
  });
  return neurons;
}

function ensureNeuronCoverage(neurons, chunks) {
  const requiredCategories = ['event', 'sensation', 'regulation'];
  const hasCategory = (category) => neurons.some((neuron) => neuron.category === category);
  const fallback = inferFallbackNeurons(chunks);

  requiredCategories.forEach((category) => {
    if (!hasCategory(category)) {
      const candidate = fallback.find((neuron) => neuron.category === category);
      if (candidate) neurons.push(candidate);
    }
  });

  const hasTensionOrSensation = neurons.some((n) => n.category === 'tension' || n.category === 'sensation');
  if (!hasTensionOrSensation) {
    const candidate = fallback.find((n) => n.category === 'tension') || fallback.find((n) => n.category === 'sensation');
    if (candidate) neurons.push(candidate);
  }

  if (!neurons.some((n) => n.category === 'abstraction')) {
    const candidate = fallback.find((n) => n.category === 'abstraction');
    if (candidate) neurons.push(candidate);
  }

  return neurons;
}

function extractContentNeuronsFromRaw(text = '') {
  const chunks = extractSemanticChunks(text);
  const neurons = [];

  SEMANTIC_PATTERNS.forEach((pattern) => {
    const hit = pattern.patterns.some((regex) => regex.test(normalizeText(text)));
    if (!hit) return;
    neurons.push(buildNeuron(
      pattern.id,
      pattern.id,
      pattern.signals,
      pattern.context,
      pattern.category,
      confidenceFromSignals(chunks, pattern.signals),
    ));
  });

  const enriched = ensureNeuronCoverage(neurons, chunks)
    .filter((neuron, index, list) => list.findIndex((item) => item.id === neuron.id) === index)
    .filter((neuron) => !hasStopwordOnlyContent(neuron.match))
    .filter((neuron) => neuron.confidence >= 0.6)
    .slice(0, 12);

  return enriched;
}

function detectNarrativePatterns(text = '') {
  const lower = normalizeText(text);
  const patterns = [];

  if (/hoy|ahora|momento|esta semana|este ciclo/.test(lower)) patterns.push('apertura_contextual');
  if (/signo|casa|tránsito|aspecto|grado|conjunción|cuadratura/.test(lower)) patterns.push('explicacion_tecnica_suave');
  if (/sientes|sentir|te pasa|es normal|válido|acompaña/.test(lower)) patterns.push('validacion_emocional');
  if (/respira|paso|haz|observa|escribe|intención|práctica|conviene/.test(lower)) patterns.push('cierre_regulador');
  if (/impulso|acción|calma|equilibrio|regular|pausa/.test(lower)) patterns.push('contraste_energia_accion');

  return patterns;
}

function buildVoiceProfileFromRaw(text = '') {
  const lower = normalizeText(text);
  const score = (lexicon, base = 0.18, step = 0.17) => {
    const hits = lexicon.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
    return clamp01(base + hits * step);
  };

  return {
    proximity: score(['puede sentirse', 'te puede', 'conviene', 'te acompaña', 'quizás', 'hoy'], 0.26, 0.14),
    softness: score(['puede', 'conviene', 'quizás', 'suave', 'gentil', 'respira'], 0.28, 0.13),
    emotionality: score(['sentir', 'emoc', 'corazón', 'miedo', 'deseo', 'alma', 'incomodidad'], 0.24, 0.12),
    technicality: score(['tránsito', 'orbe', 'casa', 'grado', 'aspecto', 'conjunción'], 0.02, 0.11),
    warmth: score(['acompaña', 'cuidado', 'con cariño', 'humano', 'nos sostiene', 'respira', 'escuchar'], 0.24, 0.12),
    directness: score(['haz', 'define', 'elige', 'evita', 'enfoca', 'actúa', 'conviene', 'toca'], 0.14, 0.12),
    symbolism: score(['luz', 'sombra', 'portal', 'ritmo', 'ciclo', 'marea', 'arquetipo'], 0.2, 0.14),
    collectiveness: score(['hoy', 'muchos', 'nos', 'colectivo', 'comunidad', 'todos', 'humana'], 0.22, 0.1),
  };
}

function evaluateTrainingExampleQuality(text = '') {
  const lower = normalizeText(text);
  const sentences = splitSentences(text);
  const avgSentenceLength = sentences.length
    ? sentences.reduce((acc, line) => acc + line.split(/\s+/).length, 0) / sentences.length
    : 0;

  const lexicalScore = (lexicon, base = 0.15, step = 0.14) => {
    const hits = lexicon.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
    return clamp01(base + hits * step);
  };

  const roboticPenalty = /(?:\b\w+\b)(?:\s+\1){2,}/.test(lower) ? 0.2 : 0;

  return {
    clarity: clamp01(0.25 + (1 - Math.abs(avgSentenceLength - 18) / 18) * 0.75),
    naturalness: clamp01(lexicalScore(['hoy', 'puede', 'quizás', 'sentir', 'conviene', 'a veces']) - roboticPenalty),
    warmth: lexicalScore(['acompaña', 'cuidado', 'respira', 'gentil', 'humano', 'contención'], 0.2, 0.14),
    usefulness: lexicalScore(['traducir', 'aterrizar', 'llevar', 'paso', 'guía', 'práctica', 'cómo'], 0.18, 0.14),
    coherence: clamp01(sentences.length >= 3 ? 0.86 : 0.62),
    emotionalResonance: lexicalScore(['sentir', 'miedo', 'amor', 'deseo', 'incomodidad', 'alivio'], 0.16, 0.15),
  };
}

function deriveLearnedRules(example) {
  const rules = [];
  if (example.narrativeLearning.patterns.includes('apertura_contextual')) rules.push('abrir eventos lunares desde lo emocional y contextual');
  if (example.narrativeLearning.patterns.includes('explicacion_tecnica_suave')) rules.push('traducir técnica astrológica a experiencia humana comprensible');
  if (example.contentLearning.neurons.some((neuron) => neuron.category === 'regulation')) rules.push('cerrar con regulación concreta para bajar activación interna');
  if (example.voiceLearning.softness > 0.7) rules.push('sostener modales suaves para acompañar sin imponer');
  if (example.qualityAssessment.emotionalResonance > 0.68) rules.push('priorizar interpretación que conecte tensión con sentido personal');
  if (!rules.length) rules.push('usar contexto, emoción y guía práctica en una secuencia coherente y reusable');
  return rules;
}

function validateLearningResult(result) {
  const neurons = result?.contentLearning?.neurons || [];
  const validNeurons = neurons.filter((neuron) => neuron.confidence >= 0.6 && !hasStopwordOnlyContent(neuron.match));
  const categories = new Set(validNeurons.map((neuron) => neuron.category));
  const hasCoherence = categories.has('event') && (categories.has('sensation') || categories.has('tension')) && categories.has('regulation');

  return {
    valid: validNeurons.length >= 4 && hasCoherence,
    validNeurons,
    hasCoherence,
  };
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

  const validation = validateLearningResult(learning);
  if (!validation.valid) {
    learning.contentLearning.neurons = ensureNeuronCoverage(learning.contentLearning.neurons, extractSemanticChunks(text))
      .filter((neuron) => neuron.confidence >= 0.6)
      .slice(0, 12);
  }

  return learning;
}

module.exports = {
  extractContentNeuronsFromRaw,
  detectNarrativePatterns,
  buildVoiceProfileFromRaw,
  evaluateTrainingExampleQuality,
  deriveLearnedRules,
  validateLearningResult,
  buildLearningExample,
};
