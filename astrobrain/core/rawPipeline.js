const fs = require('fs');
const path = require('path');
const { parseRaw } = require('./rawParser');
const { refineNarrative } = require('./cerebellum');

const HIPPOCAMPUS_PATH = path.join(__dirname, '..', 'memory', 'hippocampus.json');

function readHippocampus() {
  try {
    return JSON.parse(fs.readFileSync(HIPPOCAMPUS_PATH, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function writeHippocampus(memory) {
  fs.writeFileSync(HIPPOCAMPUS_PATH, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function safeKey(text = '') {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}

const hippocampus = {
  store(signals = {}) {
    const memory = readHippocampus();
    const key = `raw_${safeKey(signals.rawText || 'input') || 'input'}`;

    const patterns = unique([
      ...signals.emotions,
      ...signals.situations.map((sentence) => sentence.toLowerCase()),
    ]).slice(0, 20);

    const adviceStructures = unique(
      signals.advice.map((line) => line.replace(/\s+/g, ' ').trim().toLowerCase()),
    ).slice(0, 20);

    const usefulPhrases = unique([
      ...signals.repeatedPhrases.map((item) => item.phrase),
      ...signals.advice.map((line) => line.toLowerCase()),
    ]).slice(0, 20);

    memory[key] = {
      emotion: signals.emotions.join(', ') || 'mixed',
      tone: signals.tone,
      phrases: usefulPhrases,
      usefulPhrases,
      patterns,
      adviceStructures,
      situations: signals.situations,
      advice: signals.advice,
      updatedAt: new Date().toISOString(),
    };

    writeHippocampus(memory);

    return {
      key,
      ...memory[key],
    };
  },
};

const cortex = {
  process(signals = {}, memoryEntry = {}) {
    return {
      emotionalLoad: signals.emotions.length,
      tone: signals.tone,
      reasoningInputs: {
        prioritizeRegulation: ['intense', 'active'].includes(signals.tone),
        contextWindows: signals.situations,
        adviceCandidates: signals.advice,
        repeatedFocus: signals.repeatedPhrases.map((item) => item.phrase),
      },
      memoryPatterns: memoryEntry.patterns || [],
      memoryAdviceStructures: memoryEntry.adviceStructures || [],
    };
  },
};

const neuralNet = {
  activate(reasoning = {}) {
    const neurons = [];

    if (reasoning.emotionalLoad >= 2) neurons.push('emotion_regulation');
    if ((reasoning.reasoningInputs?.adviceCandidates || []).length) neurons.push('directive_planning');
    if ((reasoning.reasoningInputs?.contextWindows || []).length) neurons.push('situational_awareness');
    if ((reasoning.reasoningInputs?.repeatedFocus || []).length) neurons.push('pattern_interrupt');
    if (reasoning.tone === 'soft') neurons.push('gentle_momentum');

    return unique(neurons);
  },
};

const worldModel = {
  map({ signals = {}, neurons = [] }) {
    return {
      dominantEmotion: signals.emotions[0] || 'mixed',
      pressure: signals.tone,
      contextCount: signals.situations.length,
      activeNeurons: neurons,
    };
  },
};

const anticipation = {
  run(worldState = {}) {
    if (worldState.pressure === 'intense') {
      return 'reactive spirals are likely without a pause';
    }

    if (worldState.contextCount > 1) {
      return 'multiple contexts may compete for attention';
    }

    return 'steady progress is likely with consistency';
  },
};

const counterbalance = {
  apply({ forecast = '', signals = {} }) {
    if (forecast.includes('reactive spirals')) {
      return 'slow the pace and delay major responses';
    }

    if (signals.advice.length) {
      return signals.advice[0];
    }

    return 'keep actions simple and intentional';
  },
};

const limbic = {
  adjustTone({ baseTone = 'active', emotionalLoad = 0 }) {
    if (baseTone === 'intense' && emotionalLoad >= 2) return 'soft';
    if (baseTone === 'soft' && emotionalLoad === 0) return 'active';
    return baseTone;
  },
};

function toNarrative({ signals, forecast, balancingAction }) {
  const repeated = signals.repeatedPhrases.map((item) => item.phrase).join(', ');
  return {
    energy: `${signals.tone}: ${signals.emotions.join(', ') || 'mixed emotional weather'}`,
    avoid: forecast,
    use: balancingAction,
    focus: repeated || signals.situations[0] || 'name the pattern and choose one clean action',
  };
}

function runRawPipeline(rawText = '') {
  const signals = parseRaw(rawText);
  const memoryEntry = hippocampus.store(signals);
  const reasoning = cortex.process(signals, memoryEntry);
  const neurons = neuralNet.activate(reasoning);
  const mappedWorld = worldModel.map({ signals, neurons });
  const forecast = anticipation.run(mappedWorld);
  const balancingAction = counterbalance.apply({ forecast, signals });
  const adjustedTone = limbic.adjustTone({
    baseTone: signals.tone,
    emotionalLoad: reasoning.emotionalLoad,
  });

  const narrative = toNarrative({
    signals: {
      ...signals,
      tone: adjustedTone,
    },
    forecast,
    balancingAction,
  });

  const refined = refineNarrative(narrative, adjustedTone);

  return {
    output: refined,
    state: {
      signals,
      memoryEntry,
      reasoning,
      neurons,
      mappedWorld,
      forecast,
      balancingAction,
      adjustedTone,
    },
  };
}

module.exports = {
  runRawPipeline,
  hippocampus,
  cortex,
  neuralNet,
  worldModel,
  anticipation,
  counterbalance,
  limbic,
};
