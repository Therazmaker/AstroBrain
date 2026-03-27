const GRAPH_SOURCE_PATHS = ['/memory/tarotGraph.json', '../memory/tarotGraph.json'];

const state = {
  graph: null,
  cards: [],
  selectedCardId: null,
};

async function fetchGraph() {
  for (const path of GRAPH_SOURCE_PATHS) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) continue;
      return await response.json();
    } catch (_error) {
      // try next path
    }
  }

  return null;
}

function findCardCluster(graph, cardId) {
  const edges = graph.tarot_edge || [];
  const insights = graph.nodes?.tarot_insight || {};
  const combinations = graph.nodes?.tarot_combination || {};
  const themes = graph.nodes?.tarot_theme || {};

  const cardEdges = edges.filter((edge) => edge.from === cardId || edge.to === cardId);
  const insightIds = cardEdges
    .filter((edge) => edge.relation === 'has_insight' && edge.from === cardId)
    .map((edge) => edge.to);

  const clusterInsights = insightIds.map((id) => insights[id]).filter(Boolean);
  const combinationIds = new Set();
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
    cluster.insights.map(
      (item) => `${item.energy_general || 'Sin energía general'} <span class="badge added">tarot_insight</span>`,
    ),
  );

  renderList(
    'themes-list',
    cluster.themes.map((theme) => `${theme.name} <span class="badge added">tarot_theme</span>`),
  );

  renderList(
    'combinations-list',
    cluster.combinations.map(
      (comb) => `${comb.with_card || 'Sin carta asociada'}: ${comb.effect || 'Sin descripción'} <span class="badge added">tarot_combination</span>`,
    ),
  );

  renderList(
    'edges-list',
    cluster.edges.map(
      (edge) => `${edge.relation} (${edge.origin}) · peso ${Number(edge.weight || 0).toFixed(2)} <span class="edge ${edge.origin === 'manual' ? 'edge-manual' : 'edge-auto'}">${edge.origin}</span>`,
    ),
  );
}

function setupFilter() {
  const input = document.getElementById('card-filter');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = state.cards.filter(
      (card) => card.name.toLowerCase().includes(q) || card.id.toLowerCase().includes(q),
    );
    renderCardList(filtered);
  });
}

async function bootstrap() {
  const graph = await fetchGraph();
  if (!graph?.nodes?.tarot_card) {
    document.getElementById('selected-card').textContent = 'No se pudo cargar /memory/tarotGraph.json';
    return;
  }

  state.graph = graph;
  state.cards = Object.values(graph.nodes.tarot_card);
  state.selectedCardId = state.cards[0]?.id || null;

  renderCardList(state.cards);
  renderSelectedCard();
  setupFilter();
}

bootstrap();
