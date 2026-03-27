const DASHBOARD_STATE_ORDER = {
  vacio: 0,
  semilla: 1,
  creciendo: 2,
  maduro: 3,
};

const dashboardState = {
  graph: null,
  cardStatsById: new Map(),
  computed: null,
  diagnostics: null,
  charts: {
    insightsPerCardChart: null,
    statusDistributionChart: null,
  },
  sortHandlerAttached: false,
};

function classifyCard(cardStats) {
  const insights = cardStats?.insightsCount || 0;
  if (insights === 0) return 'vacio';
  if (insights <= 2) return 'semilla';
  if (insights <= 5) return 'creciendo';
  return 'maduro';
}

function getCardStats(cardId) {
  return dashboardState.cardStatsById.get(cardId) || null;
}

function collectCardRelations(graph) {
  const edges = graph?.tarot_edge || [];
  const insightById = graph?.nodes?.tarot_insight || {};

  const insightsByCard = new Map();
  const combinationsByCard = new Map();
  const themesByCard = new Map();
  const edgesByCard = new Map();

  function ensureSet(map, key) {
    if (!map.has(key)) map.set(key, new Set());
    return map.get(key);
  }

  edges.forEach((edge) => {
    if (!edge?.from || !edge?.to) return;

    ensureSet(edgesByCard, edge.from).add(`${edge.from}|${edge.to}|${edge.relation}`);
    ensureSet(edgesByCard, edge.to).add(`${edge.from}|${edge.to}|${edge.relation}`);

    if (edge.relation === 'has_insight') {
      ensureSet(insightsByCard, edge.from).add(edge.to);
    }

    if (edge.relation === 'has_combination') {
      ensureSet(combinationsByCard, edge.from).add(edge.to);
    }

    if (edge.relation === 'has_theme') {
      const insight = insightById[edge.from];
      if (insight?.card_id) ensureSet(themesByCard, insight.card_id).add(edge.to);
    }
  });

  Object.values(insightById).forEach((insight) => {
    if (!insight?.id || !insight.card_id) return;
    ensureSet(insightsByCard, insight.card_id).add(insight.id);
  });

  return { insightsByCard, combinationsByCard, themesByCard, edgesByCard };
}

function getTopThemes(graph) {
  const themeNodes = graph?.nodes?.tarot_theme || {};
  const edges = graph?.tarot_edge || [];

  const countById = new Map();
  const nameById = new Map();

  Object.values(themeNodes).forEach((theme) => {
    if (!theme?.id) return;
    countById.set(theme.id, 0);
    nameById.set(theme.id, theme.name || theme.id);
  });

  edges.forEach((edge) => {
    if (edge.relation === 'has_theme' && countById.has(edge.to)) {
      countById.set(edge.to, (countById.get(edge.to) || 0) + 1);
    }
  });

  return [...countById.entries()]
    .map(([id, count]) => ({ id, name: nameById.get(id) || id, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
    .slice(0, 10);
}

function getEmptyCards(graph) {
  const stats = computeTarotStats(graph);
  return stats.cardRows.filter((row) => row.insightsCount === 0);
}

function computeTarotStats(graph) {
  const cards = Object.values(graph?.nodes?.tarot_card || {});
  const insights = Object.values(graph?.nodes?.tarot_insight || {});
  const themes = Object.values(graph?.nodes?.tarot_theme || {});
  const combinations = Object.values(graph?.nodes?.tarot_combination || {});

  const { insightsByCard, combinationsByCard, themesByCard, edgesByCard } = collectCardRelations(graph);

  const cardRows = cards.map((card) => {
    const insightSet = insightsByCard.get(card.id) || new Set();
    const combinationSet = combinationsByCard.get(card.id) || new Set();
    const themeSet = themesByCard.get(card.id) || new Set();
    const edgeSet = edgesByCard.get(card.id) || new Set();

    const row = {
      id: card.id,
      name: card.name || card.id,
      insightsCount: insightSet.size,
      themesCount: themeSet.size,
      combinationsCount: combinationSet.size,
      edgesCount: edgeSet.size,
      state: 'vacio',
    };

    row.state = classifyCard(row);
    dashboardState.cardStatsById.set(card.id, row);
    return row;
  });

  const cardsWithInsights = cardRows.filter((row) => row.insightsCount >= 1).length;
  const cardsWithoutInsights = cardRows.length - cardsWithInsights;
  const completionPct = cardRows.length ? (cardsWithInsights / cardRows.length) * 100 : 0;

  const distribution = cardRows.reduce(
    (acc, row) => {
      acc[row.state] += 1;
      return acc;
    },
    { vacio: 0, semilla: 0, creciendo: 0, maduro: 0 },
  );

  const themesByNormalized = new Map();
  themes.forEach((theme) => {
    const raw = String(theme?.name || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!themesByNormalized.has(key)) themesByNormalized.set(key, new Set());
    themesByNormalized.get(key).add(raw);
  });

  const duplicatedThemes = [...themesByNormalized.values()]
    .filter((names) => names.size > 1)
    .map((names) => [...names]);

  const cardsWithoutEdges = cardRows.filter((row) => row.edgesCount === 0);
  const cardsWithSingleInsight = cardRows.filter((row) => row.insightsCount === 1);

  return {
    totalCards: cardRows.length,
    cardsWithInsights,
    cardsWithoutInsights,
    completionPct,
    totalInsights: insights.length,
    totalThemes: themes.length,
    totalCombinations: combinations.length,
    avgInsightsPerCard: cardRows.length ? insights.length / cardRows.length : 0,
    distribution,
    cardRows,
    topCards: [...cardRows]
      .sort((a, b) => b.insightsCount - a.insightsCount || a.name.localeCompare(b.name, 'es'))
      .slice(0, 5),
    topThemes: getTopThemes(graph),
    emptyCards: cardRows.filter((row) => row.insightsCount === 0),
    suggestions: {
      cardsWithoutInsights: cardRows.filter((row) => row.insightsCount === 0),
      cardsWithSingleInsight,
      duplicatedThemes,
      cardsWithoutEdges,
    },
  };
}

function metricNode(label, value) {
  return `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function renderOverview(stats) {
  const overview = document.getElementById('overview-grid');
  overview.innerHTML = [
    metricNode('Total cartas', stats.totalCards),
    metricNode('Con insights', stats.cardsWithInsights),
    metricNode('Sin insights', stats.cardsWithoutInsights),
    metricNode('% completado', `${stats.completionPct.toFixed(1)}%`),
  ].join('');

  document.getElementById('completion-percent').textContent = `${stats.completionPct.toFixed(1)}%`;
  document.getElementById('completion-bar').style.width = `${Math.max(0, Math.min(100, stats.completionPct))}%`;
  document.getElementById('brain-progress-value').textContent = `${stats.cardsWithInsights} / 78`;
}

function renderContent(stats) {
  const content = document.getElementById('content-grid');
  content.innerHTML = [
    metricNode('Total insights', stats.totalInsights),
    metricNode('Temas únicos', stats.totalThemes),
    metricNode('Combinaciones', stats.totalCombinations),
    metricNode('Promedio insights/carta', stats.avgInsightsPerCard.toFixed(2)),
  ].join('');
}

function renderDistribution(stats) {
  const dist = document.getElementById('distribution-grid');
  dist.innerHTML = [
    metricNode('Vacío (0)', stats.distribution.vacio),
    metricNode('Semilla (1-2)', stats.distribution.semilla),
    metricNode('Creciendo (3-5)', stats.distribution.creciendo),
    metricNode('Maduro (6+)', stats.distribution.maduro),
  ].join('');
}

function renderLists(stats) {
  const topCardsList = document.getElementById('top-cards-list');
  topCardsList.innerHTML = stats.topCards.length
    ? stats.topCards.map((card) => `<li>${card.name} · ${card.insightsCount} insights</li>`).join('')
    : '<li class="empty">Sin datos.</li>';

  const topThemesList = document.getElementById('top-themes-list');
  topThemesList.innerHTML = stats.topThemes.length
    ? stats.topThemes.map((theme) => `<li>${theme.name} · ${theme.count}</li>`).join('')
    : '<li class="empty">Sin temas aún.</li>';

  const emptyCardsList = document.getElementById('empty-cards-list');
  emptyCardsList.innerHTML = stats.emptyCards.length
    ? stats.emptyCards.map((card) => `<li>${card.name} (${card.id})</li>`).join('')
    : '<li class="empty">No hay cartas vacías.</li>';
}

function renderSuggestions(stats) {
  const suggestions = [];

  if (stats.suggestions.cardsWithoutInsights.length) {
    suggestions.push(`Cartas sin insights: ${stats.suggestions.cardsWithoutInsights.length}.`);
  }

  if (stats.suggestions.cardsWithSingleInsight.length) {
    suggestions.push(`Cartas con solo 1 insight: ${stats.suggestions.cardsWithSingleInsight.length}.`);
  }

  if (stats.suggestions.duplicatedThemes.length) {
    const preview = stats.suggestions.duplicatedThemes
      .slice(0, 3)
      .map((group) => group.join(' / '))
      .join(' · ');
    suggestions.push(`Temas duplicados por casing detectados: ${stats.suggestions.duplicatedThemes.length}. Ejemplos: ${preview}.`);
  }

  if (stats.suggestions.cardsWithoutEdges.length) {
    suggestions.push(`Cartas sin edges: ${stats.suggestions.cardsWithoutEdges.length}.`);
  }

  const list = document.getElementById('suggestions-list');
  list.innerHTML = suggestions.length ? suggestions.map((item) => `<li>${item}</li>`).join('') : '<li class="empty">Sin alertas.</li>';
}

function sortRows(rows, mode) {
  const next = [...rows];
  if (mode === 'name_asc') {
    next.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return next;
  }
  if (mode === 'state_asc') {
    next.sort((a, b) => DASHBOARD_STATE_ORDER[a.state] - DASHBOARD_STATE_ORDER[b.state] || a.name.localeCompare(b.name, 'es'));
    return next;
  }

  next.sort((a, b) => b.insightsCount - a.insightsCount || a.name.localeCompare(b.name, 'es'));
  return next;
}

function renderCardsTable(rows, sortMode) {
  const body = document.getElementById('cards-table-body');
  const sorted = sortRows(rows, sortMode);

  body.innerHTML = sorted
    .map(
      (row) => `<tr>
        <td>${row.name}</td>
        <td>${row.id}</td>
        <td>${row.insightsCount}</td>
        <td>${row.themesCount}</td>
        <td>${row.combinationsCount}</td>
        <td><span class="status-pill status-${row.state}">${row.state}</span></td>
        <td><a class="btn-go" href="./tarotGraph.html?card=${encodeURIComponent(row.id)}" target="_blank" rel="noopener noreferrer">Ir a carta</a></td>
      </tr>`,
    )
    .join('');
}

function renderCharts(stats) {
  const chartApi = window.Chart;
  if (!chartApi) return;

  destroyChartInstance('insightsPerCardChart');
  destroyChartInstance('statusDistributionChart');

  const insightLabels = stats.cardRows.map((row) => row.name);
  const insightData = stats.cardRows.map((row) => row.insightsCount);
  const insightsCanvas = document.getElementById('insights-chart');
  const stateCanvas = document.getElementById('state-chart');

  const hasInsightsData = insightLabels.length > 0 && Boolean(insightsCanvas);
  if (!hasInsightsData) {
    toggleChartEmptyState('insights', true, 'Sin datos para mostrar insights por carta.');
  } else {
    toggleChartEmptyState('insights', false);
    dashboardState.charts.insightsPerCardChart = new chartApi(insightsCanvas, {
      type: 'bar',
      data: {
        labels: insightLabels,
        datasets: [{
          label: 'Insights',
          data: insightData,
          backgroundColor: 'rgba(110,168,255,0.6)',
          borderColor: 'rgba(110,168,255,1)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { display: false } },
          y: { beginAtZero: true },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  const distributionData = [
    stats.distribution.vacio,
    stats.distribution.semilla,
    stats.distribution.creciendo,
    stats.distribution.maduro,
  ];
  const hasDistributionData = distributionData.some((value) => value > 0) && Boolean(stateCanvas);
  if (!hasDistributionData) {
    toggleChartEmptyState('state', true, 'Sin datos para mostrar distribución de estados.');
  } else {
    toggleChartEmptyState('state', false);
    dashboardState.charts.statusDistributionChart = new chartApi(stateCanvas, {
      type: 'pie',
      data: {
        labels: ['vacío', 'semilla', 'creciendo', 'maduro'],
        datasets: [{
          data: distributionData,
          backgroundColor: [
            'rgba(240,191,91,0.8)',
            'rgba(110,168,255,0.8)',
            'rgba(200,141,255,0.8)',
            'rgba(138,214,162,0.8)',
          ],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

function destroyChartInstance(chartKey) {
  const chartInstance = dashboardState.charts[chartKey];
  if (chartInstance && typeof chartInstance.destroy === 'function') {
    chartInstance.destroy();
  }
  dashboardState.charts[chartKey] = null;
}

function toggleChartEmptyState(prefix, shouldShow, message = '') {
  const wrap = document.querySelector(`[data-chart-wrap="${prefix}"]`);
  const empty = document.getElementById(`${prefix}-chart-empty`);
  if (!wrap || !empty) return;

  wrap.hidden = shouldShow;
  empty.hidden = !shouldShow;
  if (message) empty.textContent = message;
}

async function loadTarotGraph() {
  const storage = window.AstroBrainTarotStorage;
  if (!storage || typeof storage.loadTarotGraph !== 'function') {
    throw new Error('TarotStorage no está disponible.');
  }
  const result = await storage.loadTarotGraph();
  console.debug(`[TarotStorage] load source: ${result?.storage || 'unknown'}`);
  return result?.graph || null;
}

async function loadDiagnostics() {
  const storage = window.AstroBrainTarotStorage;
  if (!storage || typeof storage.getStorageDiagnostics !== 'function') return;
  dashboardState.diagnostics = await storage.getStorageDiagnostics();
  const node = document.getElementById('dashboard-debug-status');
  if (!node) return;
  const d = dashboardState.diagnostics;
  node.textContent = [
    `storage=${d.storage || 'N/D'}`,
    `memoryFallback=${d.isMemoryFallback ? 'yes' : 'no'}`,
    `fallbackReason=${d.fallbackReason || 'N/D'}`,
    `cards=${d.counts?.cards ?? 0}`,
    `insights=${d.counts?.insights ?? 0}`,
    `themes=${d.counts?.themes ?? 0}`,
    `lastSaved=${d.lastSavedAt || 'N/D'}`,
    `graphId=${d.graphId || 'tarot_primary'}`,
    `version=${d.version || 1}`,
    `persistenceError=${d.persistenceError || 'N/D'}`,
    `persistenceErrorName=${d.persistenceErrorName || 'N/D'}`,
  ].join(' · ');
  console.debug(`[TarotDashboard] loaded graph version=${d.version || 1} cards=${d.counts?.cards ?? 0} insights=${d.counts?.insights ?? 0} themes=${d.counts?.themes ?? 0}`);
}

function attachSortHandler(stats) {
  if (dashboardState.sortHandlerAttached) return;
  const select = document.getElementById('sort-select');
  select.addEventListener('change', () => {
    renderCardsTable(stats.cardRows, select.value);
  });
  dashboardState.sortHandlerAttached = true;
}

async function initTarotDashboard() {
  try {
    dashboardState.graph = await loadTarotGraph();
    dashboardState.computed = computeTarotStats(dashboardState.graph);

    const stats = dashboardState.computed;
    renderOverview(stats);
    renderContent(stats);
    renderDistribution(stats);
    renderLists(stats);
    renderSuggestions(stats);
    renderCardsTable(stats.cardRows, document.getElementById('sort-select').value);
    attachSortHandler(stats);
    renderCharts(stats);
    await loadDiagnostics();

    const storage = window.AstroBrainTarotStorage;
    if (storage?.subscribeTarotGraph) {
      storage.subscribeTarotGraph(async (detail = {}) => {
        console.debug(`[TarotDashboard] graph update event source=${detail.source || 'unknown'} insights=${detail.counts?.insights ?? 'N/D'} themes=${detail.counts?.themes ?? 'N/D'}`);
        dashboardState.graph = await loadTarotGraph();
        dashboardState.computed = computeTarotStats(dashboardState.graph);
        const current = dashboardState.computed;
        renderOverview(current);
        renderContent(current);
        renderDistribution(current);
        renderLists(current);
        renderSuggestions(current);
        renderCardsTable(current.cardRows, document.getElementById('sort-select').value);
        renderCharts(current);
        await loadDiagnostics();
      });
    }

    // Exposición para debugging/manual checks sin recálculo en cada render.
    window.TarotDashboardAPI = {
      computeTarotStats,
      getCardStats,
      getTopThemes,
      getEmptyCards,
      classifyCard,
      stats,
    };
  } catch (error) {
    document.body.innerHTML = `<main class="dashboard-layout"><section class="panel"><h1>Error</h1><p>${error.message || error}</p></section></main>`;
  }
}

document.addEventListener('DOMContentLoaded', initTarotDashboard);
