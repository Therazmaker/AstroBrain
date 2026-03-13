const fs = require('fs');
const path = require('path');
const filterTransits = require('./filterTransits');
const { buildNarrative } = require('./narrativeEngine');

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

function activateNeurons(transits, neurons) {
  return neurons.filter((neuron) =>
    transits.some(
      (transit) =>
        neuron.if.planet === transit.planet &&
        neuron.if.aspect === transit.aspect &&
        neuron.if.target === transit.target,
    ),
  );
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
  const neurons = loadJson('neurons.json');

  const prioritized = filterTransits(transits, 3);
  const interpretedTransits = prioritized.map((transit) => ({
    ...transit,
    ...emotionalTranslation(transit),
  }));

  const activatedNeurons = activateNeurons(interpretedTransits, neurons);
  const memoryPhrases = gatherMemoryPhrases(interpretedTransits, hippocampus);
  const narrative = buildNarrative({
    interpretedTransits,
    activatedNeurons,
    memoryPhrases,
  });

  return {
    topTransits: interpretedTransits,
    activatedNeurons,
    memoryPhrases,
    narrative,
  };
}

module.exports = interpretTransits;
