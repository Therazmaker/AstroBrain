const fs = require('fs');
const path = require('path');
const filterTransits = require('./filterTransits');
const { buildNarrative, toneFromScore } = require('./narrativeEngine');
const { refineNarrative } = require('./cerebellum');
const neuralNet = require('./neuralNet');
const { mapEmotionToSituations } = require('./worldModel');
const { getRecentContext, updateContextMemory } = require('./contextMemory');
const { counterbalance } = require('./counterbalance');
const { anticipateOutcome } = require('./anticipation');
const { applyPersonalityTone, softenStatements } = require('./personalityTone');

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
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function keyForTransit(transit) {
  return `${transit.planet}_${transit.aspect}_${transit.target}`.toLowerCase();
}

function emotionalTranslation(transit) {
  const planet = transit.planet;
  const aspect = transit.aspect;
  const target = transit.target;

  if (planet === 'Mars' && aspect === 'square') {
    return { emotion: 'frustration', action: 'channel heat into movement before hard talks' };
  }

  if (planet === 'Moon' && target === 'Mars') {
    return { emotion: 'reactivity', action: 'slow down and name what you feel first' };
  }

  if (planet === 'Mars' && target === 'Moon') {
    return { emotion: 'reactivity', action: 'respond, do not react in the moment' };
  }

  if (planet === 'Venus' && aspect === 'trine') {
    return { emotion: 'harmony', action: 'lean into connection and support' };
  }

  if (planet === 'Saturn' && aspect === 'conjunction') {
    return { emotion: 'heaviness', action: 'do one responsible thing at a time' };
  }

  return {
    emotion: BASE_MEANINGS[planet] || 'emotional movement',
    action: 'keep your pace intentional and simple',
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
  const hippocampus = loadJson('hippocampus.json');

  const prioritized = filterTransits(transits, 3);
  const interpretedTransits = prioritized.map((transit) => ({
    ...transit,
    ...emotionalTranslation(transit),
    neuronId: neuralNet.neuronIdFromTransit(transit),
  }));

  const activatedNeurons = neuralNet.activateNeurons(interpretedTransits);
  neuralNet.logCoactivations(activatedNeurons);
  const generatedNeurons = neuralNet.generateNewNeurons();

  const clusterScores = neuralNet.clusterNeurons(activatedNeurons);
  const metaSignals = neuralNet.generateMetaSignals(activatedNeurons);
  const memoryPhrases = gatherMemoryPhrases(interpretedTransits, hippocampus);

  const emotionStates = interpretedTransits.map((transit) => transit.emotion).filter(Boolean);
  const situationSummary = buildSituationSummary(emotionStates);

  const baseNarrative = buildNarrative({
    interpretedTransits,
    activatedNeurons,
    memoryPhrases: [
      ...memoryPhrases,
      ...metaSignals.map((signal) => signal.then),
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

  const balancedNarrative = counterbalance(withAnticipation);

  const dominantCluster = dominantClusterFromScores(clusterScores);
  const recentContext = getRecentContext();

  const narrative = applyHumanLayer(balancedNarrative, tone, recentContext);

  const improvedNarrative = neuralNet.assessNarrativeRelevance({ clusterScores, metaSignals });
  const learnedWeights = neuralNet.updateWeights(activatedNeurons, { improvedNarrative });

  const updatedContext = updateContextMemory({
    date: new Date().toISOString().slice(0, 10),
    emotion: emotionStates[0] || 'mixed',
    tone,
    dominantCluster,
  });

  return {
    topTransits: interpretedTransits,
    activatedNeurons,
    memoryPhrases,
    narrative,
    clusterScores,
    dominantCluster,
    metaSignals,
    generatedNeurons,
    learnedWeights,
    contextMemory: updatedContext,
  };
}

module.exports = interpretTransits;
