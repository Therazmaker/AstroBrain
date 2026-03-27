const state = {
  graph: null,
  cards: [],
  selectedCardId: null,
  importPreview: null,
  persistenceWarning: null,
  diagnostics: null,
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_\-]+/g, ' ')
    .replace(/["'`´]/g, '');
}

function normalizeCardName(value) {
  const normalized = normalizeText(value);
  return normalized.replace(/^(el|la|los|las|un|una)\s+/, '').trim();
}

function ensureGraphShape(graph) {
  const next = graph || {};
  next.schema = next.schema || 'astrobrain_tarot_graph_v1';
  next.meta = next.meta || {};
  next.nodes = next.nodes || {};
  next.nodes.tarot_card = next.nodes.tarot_card || {};
  next.nodes.tarot_insight = next.nodes.tarot_insight || {};
  next.nodes.tarot_combination = next.nodes.tarot_combination || {};
  next.nodes.tarot_theme = next.nodes.tarot_theme || {};
  next.nodes.tarot_source = next.nodes.tarot_source || {};
  next.tarot_edge = Array.isArray(next.tarot_edge) ? next.tarot_edge : [];
  return next;
}

function countGraph(graph) {
  const current = ensureGraphShape(graph);
  return {
    cards: Object.keys(current.nodes.tarot_card || {}).length,
    insights: Object.keys(current.nodes.tarot_insight || {}).length,
    themes: Object.keys(current.nodes.tarot_theme || {}).length,
  };
}

async function loadGraph() {
  const storage = window.AstroBrainTarotStorage;
  if (!storage || typeof storage.loadTarotGraph !== 'function') {
    throw new Error('TarotStorage no está disponible.');
  }

  const result = await storage.loadTarotGraph();
  console.debug(`[TarotStorage] load source: ${result?.storage || 'unknown'}`);
  if (result?.error) {
    state.persistenceWarning = `Persistencia degradada: ${result.error.message || result.error}`;
  }

  const graph = ensureGraphShape(result?.graph || null);
  const counts = countGraph(graph);
  console.debug(`[TarotStorage] cards: ${counts.cards} insights: ${counts.insights} themes: ${counts.themes}`);
  return graph;
}

async function refreshDiagnostics() {
  const storage = window.AstroBrainTarotStorage;
  if (!storage || typeof storage.getStorageDiagnostics !== 'function') return;

  state.diagnostics = await storage.getStorageDiagnostics();
  const node = document.getElementById('graph-debug-status');
  if (!node) return;

  const diagnostics = state.diagnostics || {};
  node.textContent = [
    `storage=${diagnostics.storage || 'N/D'}`,
    `cards=${diagnostics.counts?.cards ?? 0}`,
    `insights=${diagnostics.counts?.insights ?? 0}`,
    `themes=${diagnostics.counts?.themes ?? 0}`,
    `lastSaved=${diagnostics.lastSavedAt || 'N/D'}`,
    `graphId=${diagnostics.graphId || 'tarot_primary'}`,
    `version=${diagnostics.version || 1}`,
  ].join(' · ');
}

async function saveGraphNow(graph, reason = 'manual_update') {
  const storage = window.AstroBrainTarotStorage;
  if (!storage || typeof storage.saveTarotGraph !== 'function') {
    return { persistedToIndexedDB: false, persistedToMemory: true, error: new Error('TarotStorage no está disponible.') };
  }

  const result = await storage.saveTarotGraph(graph, { reason });
  if (!result.ok && result.error) {
    state.persistenceWarning = `Persistencia degradada: ${result.error.message || result.error}`;
  } else if (result.ok) {
    state.persistenceWarning = null;
  }

  const counts = countGraph(graph);
  console.debug(`[TarotGraph] save completed`);
  console.debug(`[TarotStorage] cards: ${counts.cards} insights: ${counts.insights} themes: ${counts.themes}`);
  await refreshDiagnostics();

  return {
    persistedToIndexedDB: result.ok && result.storage === 'indexeddb',
    persistedToMemory: !result.ok || result.storage === 'memory',
    error: result.error || null,
  };
}

function findCardCluster(graph, cardId) {
  const edges = graph.tarot_edge || [];
  const insights = graph.nodes?.tarot_insight || {};
  const combinations = graph.nodes?.tarot_combination || {};
  const themes = graph.nodes?.tarot_theme || {};

  const cardEdges = edges.filter((edge) => edge.from === cardId || edge.to === cardId);
  const insightIds = new Set(
    cardEdges
      .filter((edge) => edge.relation === 'has_insight' && edge.from === cardId)
      .map((edge) => edge.to),
  );

  const combinationIds = new Set(
    cardEdges
      .filter((edge) => edge.relation === 'has_combination' && edge.from === cardId)
      .map((edge) => edge.to),
  );

  const clusterInsights = [...insightIds].map((id) => insights[id]).filter(Boolean);
  const themeIds = new Set();

  clusterInsights.forEach((insight) => {
    edges.forEach((edge) => {
      if (edge.from === insight.id && edge.relation === 'contains_combination') combinationIds.add(edge.to);
      if (edge.from === insight.id && edge.relation === 'has_theme') themeIds.add(edge.to);
    });
  });

  return {
    insights: clusterInsights,
    combinations: [...combinationIds].map((id) => combinations[id]).filter(Boolean),
    themes: [...themeIds].map((id) => themes[id]).filter(Boolean),
    edges: cardEdges,
  };
}

function renderCardList(cards) {
  const list = document.getElementById('card-list');
  list.innerHTML = cards
    .map(
      (card) => `<li>
        <button type="button" data-card-id="${card.id}" class="${card.id === state.selectedCardId ? 'active' : ''}">
          ${card.name}
          <div class="node-mark">${card.arcana} · ${card.id}</div>
        </button>
      </li>`,
    )
    .join('');

  list.querySelectorAll('button[data-card-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedCardId = button.dataset.cardId;
      renderCardList(cards);
      renderSelectedCard();
    });
  });
}

function renderList(elementId, rows) {
  const list = document.getElementById(elementId);
  list.innerHTML = rows.length ? rows.map((row) => `<li>${row}</li>`).join('') : '<li>Sin datos.</li>';
}

function renderSelectedCard() {
  const selected = state.graph?.nodes?.tarot_card?.[state.selectedCardId];
  if (!selected) return;

  document.getElementById('selected-card').textContent = `${selected.name} (${selected.id})`;

  const cluster = findCardCluster(state.graph, selected.id);

  renderList(
    'insights-list',
    cluster.insights.map((item) => `${item.description || item.energy_general || 'Sin contenido'} <span class="badge added">tarot_insight</span>`),
  );

  renderList(
    'themes-list',
    cluster.themes.map((theme) => `${theme.name} <span class="badge added">tarot_theme</span>`),
  );

  renderList(
    'combinations-list',
    cluster.combinations.map((comb) => `${comb.with_card || 'Sin carta asociada'}: ${comb.effect || 'Sin descripción'} <span class="badge added">tarot_combination</span>`),
  );

  renderList(
    'edges-list',
    cluster.edges.map((edge) => `${edge.relation} (${edge.origin}) · peso ${Number(edge.weight || 0).toFixed(2)} <span class="edge ${edge.origin === 'manual' ? 'edge-manual' : 'edge-auto'}">${edge.origin}</span>`),
  );
}

function setupFilter() {
  const input = document.getElementById('card-filter');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = state.cards.filter((card) => card.name.toLowerCase().includes(q) || card.id.toLowerCase().includes(q));
    renderCardList(filtered);
  });
}

function parseFlexibleTarotInput(data) {
  if (!data || typeof data !== 'object') throw new Error('El JSON debe ser un objeto.');

  const keyMeanings = [];
  const combinations = [];
  const source = data.fuente || data.source || null;

  (data.significados_clave || []).forEach((entry) => {
    if (entry?.tema || entry?.descripcion) {
      keyMeanings.push({
        theme: entry.tema || 'General',
        description: entry.descripcion || '',
        timestamp: entry.timestamp || null,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
      });
      return;
    }

    const [key] = Object.keys(entry || {});
    if (!key || !key.startsWith('combinacion_')) return;

    const payload = entry[key] || {};
    combinations.push({
      with_card: key.replace(/^combinacion_/, ''),
      effect: payload.efecto || payload.effect || '',
      timestamp: payload.timestamp || null,
      tags: Array.isArray(payload.tags) ? payload.tags : [],
    });
  });

  return {
    schema: 'astrobrain_tarot_insight_v1',
    card: {
      id: data.card_id || data.id_carta || null,
      name: data.carta || data.card || data.nombre_carta || null,
    },
    source,
    energy_general: data.energia_general || data.energy_general || null,
    key_meanings: keyMeanings,
    combinations,
    advice: data.consejo || data.advice || null,
    raw_card_input: data.carta || data.card || data.card_id || data.id_carta || null,
  };
}

function normalizeTarotImport(data) {
  const input = data?.schema === 'astrobrain_tarot_insight_v1' ? data : parseFlexibleTarotInput(data);

  const normalizeMeaning = (item = {}) => ({
    theme: item.theme || item.tema || 'General',
    description: item.description || item.descripcion || '',
    timestamp: item.timestamp || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
  });

  const normalizeCombination = (item = {}) => ({
    with_card: item.with_card || item.card || null,
    effect: item.effect || item.efecto || '',
    timestamp: item.timestamp || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
  });

  return {
    schema: 'astrobrain_tarot_insight_v1',
    card: {
      id: input.card?.id || input.card_id || null,
      name: input.card?.name || input.carta || input.card || null,
    },
    source: input.source || null,
    energy_general: input.energy_general || input.energia_general || null,
    key_meanings: (input.key_meanings || input.significados_clave || []).map(normalizeMeaning),
    combinations: (input.combinations || []).map(normalizeCombination),
    advice: input.advice || input.consejo || null,
    raw_card_input: input.raw_card_input || input.card?.id || input.card?.name || input.carta || input.card || null,
  };
}

function resolveCard(input) {
  const cards = Object.values(state.graph?.nodes?.tarot_card || {});
  const byId = new Map(cards.map((card) => [card.id, card]));
  const byName = new Map(cards.map((card) => [normalizeText(card.name), card]));
  const byVariant = new Map(cards.map((card) => [normalizeCardName(card.name), card]));

  const raw = typeof input === 'object' ? input?.id || input?.name : input;
  if (!raw) return null;

  const candidate = String(raw).trim();
  const normalized = normalizeText(candidate);
  const variant = normalizeCardName(candidate);

  if (byId.has(candidate)) return byId.get(candidate);
  if (byId.has(normalized.replace(/\s+/g, '_'))) return byId.get(normalized.replace(/\s+/g, '_'));
  if (byName.has(normalized)) return byName.get(normalized);
  if (byVariant.has(variant)) return byVariant.get(variant);

  const underscored = candidate.replace(/^card_/, '').replace(/_/g, ' ');
  const fromUnderscored = normalizeCardName(underscored);
  if (byVariant.has(fromUnderscored)) return byVariant.get(fromUnderscored);

  return null;
}

function createNodeId(prefix, seed, bucket) {
  const base = normalizeText(seed || prefix).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  let idx = 1;
  let id = `${prefix}_${base || 'item'}`;
  while (bucket[id]) {
    idx += 1;
    id = `${prefix}_${base || 'item'}_${idx}`;
  }
  return id;
}

function ensureEdge(graph, edge, result) {
  const exists = graph.tarot_edge.some(
    (current) => current.from === edge.from && current.to === edge.to && current.relation === edge.relation,
  );

  if (exists) return false;

  graph.tarot_edge.push({
    from: edge.from,
    to: edge.to,
    relation: edge.relation,
    origin: edge.origin || 'manual',
    weight: Number(edge.weight || 1),
    source_ref: edge.source_ref || null,
    timestamp: edge.timestamp || null,
  });

  result.counts.edgesCreated += 1;
  return true;
}

function getOrCreateTheme(graph, themeName, result) {
  const normalized = normalizeCardName(themeName || 'General');
  const existing = Object.values(graph.nodes.tarot_theme).find((theme) => normalizeCardName(theme.name) === normalized);
  if (existing) {
    result.counts.themesReused += 1;
    return existing;
  }

  const id = createNodeId('theme', normalized, graph.nodes.tarot_theme);
  const node = {
    id,
    name: themeName || 'General',
    meta: {
      node_type: 'tarot_theme',
      is_base: false,
      created_at: new Date().toISOString(),
    },
  };
  graph.nodes.tarot_theme[id] = node;
  result.counts.themesCreated += 1;
  return node;
}

function getOrCreateSource(graph, source) {
  if (!source || typeof source !== 'object') return null;

  const kind = source.kind || 'unknown';
  const name = source.name || 'unknown';
  const contentRef = source.content_ref || source.contentRef || '';
  const key = normalizeText(`${kind}_${name}_${contentRef}`).replace(/[^a-z0-9]+/g, '_');
  const id = `source_${key || 'unknown'}`;

  if (!graph.nodes.tarot_source[id]) {
    graph.nodes.tarot_source[id] = {
      id,
      kind,
      name,
      content_ref: contentRef || null,
      meta: {
        node_type: 'tarot_source',
        is_base: false,
      },
    };
  }

  return graph.nodes.tarot_source[id];
}

function dedupeInsight(graph, payload) {
  return Object.values(graph.nodes.tarot_insight).find((insight) => {
    const sameCard = insight.card_id === payload.card_id;
    const sameTheme = normalizeCardName(insight.theme || '') === normalizeCardName(payload.theme || '');
    const sameDescription = normalizeText(insight.description || '') === normalizeText(payload.description || '');
    const sameSource = normalizeText(insight.source_signature || '') === normalizeText(payload.source_signature || '');
    return sameCard && sameTheme && sameDescription && sameSource;
  });
}

function dedupeCombination(graph, payload) {
  return Object.values(graph.nodes.tarot_combination).find((combination) => {
    const sameCard = combination.card_id === payload.card_id;
    const sameWith = combination.with_card === payload.with_card;
    const sameEffect = normalizeText(combination.effect || '') === normalizeText(payload.effect || '');
    const sameSource = normalizeText(combination.source_signature || '') === normalizeText(payload.source_signature || '');
    return sameCard && sameWith && sameEffect && sameSource;
  });
}

function renderImportResult(result, tone = 'success') {
  const panel = document.getElementById('import-result');
  panel.classList.remove('success', 'error', 'warning');
  panel.classList.add(tone);

  const lines = [
    `Carta detectada: ${result.cardDetected || 'N/D'}`,
    `Insights creados: ${result.counts?.insightsCreated ?? 0}`,
    `Temas creados: ${result.counts?.themesCreated ?? 0}`,
    `Temas reutilizados: ${result.counts?.themesReused ?? 0}`,
    `Combinaciones creadas: ${result.counts?.combinationsCreated ?? 0}`,
    `Edges creados: ${result.counts?.edgesCreated ?? 0}`,
  ];

  if (result.persistence) {
    lines.push(`Persistencia: ${result.persistence.persistedToIndexedDB ? 'IndexedDB' : 'memoria temporal'}`);
  }

  if (result.warnings?.length) {
    lines.push('', 'Warnings:');
    result.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  if (result.errors?.length) {
    lines.push('', 'Errores:');
    result.errors.forEach((error) => lines.push(`- ${error}`));
  }

  panel.textContent = lines.join('\n');
}

async function importTarotJson(rawJson) {
  const result = {
    cardDetected: null,
    counts: {
      insightsCreated: 0,
      themesCreated: 0,
      themesReused: 0,
      combinationsCreated: 0,
      edgesCreated: 0,
    },
    warnings: [],
    errors: [],
    persistence: null,
  };

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    result.errors.push(`JSON inválido: ${error.message}`);
    return result;
  }

  const normalized = normalizeTarotImport(parsed);
  const rawCardValue = normalized.card?.id || normalized.card?.name || normalized.raw_card_input;
  const card = resolveCard(normalized.card?.id || normalized.card?.name || normalized.raw_card_input);

  if (!card) {
    result.errors.push(`No se encontró la carta para "${rawCardValue || 'valor vacío'}". Revisa nombre o id (ej: "La Emperatriz" o "card_major_empress").`);
    return result;
  }

  result.cardDetected = `${card.name} (${card.id})`;

  const graph = state.graph;
  const storage = window.AstroBrainTarotStorage;
  if (storage?.createSnapshot) {
    await storage.createSnapshot('before_import', graph);
  }

  const sourceNode = getOrCreateSource(graph, normalized.source);
  const sourceSignature = normalizeText(`${normalized.source?.kind || ''}_${normalized.source?.name || ''}_${normalized.source?.content_ref || ''}`);

  const safeKeyMeanings = normalized.key_meanings.filter((item) => item.description || item.theme);
  if (!safeKeyMeanings.length && (normalized.energy_general || normalized.advice)) {
    safeKeyMeanings.push({
      theme: 'General',
      description: normalized.advice || normalized.energy_general,
      timestamp: null,
      tags: [],
    });
    result.warnings.push('No llegaron key_meanings: se creó un insight general con energía/consejo.');
  }

  safeKeyMeanings.forEach((meaning) => {
    const theme = getOrCreateTheme(graph, meaning.theme, result);
    const payload = {
      card_id: card.id,
      theme: meaning.theme,
      description: meaning.description,
      source_signature: sourceSignature,
    };

    let insight = dedupeInsight(graph, payload);
    if (!insight) {
      const id = createNodeId('insight', `${card.id}_${meaning.theme}_${meaning.description}`, graph.nodes.tarot_insight);
      insight = {
        id,
        card_id: card.id,
        theme: meaning.theme,
        description: meaning.description,
        timestamp: meaning.timestamp || null,
        tags: meaning.tags || [],
        energy_general: normalized.energy_general || null,
        advice: normalized.advice || null,
        source_id: sourceNode?.id || null,
        source_signature: sourceSignature,
        meta: {
          node_type: 'tarot_insight',
          is_base: false,
          created_at: new Date().toISOString(),
        },
      };
      graph.nodes.tarot_insight[id] = insight;
      result.counts.insightsCreated += 1;
    }

    ensureEdge(
      graph,
      { from: card.id, to: insight.id, relation: 'has_insight', origin: 'manual', source_ref: sourceNode?.id, timestamp: meaning.timestamp },
      result,
    );
    ensureEdge(
      graph,
      { from: insight.id, to: theme.id, relation: 'has_theme', origin: 'manual', source_ref: sourceNode?.id, timestamp: meaning.timestamp },
      result,
    );
  });

  normalized.combinations.forEach((combination) => {
    const withCard = resolveCard(combination.with_card);
    if (!withCard) {
      result.warnings.push(`No se pudo resolver combinación con carta "${combination.with_card}".`);
      return;
    }

    const payload = {
      card_id: card.id,
      with_card: withCard.id,
      effect: combination.effect,
      source_signature: sourceSignature,
    };

    let node = dedupeCombination(graph, payload);
    if (!node) {
      const id = createNodeId('combination', `${card.id}_${withCard.id}_${combination.effect}`, graph.nodes.tarot_combination);
      node = {
        id,
        card_id: card.id,
        with_card: withCard.id,
        effect: combination.effect,
        timestamp: combination.timestamp || null,
        tags: combination.tags || [],
        source_id: sourceNode?.id || null,
        source_signature: sourceSignature,
        meta: {
          node_type: 'tarot_combination',
          is_base: false,
          created_at: new Date().toISOString(),
        },
      };
      graph.nodes.tarot_combination[id] = node;
      result.counts.combinationsCreated += 1;
    }

    ensureEdge(
      graph,
      { from: card.id, to: node.id, relation: 'has_combination', origin: 'manual', source_ref: sourceNode?.id, timestamp: combination.timestamp },
      result,
    );
    ensureEdge(
      graph,
      { from: node.id, to: withCard.id, relation: 'with_card', origin: 'manual', source_ref: sourceNode?.id, timestamp: combination.timestamp },
      result,
    );
  });

  result.persistence = await saveGraphNow(graph, 'import_tarot_json');
  console.debug(`[TarotImport] insights added: ${result.counts.insightsCreated}`);

  state.selectedCardId = card.id;
  renderCardList(state.cards);
  renderSelectedCard();
  await refreshDiagnostics();

  return result;
}

function setupImportUI() {
  const input = document.getElementById('json-import-input');
  const validateBtn = document.getElementById('validate-json-btn');
  const importBtn = document.getElementById('import-json-btn');
  const clearBtn = document.getElementById('clear-json-btn');
  const restoreBtn = document.getElementById('restore-snapshot-btn');

  validateBtn.addEventListener('click', () => {
    const raw = input.value.trim();
    if (!raw) {
      renderImportResult({ cardDetected: null, counts: {}, warnings: ['Pega un JSON antes de validar.'], errors: [] }, 'warning');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeTarotImport(parsed);
      state.importPreview = normalized;
      const card = resolveCard(normalized.card?.id || normalized.card?.name || normalized.raw_card_input);

      renderImportResult(
        {
          cardDetected: card ? `${card.name} (${card.id})` : `No encontrada (${normalized.raw_card_input || 'sin valor'})`,
          counts: {
            insightsCreated: normalized.key_meanings.length,
            themesCreated: 0,
            themesReused: 0,
            combinationsCreated: normalized.combinations.length,
            edgesCreated: 0,
          },
          warnings: card ? [] : [`Carta no encontrada para "${normalized.raw_card_input || 'sin valor'}". Verifica nombre o id.`],
          errors: [],
        },
        card ? 'success' : 'warning',
      );
    } catch (error) {
      renderImportResult(
        {
          cardDetected: null,
          counts: {},
          warnings: [],
          errors: [`JSON inválido: ${error.message}`],
        },
        'error',
      );
    }
  });

  importBtn.addEventListener('click', async () => {
    const raw = input.value.trim();
    if (!raw) {
      renderImportResult({ cardDetected: null, counts: {}, warnings: [], errors: ['No hay JSON para importar.'] }, 'error');
      return;
    }

    const result = await importTarotJson(raw);
    const tone = result.errors.length ? 'error' : result.warnings.length ? 'warning' : 'success';
    renderImportResult(result, tone);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.importPreview = null;
    renderImportResult(
      {
        cardDetected: null,
        counts: {
          insightsCreated: 0,
          themesCreated: 0,
          themesReused: 0,
          combinationsCreated: 0,
          edgesCreated: 0,
        },
        warnings: [],
        errors: [],
      },
      'success',
    );
  });

  if (restoreBtn) {
    restoreBtn.addEventListener('click', async () => {
      const storage = window.AstroBrainTarotStorage;
      if (!storage || typeof storage.restoreLatestSnapshot !== 'function') return;
      const restore = await storage.restoreLatestSnapshot();
      if (!restore.ok) {
        renderImportResult({ cardDetected: null, counts: {}, warnings: [], errors: [`No se pudo restaurar snapshot: ${restore.error?.message || restore.error}`] }, 'error');
        return;
      }
      state.graph = ensureGraphShape(restore.graph);
      state.cards = Object.values(state.graph.nodes.tarot_card);
      renderCardList(state.cards);
      renderSelectedCard();
      await refreshDiagnostics();
      renderImportResult({ cardDetected: state.selectedCardId, counts: { insightsCreated: 0, themesCreated: 0, themesReused: 0, combinationsCreated: 0, edgesCreated: 0 }, warnings: ['Snapshot restaurado correctamente.'], errors: [] }, 'warning');
    });
  }
}

async function syncFromStorage() {
  const graph = await loadGraph();
  state.graph = ensureGraphShape(graph);
  state.cards = Object.values(state.graph.nodes.tarot_card);
  if (!state.selectedCardId || !state.graph.nodes.tarot_card[state.selectedCardId]) {
    state.selectedCardId = state.cards[0]?.id || null;
  }

  renderCardList(state.cards);
  renderSelectedCard();
  await refreshDiagnostics();
}

async function bootstrap() {
  let graph;
  try {
    graph = await loadGraph();
  } catch (error) {
    document.getElementById('selected-card').textContent = `Error de inicialización: ${error.message || error}`;
    return;
  }

  if (!graph?.nodes?.tarot_card) {
    document.getElementById('selected-card').textContent = 'No se pudo construir el grafo base de TarotBrain.';
    return;
  }

  state.graph = ensureGraphShape(graph);
  state.cards = Object.values(state.graph.nodes.tarot_card);
  state.selectedCardId = state.cards[0]?.id || null;

  renderCardList(state.cards);
  renderSelectedCard();
  setupFilter();
  setupImportUI();
  await refreshDiagnostics();

  const storage = window.AstroBrainTarotStorage;
  if (storage?.subscribeTarotGraph) {
    storage.subscribeTarotGraph(async () => {
      await syncFromStorage();
    });
  }

  if (state.persistenceWarning) {
    renderImportResult(
      {
        cardDetected: state.selectedCardId,
        counts: { insightsCreated: 0, themesCreated: 0, themesReused: 0, combinationsCreated: 0, edgesCreated: 0 },
        warnings: [state.persistenceWarning],
        errors: [],
      },
      'warning',
    );
  }
}

bootstrap();
