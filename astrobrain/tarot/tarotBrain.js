const fs = require('fs');
const path = require('path');
const { createTarotBaseCards } = require('./baseCards');

const TAROT_GRAPH_SCHEMA = 'astrobrain_tarot_graph_v1';
const TAROT_MEMORY_PATH = path.join(__dirname, '..', 'memory', 'tarotGraph.json');

const EDGE_DEFAULT_WEIGHT = {
  manual: 0.9,
  auto_suggested: 0.45,
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeKey(value = '') {
  return String(value).trim().toLowerCase();
}

function createBaseTarotGraph() {
  const cards = createTarotBaseCards();
  const cardIndex = cards.reduce((acc, card) => {
    acc[card.id] = card;
    return acc;
  }, {});

  return {
    schema: TAROT_GRAPH_SCHEMA,
    meta: {
      module: 'TarotBrain',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    nodes: {
      tarot_card: cardIndex,
      tarot_insight: {},
      tarot_combination: {},
      tarot_theme: {},
      tarot_source: {},
    },
    tarot_edge: [],
  };
}

function ensureGraphShape(graph) {
  const base = graph && graph.schema === TAROT_GRAPH_SCHEMA ? graph : createBaseTarotGraph();

  base.nodes = base.nodes || {};
  base.nodes.tarot_card = base.nodes.tarot_card || {};
  base.nodes.tarot_insight = base.nodes.tarot_insight || {};
  base.nodes.tarot_combination = base.nodes.tarot_combination || {};
  base.nodes.tarot_theme = base.nodes.tarot_theme || {};
  base.nodes.tarot_source = base.nodes.tarot_source || {};
  base.tarot_edge = Array.isArray(base.tarot_edge) ? base.tarot_edge : [];
  base.meta = base.meta || {};
  base.meta.updated_at = new Date().toISOString();

  return base;
}

function createEdge(graph, payload = {}) {
  const origin = payload.origin || 'manual';
  const edge = {
    id: payload.id || `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: payload.from,
    to: payload.to,
    relation: payload.relation || 'related_to',
    origin,
    weight: payload.weight ?? EDGE_DEFAULT_WEIGHT[origin] ?? 0.4,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    review_status: payload.review_status || (origin === 'auto_suggested' ? 'pending_review' : 'approved'),
    meta: payload.meta || {},
    created_at: new Date().toISOString(),
  };

  graph.tarot_edge.push(edge);
  graph.meta.updated_at = new Date().toISOString();
  return edge;
}

function ensureThemeNode(graph, themeName) {
  const trimmed = String(themeName || '').trim();
  if (!trimmed) return null;

  const normalized = normalizeKey(trimmed);
  const existing = Object.values(graph.nodes.tarot_theme).find(
    (theme) => normalizeKey(theme.name) === normalized,
  );

  if (existing) return existing;

  const id = `theme_${normalized.replace(/[^a-z0-9]+/g, '_')}`;
  const node = {
    id,
    name: trimmed,
    meta: {
      node_type: 'tarot_theme',
      is_base: false,
    },
  };

  graph.nodes.tarot_theme[id] = node;
  return node;
}

function upsertSourceNode(graph, source = {}) {
  const kind = normalizeKey(source.kind || 'unknown');
  const name = source.name || 'Fuente sin nombre';
  const contentRef = source.content_ref || 'no_ref';
  const id = `source_${kind}_${normalizeKey(name).replace(/[^a-z0-9]+/g, '_')}_${normalizeKey(contentRef).replace(/[^a-z0-9]+/g, '_')}`;

  if (!graph.nodes.tarot_source[id]) {
    graph.nodes.tarot_source[id] = {
      id,
      kind,
      name,
      content_ref: contentRef,
      meta: {
        node_type: 'tarot_source',
        is_base: false,
      },
    };
  }

  return graph.nodes.tarot_source[id];
}

function collectTags(payload = {}) {
  const tags = new Set();

  (payload.key_meanings || []).forEach((meaning) => {
    (meaning.tags || []).forEach((tag) => tags.add(normalizeKey(tag)));
    if (meaning.theme) tags.add(normalizeKey(meaning.theme));
  });

  (payload.combinations || []).forEach((item) => {
    (item.tags || []).forEach((tag) => tags.add(normalizeKey(tag)));
  });

  return [...tags].filter(Boolean);
}

function createInsightNode(graph, payload = {}, sourceNode = null) {
  const cardId = payload.card?.id;
  const keyMeanings = Array.isArray(payload.key_meanings) ? payload.key_meanings : [];
  const id = `insight_${cardId || 'unknown'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const node = {
    id,
    card: payload.card || null,
    source_id: sourceNode?.id || null,
    energy_general: payload.energy_general || '',
    key_meanings: keyMeanings,
    advice: payload.advice || '',
    tags: collectTags(payload),
    meta: {
      node_type: 'tarot_insight',
      is_base: false,
    },
  };

  graph.nodes.tarot_insight[id] = node;
  return node;
}

function createCombinationNode(graph, payload = {}, context = {}) {
  const id = `comb_${context.cardId || 'unknown'}_${payload.with_card || 'unknown'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const node = {
    id,
    card_id: context.cardId || null,
    with_card: payload.with_card || null,
    effect: payload.effect || '',
    timestamp: payload.timestamp || null,
    tags: Array.isArray(payload.tags) ? payload.tags.map(normalizeKey).filter(Boolean) : [],
    source_id: context.sourceId || null,
    meta: {
      node_type: 'tarot_combination',
      is_base: false,
    },
  };

  graph.nodes.tarot_combination[id] = node;
  return node;
}

function importTarotInsight(graphInput, jsonInsight) {
  const graph = ensureGraphShape(graphInput);
  const payload = jsonInsight || {};
  const cardId = payload.card?.id;

  if (!cardId || !graph.nodes.tarot_card[cardId]) {
    throw new Error(`Card ${cardId || '<missing>'} does not exist in TarotBrain base graph.`);
  }

  const sourceNode = upsertSourceNode(graph, payload.source || {});
  const insightNode = createInsightNode(graph, payload, sourceNode);

  createEdge(graph, {
    from: cardId,
    to: insightNode.id,
    relation: 'has_insight',
    origin: 'manual',
  });

  createEdge(graph, {
    from: sourceNode.id,
    to: insightNode.id,
    relation: 'authored_insight',
    origin: 'manual',
  });

  (payload.key_meanings || []).forEach((meaning, index) => {
    const themeNode = ensureThemeNode(graph, meaning.theme);
    if (!themeNode) return;

    createEdge(graph, {
      from: insightNode.id,
      to: themeNode.id,
      relation: 'has_theme',
      origin: 'manual',
      tags: (meaning.tags || []).map(normalizeKey),
      meta: {
        key_meaning_index: index,
        timestamp: meaning.timestamp || null,
      },
    });
  });

  (payload.combinations || []).forEach((combination, index) => {
    const combinationNode = createCombinationNode(graph, combination, {
      cardId,
      sourceId: sourceNode.id,
    });

    createEdge(graph, {
      from: insightNode.id,
      to: combinationNode.id,
      relation: 'contains_combination',
      origin: 'manual',
      meta: {
        combination_index: index,
      },
    });

    createEdge(graph, {
      from: cardId,
      to: combinationNode.id,
      relation: 'combines_with',
      origin: 'manual',
      tags: combinationNode.tags,
    });

    if (combination.with_card && graph.nodes.tarot_card[combination.with_card]) {
      createEdge(graph, {
        from: combinationNode.id,
        to: combination.with_card,
        relation: 'references_card',
        origin: 'manual',
      });
    }
  });

  autoLinkByTags(graph);
  autoLinkByCombinationFrequency(graph);

  return {
    graph,
    insight_id: insightNode.id,
  };
}

function getNodeTagIndex(graph) {
  const index = [];

  Object.values(graph.nodes.tarot_card).forEach((card) => {
    const tags = new Set((card.themes || []).map(normalizeKey));
    if (tags.size) index.push({ id: card.id, node_type: 'tarot_card', tags: [...tags] });
  });

  Object.values(graph.nodes.tarot_insight).forEach((insight) => {
    const tags = new Set((insight.tags || []).map(normalizeKey));
    if (tags.size) index.push({ id: insight.id, node_type: 'tarot_insight', tags: [...tags] });
  });

  Object.values(graph.nodes.tarot_combination).forEach((combination) => {
    const tags = new Set((combination.tags || []).map(normalizeKey));
    if (tags.size) index.push({ id: combination.id, node_type: 'tarot_combination', tags: [...tags] });
  });

  return index;
}

function hasManualEdgeBetween(graph, nodeA, nodeB) {
  return graph.tarot_edge.some(
    (edge) =>
      edge.origin === 'manual' &&
      ((edge.from === nodeA && edge.to === nodeB) || (edge.from === nodeB && edge.to === nodeA)),
  );
}

function autoLinkByTags(graphInput, minSharedTags = 2) {
  const graph = ensureGraphShape(graphInput);
  const items = getNodeTagIndex(graph);

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const sharedTags = a.tags.filter((tag) => b.tags.includes(tag));

      if (sharedTags.length < minSharedTags) continue;
      if (hasManualEdgeBetween(graph, a.id, b.id)) continue;

      const existingAuto = graph.tarot_edge.find(
        (edge) =>
          edge.origin === 'auto_suggested' &&
          edge.relation === 'tag_similarity' &&
          ((edge.from === a.id && edge.to === b.id) || (edge.from === b.id && edge.to === a.id)),
      );

      const weight = Math.min(0.7, 0.35 + (sharedTags.length - minSharedTags) * 0.1);

      if (existingAuto) {
        existingAuto.tags = [...new Set([...(existingAuto.tags || []), ...sharedTags])];
        existingAuto.weight = Math.max(existingAuto.weight || 0, weight);
        existingAuto.meta = {
          ...(existingAuto.meta || {}),
          min_shared_tags: minSharedTags,
        };
        continue;
      }

      createEdge(graph, {
        from: a.id,
        to: b.id,
        relation: 'tag_similarity',
        origin: 'auto_suggested',
        weight,
        tags: sharedTags,
        meta: {
          min_shared_tags: minSharedTags,
        },
      });
    }
  }

  return graph;
}

function autoLinkByCombinationFrequency(graphInput) {
  const graph = ensureGraphShape(graphInput);
  const counts = {};
  const repeatedBySource = {};

  Object.values(graph.nodes.tarot_combination).forEach((combination) => {
    if (!combination.card_id || !combination.with_card) return;

    const pair = [combination.card_id, combination.with_card].sort().join('|');
    counts[pair] = (counts[pair] || 0) + 1;

    const key = `${pair}|${combination.source_id || 'unknown'}|${normalizeKey(combination.effect)}`;
    repeatedBySource[key] = (repeatedBySource[key] || 0) + 1;
  });

  Object.entries(counts).forEach(([pair, count]) => {
    if (count < 2) return;

    const [cardA, cardB] = pair.split('|');
    const sameSourceRepetitions = Object.entries(repeatedBySource)
      .filter(([key, value]) => key.startsWith(`${pair}|`) && value > 1)
      .reduce((acc, [, value]) => acc + value - 1, 0);

    const repeatedSourceBoost = sameSourceRepetitions > 0 ? Math.min(0.25, sameSourceRepetitions * 0.08) : 0;
    const weight = Math.min(0.95, 0.4 + (count - 1) * 0.1 + repeatedSourceBoost);

    const existingManual = graph.tarot_edge.find(
      (edge) =>
        edge.origin === 'manual' &&
        edge.relation === 'card_co_occurrence' &&
        ((edge.from === cardA && edge.to === cardB) || (edge.from === cardB && edge.to === cardA)),
    );

    if (existingManual) return;

    const existingAuto = graph.tarot_edge.find(
      (edge) =>
        edge.origin === 'auto_suggested' &&
        edge.relation === 'card_co_occurrence' &&
        ((edge.from === cardA && edge.to === cardB) || (edge.from === cardB && edge.to === cardA)),
    );

    if (existingAuto) {
      existingAuto.weight = Math.max(existingAuto.weight || 0, weight);
      existingAuto.meta = {
        ...(existingAuto.meta || {}),
        combination_count: count,
        repeated_source_reinforcement: sameSourceRepetitions,
      };
      return;
    }

    createEdge(graph, {
      from: cardA,
      to: cardB,
      relation: 'card_co_occurrence',
      origin: 'auto_suggested',
      weight,
      meta: {
        combination_count: count,
        repeated_source_reinforcement: sameSourceRepetitions,
      },
    });
  });

  return graph;
}

function getCardCluster(graphInput, cardId) {
  const graph = ensureGraphShape(graphInput);
  const card = graph.nodes.tarot_card[cardId];
  if (!card) return null;

  const connectedEdges = graph.tarot_edge.filter((edge) => edge.from === cardId || edge.to === cardId);
  const insightIds = connectedEdges
    .filter((edge) => edge.relation === 'has_insight' && edge.from === cardId)
    .map((edge) => edge.to);

  const insights = insightIds.map((id) => graph.nodes.tarot_insight[id]).filter(Boolean);

  const combinationIds = new Set();
  const themeIds = new Set();

  insights.forEach((insight) => {
    graph.tarot_edge.forEach((edge) => {
      if (edge.from === insight.id && edge.relation === 'contains_combination') combinationIds.add(edge.to);
      if (edge.from === insight.id && edge.relation === 'has_theme') themeIds.add(edge.to);
    });
  });

  connectedEdges.forEach((edge) => {
    const maybeId = edge.from === cardId ? edge.to : edge.from;
    if (graph.nodes.tarot_combination[maybeId]) combinationIds.add(maybeId);
    if (graph.nodes.tarot_theme[maybeId]) themeIds.add(maybeId);
  });

  return {
    card,
    insights,
    combinations: [...combinationIds].map((id) => graph.nodes.tarot_combination[id]).filter(Boolean),
    themes: [...themeIds].map((id) => graph.nodes.tarot_theme[id]).filter(Boolean),
    edges: connectedEdges,
  };
}

function exportTarotGraph(graphInput) {
  return deepClone(ensureGraphShape(graphInput));
}

function loadTarotGraph(filePath = TAROT_MEMORY_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return ensureGraphShape(parsed);
  } catch (_error) {
    return createBaseTarotGraph();
  }
}

function saveTarotGraph(graphInput, filePath = TAROT_MEMORY_PATH) {
  const graph = ensureGraphShape(graphInput);
  fs.writeFileSync(filePath, JSON.stringify(graph, null, 2));
  return graph;
}

module.exports = {
  TAROT_GRAPH_SCHEMA,
  TAROT_MEMORY_PATH,
  createBaseTarotGraph,
  importTarotInsight,
  ensureThemeNode,
  createInsightNode,
  createCombinationNode,
  createEdge,
  autoLinkByTags,
  autoLinkByCombinationFrequency,
  getCardCluster,
  exportTarotGraph,
  loadTarotGraph,
  saveTarotGraph,
};
