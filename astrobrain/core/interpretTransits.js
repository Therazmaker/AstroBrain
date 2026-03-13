const fs = require('fs');
const path = require('path');
const filterTransits = require('./filterTransits');
const { buildNarrative, toneFromScore } = require('./narrativeEngine');
const { refineNarrative } = require('./cerebellum');
const neuralNet = require('./neuralNet');

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
  const baseNarrative = buildNarrative({
    interpretedTransits,
    activatedNeurons,
    memoryPhrases: [
      ...memoryPhrases,
      ...metaSignals.map((signal) => signal.then),
    ],
  });

  const tone = toneFromScore(interpretedTransits[0]?.score || 0);
  const narrative = refineNarrative(baseNarrative, tone);

  const improvedNarrative = neuralNet.assessNarrativeRelevance({ clusterScores, metaSignals });
  const learnedWeights = neuralNet.updateWeights(activatedNeurons, { improvedNarrative });

  return {
    topTransits: interpretedTransits,
    activatedNeurons,
    memoryPhrases,
    narrative,
    clusterScores,
    metaSignals,
    generatedNeurons,
    learnedWeights,
  };
}

module.exports = interpretTransits;
