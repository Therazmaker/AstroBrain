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
  { id: 'bajar_ruido_para_escuchar', category: 'regulation', patterns: [/bajar\s+(?:el\s+)?ruido\s+para\s+escuchar/, /menos\s+ruido\s+mental/, /escucha\s+interna\s+antes\s+de\s+actuar/], context: 'regulación por reducción de sobreestimulación', signals: ['silencio', 'escucha'] },
];

const CATEGORY_KEYWORDS = {
  event: ['luna nueva', 'luna llena', 'eclipse', 'tránsito', 'conjunción', 'cuadratura', 'piscis', 'casa', 'grado'],
  tension: ['tensión', 'fricción', 'presión', 'choque', 'ansiedad', 'duda', 'resistencia'],
  sensation: ['sentir', 'sensación', 'cuerpo', 'incomodidad', 'inquietud', 'miedo', 'tristeza', 'emoción'],
  regulation: ['respira', 'pausa', 'bajar el ritmo', 'regular', 'conviene', 'guía', 'observa', 'escribe'],
  abstraction: ['proceso', 'aprendizaje', 'integrar', 'sentir antes de entender', 'interpretar', 'significado'],
};

const WEAK_SENSATION_TERMS = new Set(['emoción', 'emocion', 'energía', 'energia', 'sensación', 'sensacion', 'sentir', 'ánimo', 'animo', 'estado']);
const GENERIC_SENSATION_MATCHES = new Set(['emoción', 'emocion', 'energía', 'energia', 'sensación', 'sensacion', 'sentir', 'ánimo', 'animo', 'estado']);

const STRONG_ABSTRACTION_PATTERNS = [
  /no\s+siempre/,
  /a\s+veces/,
  /primero\b[^.?!]{0,60}\bdespu[eé]s/,
  /aunque/,
  /todav[ií]a\s+no/,
  /capa\s+m[aá]s\s+sutil/,
  /antes\s+de\s+tomar\s+forma/,
  /no\s+significa\s+que\s+no\s+est[eé]\s+pasando\s+nada/,
  /invisible/,
];

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

function hasMeaningfulQualifier(text = '') {
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((token) => !STOPWORDS.has(token));
  return meaningful.length >= 2;
}

function isWeakSensationCandidate(candidate) {
  if (!candidate || candidate.category !== 'sensation') return false;
  const normalized = normalizeText(candidate.match || candidate.id || '').replace(/[·_]/g, ' ').trim();
  const compact = normalized.split(/\s+/).filter(Boolean);
  if (!compact.length) return true;
  if (compact.length === 1 && WEAK_SENSATION_TERMS.has(compact[0])) return true;
  const nonStop = compact.filter((token) => !STOPWORDS.has(token));
  if (nonStop.length <= 1 && nonStop.every((token) => WEAK_SENSATION_TERMS.has(token))) return true;
  return !hasMeaningfulQualifier(normalized) && nonStop.some((token) => WEAK_SENSATION_TERMS.has(token));
}

function enrichWeakSensationCandidate(candidate, chunks) {
  const sensationChunks = chunks.filter((chunk) => /(sent|emoc|incomod|inquiet|intern|sutil|rara|afect|tensi|silencio|pausa)/.test(chunk));
  const preferred = [
    { id: 'incomodidad_interna', match: 'incomodidad interna', signals: ['incomodidad', 'interna'], context: 'sensación de incomodidad interna no lineal' },
    { id: 'sensibilidad_sutil', match: 'sensibilidad sutil', signals: ['sutil', 'sensibilidad'], context: 'registro emocional fino y contemplativo' },
    { id: 'pausa_rara', match: 'pausa rara', signals: ['pausa', 'rara'], context: 'sensación de pausa extraña antes de movimiento interno' },
    { id: 'tension_afectiva', match: 'tensión afectiva', signals: ['tensión', 'afectiva'], context: 'carga emocional percibida de forma interna' },
  ];
  const selected = preferred.find((item) => sensationChunks.some((chunk) => item.signals.some((signal) => chunk.includes(signal))));
  if (!selected) return null;
  return buildNeuron(
    selected.id,
    selected.match,
    selected.signals,
    selected.context,
    'sensation',
    0.7,
  );
}

function buildSpecificSensationFromContext(chunks = []) {
  if (chunks.some((chunk) => chunk.includes('pausa') && chunk.includes('rara'))) {
    return buildNeuron('pausa_rara', 'pausa rara', ['pausa', 'rara'], 'sensación de pausa extraña antes del cambio', 'sensation', 0.72);
  }
  if (chunks.some((chunk) => chunk.includes('por dentro') || chunk.includes('internamente'))) {
    return buildNeuron('incomodidad_interna', 'incomodidad interna', ['internamente', 'por dentro'], 'registro interno de sensación emocional', 'sensation', 0.7);
  }
  if (chunks.some((chunk) => chunk.includes('sutil'))) {
    return buildNeuron('sensibilidad_sutil', 'sensibilidad sutil', ['sutil', 'sensibilidad'], 'sensación delicada del proceso emocional', 'sensation', 0.7);
  }
  return null;
}

function extractNearbySensationDescriptor(chunks = [], text = '') {
  const lower = normalizeText(text);
  const descriptorRules = [
    { test: /(sutil|capa sutil|delicado|delicada)/, neuron: ['sensibilidad_sutil', 'sensibilidad sutil', ['sutil', 'sensibilidad'], 'registro emocional fino y contemplativo'] },
    { test: /(internamente|por dentro|interna|interno)/, neuron: ['incomodidad_interna', 'incomodidad interna', ['internamente', 'por dentro'], 'registro interno de sensación emocional'] },
    { test: /(pausa rara|raro|extrañ[ao])/, neuron: ['pausa_rara', 'pausa rara', ['pausa', 'rara'], 'sensación de pausa extraña antes del cambio'] },
    { test: /(tensi[oó]n afectiva|afectiv)/, neuron: ['tension_afectiva', 'tensión afectiva', ['tensión', 'afectiva'], 'carga emocional percibida de forma interna'] },
  ];

  const joined = [lower, ...chunks].join(' · ');
  const selected = descriptorRules.find((rule) => rule.test.test(joined));
  if (!selected) return null;
  return buildNeuron(...selected.neuron, 'sensation', 0.72);
}

function normalizeCandidateMatch(candidate) {
  return normalizeText(candidate?.match || '').replace(/[._·]/g, ' ').trim();
}

function applySensationSpecificityPolicy(candidate, chunks = [], text = '') {
  if (!candidate || candidate.category !== 'sensation') return candidate;
  const normalizedMatch = normalizeCandidateMatch(candidate);
  if (!GENERIC_SENSATION_MATCHES.has(normalizedMatch)) return candidate;
  return extractNearbySensationDescriptor(chunks, text);
}

function extractAbstractionNeurons(text = '', chunks = [], candidates = []) {
  const lower = normalizeText(text);
  const abstractions = [];
  const hasStrongEvidence = STRONG_ABSTRACTION_PATTERNS.some((regex) => regex.test(lower));

  if (/primero\b[^.?!]{0,60}\bdespu[eé]s/.test(lower) || /sentir\s+y\s+despu[eé]s\s+se\s+entiende/.test(lower)) {
    abstractions.push(buildNeuron('sentir_antes_de_entender', 'sentir antes de entender', ['primero', 'después', 'sentir'], 'comprensión emocional no lineal', 'abstraction', 0.78));
  }
  if (/invisible|no\s+significa\s+que\s+no\s+est[eé]\s+pasando/.test(lower)) {
    abstractions.push(buildNeuron('movimiento_invisible', 'movimiento invisible', ['invisible', 'proceso'], 'proceso activo que aún no es evidente', 'abstraction', 0.74));
  }
  if (/no\s+siempre\s+se\s+siente\s+como\s+un\s+comienzo|inicio\s+no\s+evidente/.test(lower)) {
    abstractions.push(buildNeuron('inicio_no_evidente', 'inicio no evidente', ['inicio', 'no evidente'], 'inicio interno previo a evidencia externa', 'abstraction', 0.76));
  }
  if (/todav[ií]a\s+no\s+tiene\s+nombre|claridad\s+total/.test(lower)) {
    abstractions.push(buildNeuron('claridad_no_inmediata', 'claridad no inmediata', ['claridad', 'proceso'], 'claridad que emerge después de integración', 'abstraction', 0.72));
  }
  if (/capa\s+m[aá]s\s+sutil|antes\s+de\s+tomar\s+forma/.test(lower)) {
    abstractions.push(buildNeuron('proceso_sutil_en_formacion', 'proceso sutil en formación', ['sutil', 'formación'], 'cambio en capas internas todavía en formación', 'abstraction', 0.74));
  }

  if (!abstractions.length && hasStrongEvidence) {
    abstractions.push(buildNeuron(
      'capa_sutil_del_cambio',
      'capa sutil del cambio',
      ['proceso', 'sutil', 'cambio'],
      'abstracción inferida por estructuras no lineales del texto',
      'abstraction',
      0.7,
    ));
  }

  const existingIds = new Set(candidates.map((item) => item.id));
  return abstractions.filter((item, index, list) => !existingIds.has(item.id) && list.findIndex((x) => x.id === item.id) === index);
}

function inferFallbackNeurons(chunks) {
  const neurons = [];
  Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    const matched = keywords.filter((kw) => chunks.some((chunk) => chunk.includes(kw)));
    if (!matched.length) return;
    const match = matched.slice(0, 2).join(' · ');
    if (hasStopwordOnlyContent(match)) return;
    const neuron = buildNeuron(
      `semantic_${category}_${matched[0].replace(/\s+/g, '_')}`,
      match,
      matched.slice(0, 3),
      `señales ${category} detectadas en narrativa humana`,
      category,
      0.66 + matched.length * 0.06,
    );
    if (isWeakSensationCandidate(neuron)) return;
    neurons.push(neuron);
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

  if (!neurons.some((n) => n.category === 'sensation' && !isWeakSensationCandidate(n))) {
    const contextualSensation = buildSpecificSensationFromContext(chunks);
    if (contextualSensation) neurons.push(contextualSensation);
  }

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
    const neuron = buildNeuron(
      pattern.id,
      pattern.id,
      pattern.signals,
      pattern.context,
      pattern.category,
      confidenceFromSignals(chunks, pattern.signals),
    );
    const strictSensationNeuron = applySensationSpecificityPolicy(neuron, chunks, text);
    if (!strictSensationNeuron) return;
    if (isWeakSensationCandidate(strictSensationNeuron)) {
      const enrichedSensation = enrichWeakSensationCandidate(strictSensationNeuron, chunks);
      if (enrichedSensation) neurons.push(enrichedSensation);
      return;
    }
    neurons.push(strictSensationNeuron);
  });

  neurons.push(...extractAbstractionNeurons(text, chunks, neurons));

  const strongAbstractionEvidence = STRONG_ABSTRACTION_PATTERNS.some((regex) => regex.test(normalizeText(text)));

  let enriched = ensureNeuronCoverage(neurons, chunks)
    .map((neuron) => {
      const strictSensationNeuron = applySensationSpecificityPolicy(neuron, chunks, text);
      if (!strictSensationNeuron) return null;
      if (!isWeakSensationCandidate(strictSensationNeuron)) return strictSensationNeuron;
      return enrichWeakSensationCandidate(strictSensationNeuron, chunks);
    })
    .filter(Boolean)
    .concat(strongAbstractionEvidence && !neurons.some((n) => n.category === 'abstraction')
      ? extractAbstractionNeurons(text, chunks, neurons)
      : [])
    .filter((neuron, index, list) => list.findIndex((item) => item.id === neuron.id) === index)
    .filter((neuron) => !hasStopwordOnlyContent(neuron.match))
    .filter((neuron) => neuron.confidence >= 0.6)
    .slice(0, 12);

  if (strongAbstractionEvidence) {
    const hasAbstraction = enriched.some((neuron) => neuron.category === 'abstraction');
    if (!hasAbstraction) {
      const retryAbstractions = extractAbstractionNeurons(text, chunks, []);
      enriched = enriched
        .concat(retryAbstractions)
        .filter((neuron, index, list) => list.findIndex((item) => item.id === neuron.id) === index);
    }
    if (!enriched.some((neuron) => neuron.category === 'abstraction')) {
      const fallbackAbstraction = /primero|despu[eé]s|sentir/.test(normalizeText(text))
        ? buildNeuron('sentir_antes_de_entender', 'sentir antes de entender', ['sentir', 'proceso'], 'comprensión emocional previa a claridad racional', 'abstraction', 0.72)
        : buildNeuron('inicio_no_evidente', 'inicio no evidente', ['inicio', 'sutil'], 'inicio interno aún no evidente en superficie', 'abstraction', 0.72);
      enriched.push(fallbackAbstraction);
    }
  }

  return enriched.slice(0, 12);
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

  const contemplativeBoost = score([
    'puede sentirse', 'conviene', 'quizás', 'a veces', 'no siempre', 'todavía no', 'no significa que',
    'por dentro', 'internamente', 'escuchar', 'observar', 'capa más sutil', 'tomar forma', 'movimiento invisible', 'date espacio', 'baja el ruido',
  ], 0, 0.04);
  const technicalPressure = score(['orbe exacto', 'grado exacto', 'configuración', 'estadística', 'protocolo'], 0, 0.05);
  const gentleVoiceSignals = ['puede', 'conviene', 'a veces', 'no siempre', 'observa', 'escuchar', 'internamente'];
  const gentleSignalHits = gentleVoiceSignals.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
  const multiSignalBoost = gentleSignalHits >= 2;

  return {
    proximity: clamp01(score(['puede sentirse', 'te puede', 'conviene', 'te acompaña', 'quizás', 'date espacio', 'hoy'], 0.3, 0.13) + contemplativeBoost - technicalPressure * 0.4),
    softness: clamp01(score(['puede', 'conviene', 'quizás', 'suave', 'gentil', 'respira', 'a veces', 'no siempre', 'baja el ruido'], 0.34, 0.11) + contemplativeBoost - technicalPressure * 0.45 + (multiSignalBoost ? 0.15 : 0)),
    emotionality: clamp01(score(['sentir', 'emoc', 'corazón', 'miedo', 'deseo', 'alma', 'incomodidad', 'por dentro', 'internamente'], 0.3, 0.11) + contemplativeBoost * 0.9 + (multiSignalBoost ? 0.12 : 0)),
    technicality: score(['tránsito', 'orbe', 'casa', 'grado', 'aspecto', 'conjunción'], 0.02, 0.11),
    warmth: clamp01(score(['acompaña', 'cuidado', 'con cariño', 'humano', 'nos sostiene', 'respira', 'escuchar', 'date espacio', 'sin presión'], 0.28, 0.1) + contemplativeBoost * 0.8 + (multiSignalBoost ? 0.1 : 0)),
    directness: score(['haz', 'define', 'elige', 'evita', 'enfoca', 'actúa', 'conviene', 'toca'], 0.14, 0.12),
    symbolism: clamp01(score(['luz', 'sombra', 'portal', 'ritmo', 'ciclo', 'marea', 'arquetipo', 'capa sutil', 'tomar forma', 'movimiento invisible', 'lo invisible'], 0.24, 0.1) + contemplativeBoost * 0.7 + (multiSignalBoost ? 0.18 : 0)),
    collectiveness: clamp01(score(['hoy', 'muchos', 'nos', 'colectivo', 'comunidad', 'todos', 'humana', 'nos pasa'], 0.24, 0.09) + contemplativeBoost * 0.35),
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
  const contemplativeSignals = lexicalScore([
    'puede sentirse', 'a veces', 'no siempre', 'por dentro', 'internamente', 'escuchar', 'observar', 'sin presión',
    'date espacio', 'bajar el ruido', 'primero se siente', 'después se entiende',
  ], 0.02, 0.06);
  const appliedGuidanceSignals = lexicalScore([
    'conviene', 'guía', 'paso', 'práctica', 'respira', 'observa', 'date espacio', 'bajar el ruido', 'regular',
  ], 0.05, 0.08);
  const translationSignals = lexicalScore([
    'se siente', 'experiencia', 'humana', 'aterriza', 'comprensible', 'internamente', 'emoción',
  ], 0.04, 0.07);
  const regulationNeuronPresent = /(respira|observa|conviene|bajar el ruido|regular|pausa|date espacio)/.test(lower);
  const emotionalTranslationPresent = /(se siente|internamente|por dentro|traducir|aterriza|humana|emoc)/.test(lower);
  const coldTechnicalAbsence = !/(orbe exacto|grado exacto|protocolo|estadística|configuración técnica)/.test(lower);
  const clearHumanLanguage = /(puede|conviene|a veces|no siempre|escuchar|observa|humano|sin presión)/.test(lower);
  const qualityBoost = (regulationNeuronPresent ? 0.12 : 0)
    + (emotionalTranslationPresent ? 0.1 : 0)
    + (coldTechnicalAbsence ? 0.08 : 0)
    + (clearHumanLanguage ? 0.08 : 0);

  return {
    clarity: clamp01(0.25 + (1 - Math.abs(avgSentenceLength - 18) / 18) * 0.75),
    naturalness: clamp01(lexicalScore(['hoy', 'puede', 'quizás', 'sentir', 'conviene', 'a veces', 'no siempre']) + contemplativeSignals * 0.7 - roboticPenalty),
    warmth: clamp01(lexicalScore(['acompaña', 'cuidado', 'respira', 'gentil', 'humano', 'contención', 'sin presión', 'date espacio'], 0.24, 0.11) + contemplativeSignals * 0.75),
    usefulness: Math.max(
      regulationNeuronPresent ? 0.5 : 0,
      clamp01(lexicalScore(['traducir', 'aterrizar', 'llevar', 'paso', 'guía', 'práctica', 'cómo', 'regular', 'observar', 'conviene'], 0.24, 0.1) + appliedGuidanceSignals * 0.65 + translationSignals * 0.4 + qualityBoost),
    ),
    coherence: clamp01(sentences.length >= 3 ? 0.86 : 0.62),
    emotionalResonance: clamp01(lexicalScore(['sentir', 'miedo', 'amor', 'deseo', 'incomodidad', 'alivio', 'por dentro', 'internamente', 'sin presión'], 0.24, 0.11) + contemplativeSignals * 0.8 + qualityBoost * 0.85),
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
  const lowerText = normalizeText(result?.source?.text || result?.sourceText || '');
  const abstractionExpected = STRONG_ABSTRACTION_PATTERNS.some((regex) => regex.test(lowerText));
  const hasSpecificSensation = validNeurons.some((neuron) => neuron.category === 'sensation' && !isWeakSensationCandidate(neuron));
  const hasCoherence = categories.has('event') && categories.has('regulation') && hasSpecificSensation && (!abstractionExpected || categories.has('abstraction'));
  const voiceSoftEnough = !/(puede|conviene|a veces|no siempre|internamente|escuchar|observar)/.test(lowerText)
    || (result?.voiceLearning?.softness ?? 0) >= 0.4;
  const usefulEnough = !/(tr[aá]nsito|luna|piscis|regul|respira|observa|conviene|espacio)/.test(lowerText)
    || (result?.qualityAssessment?.usefulness ?? 0) >= 0.4;

  return {
    valid: validNeurons.length >= 4 && hasCoherence && voiceSoftEnough && usefulEnough,
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
    source: { ...source, text },
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
