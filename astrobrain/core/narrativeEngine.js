function clamp01(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function toneFromScore(score) {
  if (score > 9) return 'intense';
  if (score >= 6) return 'active';
  return 'soft';
}

function normalizeToken(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectNeuronCategory(neuron = {}) {
  if (neuron.category) return neuron.category;
  const id = normalizeToken(neuron.id || neuron.match);
  if (/luna|eclipse|transito|tr[aá]nsito|evento|conjunc|cuadratura|oposici/.test(id)) return 'event';
  if (/sentir|emoc|incomod|pausa|intern|reactiv/.test(id)) return 'sensation';
  if (/regul|bajar|respira|escucha|silencio|ritmo/.test(id)) return 'regulation';
  if (/antes|despu[eé]s|proceso|invisible|claridad|inicio/.test(id)) return 'abstraction';
  return 'abstraction';
}

function neuronConfidence(neuron = {}) {
  const confidence = Number(neuron.confidence);
  if (Number.isFinite(confidence)) return confidence;
  const score = Number(neuron.score);
  if (Number.isFinite(score)) return Math.max(0.3, Math.min(0.99, score / 10));
  return 0.62;
}

function toNarrativeLabel(neuron = {}) {
  const base = normalizeToken(neuron.match || neuron.id || 'movimiento interno');
  const cleaned = base
    .replace(/\bsemantic\b/g, '')
    .replace(/\bpattern\b/g, '')
    .replace(/\bneuron\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'movimiento interno';
}

function uniqueById(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.id || item.match || JSON.stringify(item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
}

function prioritizeNeurons(neurons = []) {
  const normalized = uniqueById(neurons)
    .map((neuron) => ({
      ...neuron,
      category: detectNeuronCategory(neuron),
      confidence: neuronConfidence(neuron),
      narrativeLabel: toNarrativeLabel(neuron),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const pick = (categoryList, max) => normalized
    .filter((item) => categoryList.includes(item.category))
    .slice(0, max);

  const core = [
    ...pick(['event'], 1),
    ...pick(['abstraction'], 1),
  ];

  if (!core.length) core.push(...normalized.slice(0, 2));

  const used = new Set(core.map((item) => item.id || item.match));
  const supportPool = normalized.filter((item) => !used.has(item.id || item.match));

  const support = [
    ...supportPool.filter((item) => item.category === 'sensation').slice(0, 1),
    ...supportPool.filter((item) => item.category === 'abstraction').slice(0, 1),
  ];

  const context = supportPool.filter((item) => item.category === 'regulation').slice(0, 1);

  return {
    core: core.slice(0, 2),
    support: support.slice(0, 2),
    context: context.slice(0, 1),
  };
}

function openingFromNeurons(core = [], support = []) {
  const event = core.find((item) => item.category === 'event') || core[0] || support[0];
  const sensation = support.find((item) => item.category === 'sensation') || support[0];
  const eventLabel = event?.narrativeLabel || 'este tránsito';
  const sensationLabel = sensation?.narrativeLabel || 'una sensación difícil de nombrar';
  return `Hoy ${eventLabel} puede sentirse menos evidente de lo esperado, con ${sensationLabel} abriendo espacio para mirar hacia adentro.`;
}

function translationFromNeurons(core = [], support = []) {
  const abstraction = core.find((item) => item.category === 'abstraction')
    || support.find((item) => item.category === 'abstraction')
    || core[0]
    || support[0];
  const abstractionLabel = abstraction?.narrativeLabel || 'un proceso interno en marcha';
  return `Muchas veces primero se siente y después se entiende: ${abstractionLabel} puede estar acomodándose en silencio antes de mostrarse con claridad.`;
}

function regulationFromNeurons(context = [], patterns = []) {
  const regulator = context[0];
  const regulationLabel = regulator?.narrativeLabel || 'bajar un poco el ritmo para escuchar mejor';
  const normalizedLabel = /^conviene\s+/i.test(regulationLabel)
    ? regulationLabel.replace(/^conviene\s+/i, '')
    : regulationLabel;
  const finalLabel = /^(conviene|regular)$/i.test(normalizedLabel)
    ? 'bajar un poco el ritmo para escuchar mejor'
    : normalizedLabel;
  const patternHint = patterns.includes('cierre_regulacion')
    ? 'Un cierre suave ayuda a sostener lo importante sin forzarlo.'
    : 'Tomarlo con calma puede traer más claridad que insistir.';
  return `Por ahora conviene ${finalLabel}. ${patternHint}`;
}

function buildNarrativeStructure(prioritizedNeurons = {}, patterns = []) {
  const { core = [], support = [], context = [] } = prioritizedNeurons;
  return {
    opening: openingFromNeurons(core, support),
    translation: translationFromNeurons(core, support),
    regulation: regulationFromNeurons(context, patterns),
  };
}

function breakLongSentence(text = '', maxWords = 22) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;

  const first = words.slice(0, maxWords).join(' ');
  const second = words.slice(maxWords).join(' ');
  return `${first}. ${second}`;
}

function applyVoiceProfile(text = '', voiceProfile = {}) {
  const softness = clamp01(voiceProfile.softness, 0.65);
  const emotionality = clamp01(voiceProfile.emotionality, 0.62);
  const symbolism = clamp01(voiceProfile.symbolism, 0.45);
  const directness = clamp01(voiceProfile.directness, 0.35);

  let output = text
    .replace(/\bdebes\b/gi, 'conviene')
    .replace(/\btienes que\b/gi, 'puede ayudarte')
    .replace(/\bsignifica que\b/gi, 'puede sentirse como');

  if (softness > 0.65) {
    output = output
      .replace(/\./g, '. ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\bhay\b/gi, 'a veces hay');
  }

  if (emotionality > 0.65 && !/por dentro|internamente/.test(output)) {
    output = `${output} Por dentro, esto puede tocar fibras sensibles.`;
  }

  if (symbolism >= 0.4 && symbolism <= 0.75 && !/como si|marea|semilla/.test(output)) {
    output = output.replace(/antes de mostrarse con claridad\./, 'antes de mostrarse con claridad, como una semilla bajo tierra.');
  }

  if (directness < 0.45) {
    output = output
      .replace(/\bhaz\b/gi, 'quizás notes que ayuda')
      .replace(/\belige\b/gi, 'puede servir elegir');
  }

  return output.replace(/\s+/g, ' ').trim();
}

function applyLearnedRules(text = '', learnedRules = []) {
  let output = text;
  const joined = learnedRules.join(' · ').toLowerCase();

  if (joined.includes('modales suaves')) {
    output = output
      .replace(/\bdebe\b/gi, 'puede')
      .replace(/\bes necesario\b/gi, 'conviene');
  }

  if (joined.includes('tensión con sentido personal')) {
    output = `${output} Lo que incomoda también puede revelar qué parte de ti necesita más cuidado.`;
  }

  if (joined.includes('cerrar con regulación')) {
    output = output.replace(/Por ahora conviene/gi, 'Al final, conviene');
  }

  return output;
}

function refineNarrative(text = '') {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => line.replace(/\s+/g, ' '));

  const cleaned = paragraphs.map((paragraph) => {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .map((sentence) => breakLongSentence(sentence, 22));

    const uniqueSentences = [];
    const seen = new Set();
    sentences.forEach((sentence) => {
      const key = sentence.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueSentences.push(sentence);
      }
    });

    return uniqueSentences.join(' ');
  });

  return cleaned.join('\n\n');
}

function synthesizeNarrative({
  activeNeurons = [],
  narrativePatterns = [],
  voiceProfile = {},
  learnedRules = [],
} = {}) {
  const prioritized = prioritizeNeurons(activeNeurons);
  const structure = buildNarrativeStructure(prioritized, narrativePatterns);

  const draft = [
    structure.opening,
    structure.translation,
    structure.regulation,
  ].join('\n\n');

  const voiced = applyVoiceProfile(draft, voiceProfile);
  const learned = applyLearnedRules(voiced, learnedRules);
  const narrative = refineNarrative(learned);

  const parts = narrative.split(/\n\n/);

  return {
    text: narrative,
    prioritizedNeurons: prioritized,
    structure,
    energy: parts[0] || structure.opening,
    focus: parts[1] || structure.translation,
    use: parts[2] || structure.regulation,
    avoid: 'Evita forzar definiciones antes de que el proceso madure.',
  };
}

function buildNarrative({
  interpretedTransits = [],
  activatedNeurons = [],
  narrativePatterns = [],
  voiceProfile = {},
  learnedRules = [],
} = {}) {
  const transitNeurons = interpretedTransits.map((transit) => ({
    id: transit.neuronId || `${transit.planet}_${transit.aspect}_${transit.target}`,
    match: `${transit.planet} ${transit.aspect} ${transit.target}`,
    category: 'event',
    confidence: Math.max(0.6, (Number(transit.score) || 5) / 10),
  }));

  return synthesizeNarrative({
    activeNeurons: [...activatedNeurons, ...transitNeurons],
    narrativePatterns,
    voiceProfile,
    learnedRules,
  });
}

module.exports = {
  toneFromScore,
  prioritizeNeurons,
  buildNarrativeStructure,
  applyVoiceProfile,
  applyLearnedRules,
  refineNarrative,
  synthesizeNarrative,
  buildNarrative,
};
