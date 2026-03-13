const fs = require('fs');
const path = require('path');
const { buildTransitTags } = require('./buildTransitTags');
const { resolveTransitSignals } = require('./resolveTransitSignals');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const CONTEXT_NEURONS_DIR = path.join(MEMORY_DIR, 'neurons');
const CONTEXT_NEURON_FILES = ['casas.json', 'signos.json', 'grados.json', 'combinaciones.json'];
const BASE_NEURONS_PATH = path.join(MEMORY_DIR, 'neurons.json');
const META_PATH = path.join(MEMORY_DIR, 'metaNeurons.json');
const WEIGHTS_PATH = path.join(MEMORY_DIR, 'neuronWeights.json');

const DEFAULT_OPTIONS = {
  threshold: 0.3,
  maxTotal: 8,
  maxSecondary: 7,
  maxPerFamily: 2,
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeToken(text) {
  return String(text || '').trim().toLowerCase();
}

function loadNeuronCatalog() {
  const base = readJson(BASE_NEURONS_PATH, []);
  const context = CONTEXT_NEURON_FILES
    .filter((file) => fs.existsSync(path.join(CONTEXT_NEURONS_DIR, file)))
    .flatMap((file) => readJson(path.join(CONTEXT_NEURONS_DIR, file), []));

  const meta = readJson(META_PATH, { patterns: [] });
  const weights = readJson(WEIGHTS_PATH, {});

  return [...base, ...context, ...(meta.patterns || [])].map((neuron) => {
    const triggers = Array.isArray(neuron.triggers)
      ? neuron.triggers
      : (Array.isArray(neuron.tags) ? neuron.tags : []);

    return {
      ...neuron,
      triggers: [...new Set(triggers.map(normalizeToken).filter(Boolean))],
      clusters: Array.isArray(neuron.clusters) ? neuron.clusters : (Array.isArray(neuron.tags) ? neuron.tags : []),
      weight: Number(weights[neuron.id] ?? neuron.weight ?? neuron.peso ?? 0.4),
      output: neuron.output || {},
    };
  });
}

function groupNeuronBySemanticFamily(neuron = {}) {
  const id = normalizeToken(neuron.id);
  const triggers = neuron.triggers || [];

  if (Array.isArray(neuron.if)) return 'compound-interpretation';
  if (neuron.if?.planet && neuron.if?.aspect && neuron.if?.target) return 'aspect-base';
  if (triggers.some((tag) => /_en_/.test(tag)) || /_en_/.test(id)) return 'planet-sign';
  if (triggers.some((tag) => tag.includes('orbe') || tag.includes('orb'))) return 'orb/modifier';
  if (triggers.some((tag) => tag.includes('aplicativo') || tag.includes('separativo'))) return 'phase/applying-separating';
  if (/regul|advice|consejo|focus|avoid/.test(id)) return 'regulation/advice';
  if (/relacional|venus|vincul/.test(id)) return 'relational-theme';
  if (/emoc|moon|reactiv|sensib/.test(id)) return 'emotional-theme';
  return 'compound-interpretation';
}

function getTransitEssentials(transit = {}) {
  const tags = [...new Set([
    ...(transit.tags || []),
    ...(transit.derivedTags || []),
    ...buildTransitTags(transit),
  ].map(normalizeToken).filter(Boolean))];

  const resolvedSignals = [...new Set([
    ...(transit.resolvedSignals || []),
    ...resolveTransitSignals(transit, tags),
  ].map(normalizeToken).filter(Boolean))];

  return { tags, resolvedSignals };
}

function scoreNeuronAgainstTransit(neuron = {}, transit = {}, tags = [], resolvedSignals = []) {
  const reasons = [];
  const triggerList = neuron.triggers || [];
  const clusterList = Array.isArray(neuron.clusters) ? neuron.clusters.map(normalizeToken) : [];
  const outputText = Object.values(neuron.output || {}).join(' ').toLowerCase();

  let exactMatchScore = 0;
  if (Array.isArray(neuron.if) && neuron.if.length) {
    const needed = neuron.if.map(normalizeToken);
    const hits = needed.filter((token) => tags.includes(token)).length;
    exactMatchScore = hits / needed.length;
  } else if (neuron.if && typeof neuron.if === 'object') {
    const planetOk = normalizeToken(neuron.if.planet) === normalizeToken(transit.planet);
    const aspectOk = normalizeToken(neuron.if.aspect) === normalizeToken(transit.aspect);
    const targetOk = normalizeToken(neuron.if.target) === normalizeToken(transit.target);
    exactMatchScore = [planetOk, aspectOk, targetOk].filter(Boolean).length / 3;
    if (planetOk && aspectOk && targetOk) reasons.push('exact aspect match');
  }

  const triggerHits = triggerList.filter((trigger) => tags.includes(trigger));
  const triggerCoverageScore = triggerList.length ? (triggerHits.length / triggerList.length) : 0;
  if (triggerHits.length) reasons.push(`trigger coverage ${triggerHits.length}/${triggerList.length || 1}`);

  const clusterCoverageScore = clusterList.length
    ? clamp01(clusterList.filter((cluster) => resolvedSignals.some((signal) => signal.includes(cluster))).length / clusterList.length)
    : 0;

  const ctx = transit.context || {};
  const contextTokens = [normalizeToken(ctx.planetSign), normalizeToken(ctx.targetSign), normalizeToken(ctx.strengthLabel)].filter(Boolean);
  const contextMatches = contextTokens.filter((token) => triggerList.some((trigger) => trigger.includes(token)) || outputText.includes(token));
  const contextCoverageScore = contextTokens.length ? contextMatches.length / contextTokens.length : 0;

  const signalMatches = resolvedSignals.filter((signal) => outputText.includes(signal) || triggerList.some((trigger) => trigger.includes(signal)));
  const resolvedSignalScore = resolvedSignals.length ? signalMatches.length / resolvedSignals.length : 0;
  if (resolvedSignalScore > 0.5) reasons.push('strong resolved signal alignment');

  const orb = Number(transit.orb ?? ctx.orb);
  const orbBonus = Number.isFinite(orb) && orb <= 2 && triggerList.some((trigger) => trigger.includes('orb') || trigger.includes('orbe')) ? 1 : 0;
  const applyingBonus = ctx.isApplying === true && triggerList.some((trigger) => trigger.includes('aplicativo')) ? 1 : 0;
  const signBonus = contextTokens.length && triggerHits.some((hit) => hit.includes('_en_')) ? 1 : 0;
  const compoundBonus = /__|compound|pattern/.test(neuron.id || '') ? 1 : 0;

  const score = clamp01(
    exactMatchScore * 0.3
    + triggerCoverageScore * 0.2
    + contextCoverageScore * 0.15
    + resolvedSignalScore * 0.15
    + clusterCoverageScore * 0.05
    + orbBonus * 0.05
    + applyingBonus * 0.05
    + signBonus * 0.05
    + compoundBonus * 0.05,
  );

  if (!reasons.length && score > 0) reasons.push('partial contextual compatibility');

  return {
    neuron,
    id: neuron.id,
    match: neuron.id,
    family: groupNeuronBySemanticFamily(neuron),
    score,
    reasons,
    scoreBreakdown: {
      exactMatchScore,
      triggerCoverageScore,
      clusterCoverageScore,
      contextCoverageScore,
      resolvedSignalScore,
      orbBonus,
      applyingBonus,
      signBonus,
      compoundBonus,
    },
  };
}

function dedupeNeuronCandidates(candidates = []) {
  const byId = new Map();
  candidates.forEach((candidate) => {
    if (!candidate?.id) return;
    const existing = byId.get(candidate.id);
    if (!existing || candidate.score > existing.score) byId.set(candidate.id, candidate);
  });

  const bySignature = new Set();
  return [...byId.values()].filter((candidate) => {
    const signature = `${candidate.family}:${(candidate.neuron.output?.focus || '').toLowerCase()}`;
    if (bySignature.has(signature)) return false;
    bySignature.add(signature);
    return true;
  });
}

function selectPrimaryAndSecondaryNeurons(candidates = [], options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected = [];
  const familyCounter = new Map();

  sorted.forEach((candidate) => {
    if (selected.length >= config.maxTotal) return;
    if (candidate.score < config.threshold) return;
    const currentFamilyCount = familyCounter.get(candidate.family) || 0;
    if (currentFamilyCount >= config.maxPerFamily) return;

    selected.push(candidate);
    familyCounter.set(candidate.family, currentFamilyCount + 1);
  });

  const [primaryNeuron, ...secondaryNeurons] = selected;

  return {
    primaryNeuron: primaryNeuron || null,
    secondaryNeurons: secondaryNeurons.slice(0, config.maxSecondary),
  };
}

function buildCompositeNarrativeSignals(activationResult = {}) {
  const primary = activationResult.primaryNeuron;
  const secondary = activationResult.secondaryNeurons || [];

  const prioritized = [primary, ...secondary].filter(Boolean);
  const outputs = prioritized.map((item) => item.neuron?.output || {});

  return {
    dominantFocus: outputs.map((item) => item.focus).filter(Boolean)[0] || '',
    avoid: [...new Set(outputs.map((item) => item.avoid).filter(Boolean))].slice(0, 3),
    energy: [...new Set(outputs.map((item) => item.energy).filter(Boolean))].slice(0, 3),
    use: [...new Set(outputs.map((item) => item.use).filter(Boolean))].slice(0, 3),
    families: [...new Set(prioritized.map((item) => item.family))],
    weightedScore: prioritized.reduce((sum, item) => sum + item.score, 0) / Math.max(1, prioritized.length),
  };
}

function matchTransitToRelevantNeurons(transit = {}, neuronCatalog = null, options = {}) {
  const { tags, resolvedSignals } = getTransitEssentials(transit);
  const catalog = Array.isArray(neuronCatalog) && neuronCatalog.length ? neuronCatalog : loadNeuronCatalog();

  const scored = catalog
    .map((neuron) => scoreNeuronAgainstTransit(neuron, transit, tags, resolvedSignals))
    .filter((item) => item.score > 0);

  const deduped = dedupeNeuronCandidates(scored);
  const selection = selectPrimaryAndSecondaryNeurons(deduped, options);

  const allSelectedIds = new Set([
    selection.primaryNeuron?.id,
    ...selection.secondaryNeurons.map((item) => item.id),
  ].filter(Boolean));

  const threshold = Number(options.threshold ?? DEFAULT_OPTIONS.threshold);
  const discardedNeurons = deduped
    .filter((item) => !allSelectedIds.has(item.id))
    .map((item) => ({
      id: item.id,
      match: item.match,
      score: item.score,
      reason: item.score < threshold ? 'below threshold' : 'selection limits by family/total',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const fallbackPrimary = deduped.sort((a, b) => b.score - a.score)[0] || null;
  const primaryNeuron = selection.primaryNeuron || fallbackPrimary;

  return {
    activationMode: selection.secondaryNeurons.length ? 'multi-neuron' : 'single-neuron-fallback',
    primaryNeuron,
    secondaryNeurons: selection.primaryNeuron ? selection.secondaryNeurons : [],
    discardedNeurons,
    activationSummary: {
      totalCandidates: deduped.length,
      selected: [primaryNeuron, ...(selection.primaryNeuron ? selection.secondaryNeurons : [])].filter(Boolean).length,
      threshold,
      familiesUsed: [...new Set([primaryNeuron?.family, ...selection.secondaryNeurons.map((item) => item.family)].filter(Boolean))],
    },
    tags,
    resolvedSignals,
    compositeSignals: buildCompositeNarrativeSignals({
      primaryNeuron,
      secondaryNeurons: selection.primaryNeuron ? selection.secondaryNeurons : [],
    }),
  };
}

module.exports = {
  buildTransitTags,
  resolveTransitSignals,
  scoreNeuronAgainstTransit,
  groupNeuronBySemanticFamily,
  dedupeNeuronCandidates,
  selectPrimaryAndSecondaryNeurons,
  buildCompositeNarrativeSignals,
  matchTransitToRelevantNeurons,
  loadNeuronCatalog,
};
