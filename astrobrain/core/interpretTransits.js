const fs = require('fs');
const path = require('path');
const filterTransits = require('./filterTransits');
const { buildNarrative, toneFromScore } = require('./narrativeEngine');
const { refineNarrative } = require('./cerebellum');
const neuralNet = require('./neuralNet');
const { mapEmotionToSituations } = require('./worldModel');
const { getRecentContext, updateContextMemory, buildContextSummary } = require('./contextMemory');
const { counterbalance } = require('./counterbalance');
const { anticipateOutcome } = require('./anticipation');
const { applyPersonalityTone, softenStatements } = require('./personalityTone');
const { recordFeedback, adjustWeightsFromFeedback } = require('./feedbackLoop');
const { loadProfile, personalizeNarrative } = require('./natalProfile');
const { enrichTransits } = require('./enrichTransitContext');

const BASE_MEANINGS = {
  Mars: 'impulse / anger',
  Saturn: 'pressure / block',
  Moon: 'sensitivity',
  Mercury: 'mind',
  Venus: 'desire',
  Jupiter: 'expansion',
  Sun: 'clarity',
};

function loadJson(fileName) {
  const filePath = path.join(__dirname, '..', 'memory', fileName);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function keyForTransit(transit) {
  return `${transit.planet}_${transit.aspect}_${transit.target}`.toLowerCase();
}

function emotionalTranslation(transit) {
  const planet = transit.planet;
  const aspect = transit.aspect;
  const target = transit.target;
  const context = transit.context || {};
  const tags = transit.derivedTags || [];

  if (planet === 'Moon' && aspect === 'square' && target === 'Venus') {
    if (tags.includes('tono_afectivo_impulsivo')) {
      return {
        emotion: 'reactivity',
        action: 'podrías notar impulso afectivo y poca paciencia emocional; conviene pausar antes de responder',
      };
    }

    if ((context.targetElement || '').toLowerCase() === 'agua') {
      return {
        emotion: 'sensitivity',
        action: 'puede sentirse una necesidad fuerte de conexión; tal vez ayude hablar desde la vulnerabilidad',
      };
    }
  }

  if (planet === 'Mars' && aspect === 'square') {
    return { emotion: 'frustration', action: 'conviene canalizar el calor en movimiento antes de conversaciones tensas' };
  }

  if (planet === 'Moon' && target === 'Mars') {
    return { emotion: 'reactivity', action: 'puedes bajar el ritmo y nombrar lo que sientes primero' };
  }

  if (planet === 'Mars' && target === 'Moon') {
    return { emotion: 'reactivity', action: 'quizás ayude responder con pausa en lugar de reaccionar al instante' };
  }

  if (planet === 'Venus' && aspect === 'trine') {
    return { emotion: 'harmony', action: 'puede sentirse más fácil abrirte al vínculo y al apoyo mutuo' };
  }

  if (planet === 'Saturn' && aspect === 'conjunction') {
    return { emotion: 'heaviness', action: 'conviene ir paso a paso con lo responsable sin exigirte de más' };
  }

  return {
    emotion: BASE_MEANINGS[planet] || 'emotional movement',
    action: 'quizás convenga sostener un ritmo intencional y simple',
  };
}

function gatherMemoryPhrases(transits, hippocampus) {
  const phrases = [];
  transits.forEach((transit) => {
    const key = keyForTransit(transit);
    if (hippocampus[key]?.phrases) {
      phrases.push(...hippocampus[key].phrases);
    }
  });
  return [...new Set(phrases)];
}

function dominantClusterFromScores(clusterScores = {}) {
  const entries = Object.entries(clusterScores);
  if (!entries.length) return 'actional';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function buildSituationSummary(emotions = []) {
  const situations = emotions
    .flatMap((emotion) => mapEmotionToSituations(emotion))
    .filter(Boolean);

  if (!situations.length) return '';
  return `likely human situations: ${[...new Set(situations)].join(', ')}`;
}

function estimateTension(interpretedTransits = [], topScore = 0) {
  const tenseEmotions = ['frustration', 'reactivity', 'heaviness', 'pressure'];
  const emotionHits = interpretedTransits.filter((transit) => tenseEmotions.includes(transit.emotion)).length;
  const scoreTension = topScore >= 8 ? 1 : 0;
  return emotionHits + scoreTension;
}

function applyHumanLayer(narrative, tone, recentContext) {
  const next = {};
  Object.entries(narrative).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      next[key] = value;
      return;
    }

    const withTone = applyPersonalityTone(value);
    next[key] = softenStatements(withTone);
  });

  if (recentContext.length) {
    const last = recentContext[recentContext.length - 1];
    next.focus = `${next.focus}. Recent continuity: ${last.emotion} with a ${last.tone} tone.`;
  }

  return refineNarrative(next, tone);
}

function interpretTransits(transits = []) {
  const sessionId = Date.now().toString();
  const hippocampus = loadJson('hippocampus.json');

  const enrichedTransits = enrichTransits(transits);
  const prioritized = filterTransits(enrichedTransits, 3);
  const interpretedTransits = prioritized.map((transit) => ({
    ...transit,
    ...emotionalTranslation(transit),
    neuronId: neuralNet.neuronIdFromTransit(transit),
  }));

  const transitActivations = neuralNet.resolveTransitActivations(interpretedTransits);
  const activatedNeurons = neuralNet.activateNeurons(interpretedTransits);
  neuralNet.logCoactivations(activatedNeurons);
  const generatedNeurons = neuralNet.generateNewNeurons();

  const clusterScores = neuralNet.clusterNeurons(activatedNeurons);
  const metaSignals = neuralNet.generateMetaSignals(activatedNeurons);
  const memoryPhrases = gatherMemoryPhrases(interpretedTransits, hippocampus);

  const emotionStates = interpretedTransits.map((transit) => transit.emotion).filter(Boolean);
  const situationSummary = buildSituationSummary(emotionStates);

  const frasesNeuronales = activatedNeurons
    .flatMap((neuron) => [neuron.output?.energy, neuron.output?.focus])
    .filter(Boolean);

  const compositeNarrativeSignals = neuralNet.buildCompositeNarrativeSignals({
    primaryNeuron: transitActivations[0]?.activation?.primaryNeuron,
    secondaryNeurons: transitActivations[0]?.activation?.secondaryNeurons || [],
  });

  const baseNarrative = buildNarrative({
    interpretedTransits,
    activatedNeurons,
    memoryPhrases: [
      ...memoryPhrases,
      ...metaSignals.map((signal) => signal.then),
      ...frasesNeuronales,
      ...compositeNarrativeSignals.energy,
      ...compositeNarrativeSignals.avoid,
      situationSummary,
    ],
  });

  const tone = toneFromScore(interpretedTransits[0]?.score || 0);
  const tension = estimateTension(interpretedTransits, interpretedTransits[0]?.score || 0);
  const anticipation = anticipateOutcome({
    emotionalCluster: clusterScores.emotional,
    tension,
  });

  const withAnticipation = anticipation
    ? { ...baseNarrative, focus: `${baseNarrative.focus}, ${anticipation}` }
    : baseNarrative;

  const withComposite = compositeNarrativeSignals.dominantFocus
    ? { ...withAnticipation, focus: `${withAnticipation.focus}. Matiz dominante: ${compositeNarrativeSignals.dominantFocus}` }
    : withAnticipation;

  const balancedNarrative = counterbalance(withComposite);

  const dominantCluster = dominantClusterFromScores(clusterScores);
  const recentContext = getRecentContext();

  const contextualSummary = buildContextSummary();
  const withContextSummary = contextualSummary
    ? { ...balancedNarrative, focus: `${balancedNarrative.focus} ${contextualSummary}` }
    : balancedNarrative;

  const narrative = applyHumanLayer(withContextSummary, tone, recentContext);

  const profile = loadProfile();
  const personalizedNarrative = profile
    ? personalizeNarrative(
      {
        ...narrative,
        activeTransit: interpretedTransits[0],
      },
      profile,
    )
    : narrative;

  delete personalizedNarrative.activeTransit;

  const improvedNarrative = neuralNet.assessNarrativeRelevance({ clusterScores, metaSignals });
  const learnedWeights = neuralNet.updateWeights(activatedNeurons, { improvedNarrative });
  const feedbackAdjustedWeights = adjustWeightsFromFeedback();
  const prunedWeights = neuralNet.pruneWeakNeurons();

  const updatedContext = updateContextMemory({
    date: new Date().toISOString().slice(0, 10),
    emotion: emotionStates[0] || 'mixed',
    tone,
    dominantCluster,
  });

  const submitFeedback = (rating) => recordFeedback({
    sessionId,
    rating,
    narrative: {
      ...personalizedNarrative,
      activeNeuronIds: activatedNeurons.map((neuron) => neuron.id),
    },
  });

  return {
    sessionId,
    topTransits: interpretedTransits,
    transitActivations,
    activatedNeurons,
    memoryPhrases,
    narrative: personalizedNarrative,
    clusterScores,
    dominantCluster,
    metaSignals,
    generatedNeurons,
    learnedWeights,
    feedbackAdjustedWeights,
    prunedWeights,
    contextMemory: updatedContext,
    recordFeedback: submitFeedback,
  };
}

module.exports = interpretTransits;
