function joinUnique(values) {
  return [...new Set((values || []).filter(Boolean))].join(', ');
}

function toneFromScore(score) {
  if (score > 9) return 'intense';
  if (score >= 6) return 'active';
  return 'soft';
}

function detectDominantCluster(activatedNeurons = []) {
  const counts = {
    emotional: 0,
    mental: 0,
    relational: 0,
    actional: 0,
  };

  activatedNeurons.forEach((neuron) => {
    const tag = neuron.tags?.[0] || 'actional';
    counts[tag] = (counts[tag] || 0) + 1;
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}


function construirMatizContextual(transit = {}) {
  const tags = transit.derivedTags || [];
  const contexto = transit.context || {};

  if (tags.includes('tono_afectivo_impulsivo')) {
    return 'puede sentirse un impulso afectivo rápido, con deseo de cercanía y fricción inmediata';
  }

  if (
    transit.planet === 'Saturn' &&
    transit.aspect === 'conjunction' &&
    transit.target === 'Sun' &&
    contexto.strengthLabel === 'fuerte'
  ) {
    return 'quizás notes un llamado serio a ordenar prioridades con disciplina y paciencia';
  }

  if (
    transit.planet === 'Mars' &&
    transit.aspect === 'conjunction' &&
    contexto.targetElement === 'fuego'
  ) {
    return 'la energía puede expresarse con iniciativa directa; conviene actuar sin atropellar los tiempos';
  }

  return '';
}


function applyLearnedMemoryAdjustments(baseNarrative, learnedMemory = {}) {
  const voice = learnedMemory.voiceMemory || {};
  const quality = learnedMemory.qualityMemory || {};

  const narrative = { ...baseNarrative };
  if ((voice.warmth || 0) > 0.65) {
    narrative.energy = `${narrative.energy} Mantén calidez explícita y cercanía humana en el tono.`;
  }
  if ((voice.directness || 0) > 0.65) {
    narrative.focus = `${narrative.focus} Prioriza una instrucción concreta y accionable.`;
  }
  if ((quality.clarity || 0) < 0.45) {
    narrative.avoid = `${narrative.avoid} Evita frases largas o ambiguas.`;
  }
  return narrative;
}

function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

const TEMPLATE_BANK = {
  intense: [
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `Voltage is high: ${joinUnique(emotions) || 'storm intensity'} is running loud through the system.`,
      avoid: `Avoid ${joinUnique(memoryPhrases) || 'knee-jerk escalation'} while the signal peaks.`,
      use: `Use ${joinUnique(actions) || 'decisive, grounded movement'} to direct the surge.`,
      focus: `Focus on ${joinUnique(situations) || 'one clear conversation and one clear task'} before the next wave.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `This is fire-weather: ${joinUnique(emotions) || 'strong feeling states'} are sharpened and immediate.`,
      avoid: `Avoid turning pressure into conflict; skip ${joinUnique(memoryPhrases) || 'old narratives on repeat'}.`,
      use: `Use ${joinUnique(actions) || 'deliberate effort'} like a controlled burn, not an explosion.`,
      focus: `Focus your force toward ${joinUnique(situations) || 'a single priority window'} and protect your bandwidth.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `Intensity is concentrated now, with ${joinUnique(emotions) || 'deep emotional activation'} at the center.`,
      avoid: `Avoid overextension and ${joinUnique(memoryPhrases) || 'performative certainty'}.`,
      use: `Use ${joinUnique(actions) || 'intentional pacing'} to keep momentum aligned with values.`,
      focus: `Focus on ${joinUnique(situations) || 'what is urgent and truly yours to hold'} first.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `The atmosphere is loud and catalytic: ${joinUnique(emotions) || 'charged emotional signals'} demand skillful handling.`,
      avoid: `Avoid drama loops, especially ${joinUnique(memoryPhrases) || 'reactive interpretation of events'}.`,
      use: `Use ${joinUnique(actions) || 'body-first regulation and brave honesty'} to convert friction into traction.`,
      focus: `Focus on ${joinUnique(situations) || 'direct, time-bounded action'} and leave the rest for later.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `You are in a pressure chamber; ${joinUnique(emotions) || 'active inner weather'} amplifies quickly.`,
      avoid: `Avoid scattering power through ${joinUnique(memoryPhrases) || 'too many simultaneous battles'}.`,
      use: `Use ${joinUnique(actions) || 'clear boundaries and tactical effort'} to keep signal coherent.`,
      focus: `Focus where stakes are real: ${joinUnique(situations) || 'repair, leadership, and essential decisions'}.`,
    }),
  ],
  active: [
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `Momentum is building with ${joinUnique(emotions) || 'mixed but workable energy'}.`,
      avoid: `Avoid ${joinUnique(memoryPhrases) || 'rushing without checking intention'}.`,
      use: `Use ${joinUnique(actions) || 'consistent forward movement'} to make progress visible.`,
      focus: `Focus on ${joinUnique(situations) || 'practical wins that restore confidence'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `This cycle favors engaged effort; ${joinUnique(emotions) || 'daily emotional signals'} can fuel output.`,
      avoid: `Avoid split focus and ${joinUnique(memoryPhrases) || 'trying to solve every problem at once'}.`,
      use: `Use ${joinUnique(actions) || 'structured action blocks'} to stay effective.`,
      focus: `Focus on ${joinUnique(situations) || 'communication and strategic execution'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `The tone is kinetic: ${joinUnique(emotions) || 'alive, responsive energy'} can be directed well.`,
      avoid: `Avoid friction habits such as ${joinUnique(memoryPhrases) || 'defending before listening'}.`,
      use: `Use ${joinUnique(actions) || 'small courageous actions'} and iterate.`,
      focus: `Focus on ${joinUnique(situations) || 'where collaboration and timing matter most'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `Your field is active and adaptive, colored by ${joinUnique(emotions) || 'current emotional data'}.`,
      avoid: `Avoid unnecessary complexity and ${joinUnique(memoryPhrases) || 'mental looping'}.`,
      use: `Use ${joinUnique(actions) || 'clear sequencing'} to keep momentum stable.`,
      focus: `Focus on ${joinUnique(situations) || 'decisions that unlock next steps'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `There is workable traction today; ${joinUnique(emotions) || 'inner movement'} supports practical change.`,
      avoid: `Avoid energy leaks, especially ${joinUnique(memoryPhrases) || 'habitual detours'}.`,
      use: `Use ${joinUnique(actions) || 'disciplined responsiveness'} to shape outcomes.`,
      focus: `Focus on ${joinUnique(situations) || 'the few actions with highest return'}.`,
    }),
  ],
  soft: [
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `The atmosphere is gentler, with ${joinUnique(emotions) || 'subtle emotional movement'} asking for care.`,
      avoid: `Avoid ${joinUnique(memoryPhrases) || 'forcing clarity before it is ready'}.`,
      use: `Use ${joinUnique(actions) || 'slow attunement and patient choices'} as your rhythm.`,
      focus: `Focus on ${joinUnique(situations) || 'restorative connection and quiet progress'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `This feels like low tide: ${joinUnique(emotions) || 'quiet tides of feeling'} reveal what matters.`,
      avoid: `Avoid hard edges and ${joinUnique(memoryPhrases) || 'self-pressure scripts'}.`,
      use: `Use ${joinUnique(actions) || 'compassionate pacing'} to rebuild trust with yourself.`,
      focus: `Focus on ${joinUnique(situations) || 'gentle conversations and nervous-system repair'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `Energy is soft but meaningful; ${joinUnique(emotions) || 'inner signals'} are easier to hear now.`,
      avoid: `Avoid numbing patterns and ${joinUnique(memoryPhrases) || 'avoidance disguised as patience'}.`,
      use: `Use ${joinUnique(actions) || 'presence, breath, and simple honesty'}.`,
      focus: `Focus on ${joinUnique(situations) || 'small acts that restore emotional coherence'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `A quieter current is moving through: ${joinUnique(emotions) || 'sensitive states'} deserve room.`,
      avoid: `Avoid overcommitting and ${joinUnique(memoryPhrases) || 'performing certainty for others'}.`,
      use: `Use ${joinUnique(actions) || 'steady, minimal actions'} and let them compound.`,
      focus: `Focus on ${joinUnique(situations) || 'healing pacing and clear emotional boundaries'}.`,
    }),
    ({ emotions, actions, memoryPhrases, situations }) => ({
      energy: `The signal is tender; ${joinUnique(emotions) || 'gentle emotional weather'} can still guide wise movement.`,
      avoid: `Avoid harsh self-talk and ${joinUnique(memoryPhrases) || 'old fear narratives'}.`,
      use: `Use ${joinUnique(actions) || 'ritual, reflection, and honest check-ins'} to stay anchored.`,
      focus: `Focus on ${joinUnique(situations) || 'what nourishes trust, stability, and warmth'}.`,
    }),
  ],
};

function buildNarrative({ interpretedTransits = [], activatedNeurons = [], memoryPhrases = [], learnedMemory = {} }) {
  const topScore = interpretedTransits[0]?.score || 0;
  const tone = toneFromScore(topScore);

  const emotions = interpretedTransits.map((t) => t.emotion).filter(Boolean);
  const actions = interpretedTransits.map((t) => t.action).filter(Boolean);
  const situations = memoryPhrases
    .filter((phrase) => typeof phrase === 'string' && phrase.includes('likely human situations:'))
    .flatMap((phrase) => phrase.replace('likely human situations:', '').split(','))
    .map((item) => item.trim())
    .filter(Boolean);

  const dominantCluster = detectDominantCluster(activatedNeurons);
  const templates = TEMPLATE_BANK[tone];
  const selector = (dayOfYear() + dominantCluster.length) % templates.length;
  const contextualLines = interpretedTransits
    .map((transit) => construirMatizContextual(transit))
    .filter(Boolean);

  const base = templates[selector]({
    emotions,
    actions,
    memoryPhrases,
    situations,
  });

  const narrativeBase = contextualLines.length
    ? {
      ...base,
      energy: `${base.energy} ${contextualLines.join('. ')}.`,
    }
    : base;

  return applyLearnedMemoryAdjustments(narrativeBase, learnedMemory);
}

module.exports = {
  buildNarrative,
  toneFromScore,
  applyLearnedMemoryAdjustments,
};
