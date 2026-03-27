(function attachTarotStorage(global) {
  const DB_NAME = 'AstroBrainDB';
  const DB_VERSION = 2;
  const STORE_NAME = 'tarot_graph';
  const GRAPH_RECORD_KEY = 'primary';
  const SNAPSHOT_STORE_NAME = 'tarot_graph_snapshots';
  const MAX_SNAPSHOTS = 10;
  const GRAPH_CHANNEL_NAME = 'astrobrain_tarot_graph_sync_v1';
  const channel = typeof global.BroadcastChannel === 'function' ? new BroadcastChannel(GRAPH_CHANNEL_NAME) : null;

  let dbPromise = null;
  let memoryGraph = null;
  let persistenceError = null;
  const subscribers = new Set();

  function getBaseGraphFactory() {
    const api = global.AstroBrainTarotBaseCards;
    if (!api || typeof api.createTarotBaseCards !== 'function') {
      throw new Error('No se pudo acceder a createTarotBaseCards desde baseCards.js');
    }

    return function createBaseTarotGraph() {
      const cards = api.createTarotBaseCards();
      const cardIndex = cards.reduce((acc, card) => {
        acc[card.id] = card;
        return acc;
      }, {});

      return {
        schema: 'astrobrain_tarot_graph_v1',
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
        edges: {},
        tarot_edge: [],
      };
    };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function migrateNodeBucket(bucket, bucketName) {
    if (Array.isArray(bucket)) {
      const migrated = {};
      bucket.forEach((item, index) => {
        if (!isPlainObject(item)) return;
        const id = item.id || `${bucketName}_${index + 1}`;
        if (!item.id) {
          console.warn(`[TarotStorage] ${bucketName}[${index}] no tiene id. Se ignora durante migración de array->objeto.`);
          return;
        }
        migrated[id] = item;
      });
      console.warn(`[TarotStorage] Se detectó estructura legacy en ${bucketName} (array). Migrada a objeto indexado por id.`);
      return migrated;
    }
    return isPlainObject(bucket) ? bucket : {};
  }

  function validateTarotGraph(graphInput) {
    const graph = graphInput || {};
    graph.schema = graph.schema || 'astrobrain_tarot_graph_v1';
    graph.meta = isPlainObject(graph.meta) ? graph.meta : {};
    graph.nodes = isPlainObject(graph.nodes) ? graph.nodes : {};

    graph.nodes.tarot_card = migrateNodeBucket(graph.nodes.tarot_card, 'nodes.tarot_card');
    graph.nodes.tarot_insight = migrateNodeBucket(graph.nodes.tarot_insight, 'nodes.tarot_insight');
    graph.nodes.tarot_combination = migrateNodeBucket(graph.nodes.tarot_combination, 'nodes.tarot_combination');
    graph.nodes.tarot_theme = migrateNodeBucket(graph.nodes.tarot_theme, 'nodes.tarot_theme');
    graph.nodes.tarot_source = migrateNodeBucket(graph.nodes.tarot_source, 'nodes.tarot_source');

    const validInsights = {};
    Object.entries(graph.nodes.tarot_insight).forEach(([key, insight]) => {
      if (!isPlainObject(insight)) return;
      if (!insight.id || !insight.card_id) {
        console.warn(`[TarotStorage] tarot_insight inválido omitido: key=${key} id=${insight?.id || 'N/D'} card_id=${insight?.card_id || 'N/D'}`);
        return;
      }
      validInsights[insight.id] = insight;
    });
    graph.nodes.tarot_insight = validInsights;

    graph.edges = isPlainObject(graph.edges) ? graph.edges : {};
    graph.tarot_edge = Array.isArray(graph.tarot_edge) ? graph.tarot_edge : [];

    console.debug(`[TarotStorage] validateTarotGraph type(nodes.tarot_insight)=${Array.isArray(graph.nodes.tarot_insight) ? 'array' : typeof graph.nodes.tarot_insight}`);
    console.debug(`[TarotStorage] validateTarotGraph valid insights=${Object.keys(graph.nodes.tarot_insight).length}`);
    return graph;
  }

  function ensureGraphShape(graph) {
    return validateTarotGraph(graph || {});
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getGraphCounts(graph) {
    const current = ensureGraphShape(graph);
    return {
      cards: Object.keys(current.nodes.tarot_card || {}).length,
      insights: Object.keys(current.nodes.tarot_insight || {}).length,
      themes: Object.keys(current.nodes.tarot_theme || {}).length,
    };
  }

  function logGraphCounts(prefix, graph) {
    const counts = getGraphCounts(graph);
    console.debug(`[TarotStorage] ${prefix} cards: ${counts.cards} insights: ${counts.insights} themes: ${counts.themes}`);
  }

  function notifyGraphChanged(detail) {
    const payload = detail || {};
    subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (_error) {
        // no-op
      }
    });

    try {
      global.dispatchEvent(new CustomEvent('astrobrain:tarot-graph-updated', { detail: payload }));
    } catch (_error) {
      // no-op
    }

    if (channel) {
      channel.postMessage(payload);
    }
  }

  function openDB() {
    if (!global.indexedDB) {
      return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
    }

    return new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
          db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
    });
  }

  async function initDB() {
    if (!dbPromise) {
      dbPromise = openDB().catch((error) => {
        persistenceError = error;
        throw error;
      });
    }
    return dbPromise;
  }

  async function readGraphFromIndexedDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(GRAPH_RECORD_KEY);

      request.onsuccess = () => resolve(request.result ? ensureGraphShape(request.result) : null);
      request.onerror = () => reject(request.error || new Error('No se pudo leer tarot_graph.'));
    });
  }

  async function writeGraphToIndexedDB(graph) {
    const db = await initDB();
    const payload = ensureGraphShape(clone(graph));
    payload.meta.updated_at = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(payload, GRAPH_RECORD_KEY);
      request.onsuccess = () => resolve(payload);
      request.onerror = () => reject(request.error || new Error('No se pudo guardar tarot_graph.'));
    });
  }

  async function clearGraphFromIndexedDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(GRAPH_RECORD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('No se pudo limpiar tarot_graph.'));
    });
  }

  async function listSnapshotsFromIndexedDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readonly');
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('No se pudieron listar snapshots.'));
    });
  }

  async function saveSnapshotToIndexedDB(snapshotRecord) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);
      const request = store.put(snapshotRecord);
      request.onsuccess = () => resolve(snapshotRecord);
      request.onerror = () => reject(request.error || new Error('No se pudo guardar snapshot.'));
    });
  }

  async function deleteSnapshotById(snapshotId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);
      const request = store.delete(snapshotId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('No se pudo borrar snapshot.'));
    });
  }

  async function createSnapshot(reason = 'manual', graph = null) {
    const loaded = graph ? ensureGraphShape(clone(graph)) : (await loadTarotGraph()).graph;
    const snapshot = {
      id: `snapshot_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      created_at: new Date().toISOString(),
      reason,
      graph: loaded,
      counts: getGraphCounts(loaded),
      meta: loaded.meta || {},
    };

    try {
      await saveSnapshotToIndexedDB(snapshot);
      const snapshots = await listSnapshotsFromIndexedDB();
      if (snapshots.length > MAX_SNAPSHOTS) {
        snapshots
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .slice(0, snapshots.length - MAX_SNAPSHOTS)
          .forEach((item) => {
            deleteSnapshotById(item.id).catch(() => {});
          });
      }
      console.debug(`[TarotStorage] snapshot created: ${snapshot.id} reason: ${reason}`);
      return { ok: true, snapshot };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function restoreLatestSnapshot() {
    try {
      const snapshots = await listSnapshotsFromIndexedDB();
      if (!snapshots.length) {
        return { ok: false, error: new Error('No hay snapshots para restaurar.') };
      }
      const latest = snapshots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      const saveResult = await saveTarotGraph(latest.graph, { skipSnapshot: true, reason: 'restore_latest_snapshot' });
      return { ok: Boolean(saveResult.ok), snapshot: latest, graph: saveResult.graph, storage: saveResult.storage };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function saveTarotGraph(graph, options = {}) {
    const payload = validateTarotGraph(clone(graph));
    const saveReason = options.reason || 'save';

    if (!options.skipSnapshot) {
      await createSnapshot(`before_${saveReason}`, payload);
    }

    try {
      const saved = await writeGraphToIndexedDB(payload);
      memoryGraph = saved;
      persistenceError = null;
      console.debug('[TarotGraph] save completed');
      logGraphCounts('save', saved);
      notifyGraphChanged({
        source: 'indexeddb',
        updated_at: saved.meta?.updated_at || null,
        graphVersion: saved.meta?.version || 1,
        graphSchema: saved.schema,
        counts: getGraphCounts(saved),
      });
      return { ok: true, storage: 'indexeddb', graph: saved };
    } catch (error) {
      memoryGraph = payload;
      persistenceError = error;
      console.debug('[TarotStorage] load source: memory (fallback after save error)');
      logGraphCounts('save(memory)', payload);
      return { ok: false, storage: 'memory', graph: payload, error };
    }
  }

  async function loadTarotGraph() {
    try {
      const fromDB = await readGraphFromIndexedDB();
      if (fromDB) {
        memoryGraph = fromDB;
        persistenceError = null;
        console.debug('[TarotStorage] load source: indexeddb');
        logGraphCounts('load(indexeddb)', fromDB);
        return { graph: fromDB, storage: 'indexeddb', initialized: false };
      }

      let baseGraph;
      try {
        const createBaseTarotGraph = getBaseGraphFactory();
        baseGraph = createBaseTarotGraph();
      } catch (_error) {
        baseGraph = null;
      }

      if (!baseGraph) {
        throw new Error('No se pudo construir el grafo base (ni dataset base ni backup opcional).');
      }

      console.debug('[TarotStorage] load source: fallback(base)');
      logGraphCounts('load(base)', baseGraph);
      const saveResult = await saveTarotGraph(baseGraph, { reason: 'bootstrap_base' });
      return {
        graph: saveResult.graph,
        storage: saveResult.storage,
        initialized: true,
        error: saveResult.ok ? null : saveResult.error,
      };
    } catch (error) {
      persistenceError = error;
      if (!memoryGraph) {
        const createBaseTarotGraph = getBaseGraphFactory();
        memoryGraph = createBaseTarotGraph();
      }
      console.debug('[TarotStorage] load source: memory (error fallback)');
      logGraphCounts('load(memory)', memoryGraph);
      return {
        graph: ensureGraphShape(clone(memoryGraph)),
        storage: 'memory',
        initialized: false,
        error,
      };
    }
  }

  async function clearTarotGraph(options = {}) {
    const loaded = await loadTarotGraph();
    const insightCount = Object.keys(loaded?.graph?.nodes?.tarot_insight || {}).length;
    if (!options.force && insightCount > 0) {
      return {
        ok: false,
        storage: loaded.storage || 'indexeddb',
        error: new Error('Bloqueado: existe un grafo persistido con insights > 0. Usa clearTarotGraph({ force: true }) para reset explícito.'),
      };
    }

    try {
      await clearGraphFromIndexedDB();
      memoryGraph = null;
      persistenceError = null;
      return { ok: true, storage: 'indexeddb' };
    } catch (error) {
      memoryGraph = null;
      persistenceError = error;
      return { ok: false, storage: 'memory', error };
    }
  }

  function getPersistenceError() {
    return persistenceError;
  }

  async function getStorageDiagnostics() {
    const loaded = await loadTarotGraph();
    const graph = loaded.graph;
    const counts = getGraphCounts(graph);
    return {
      storage: loaded.storage,
      graphId: graph?.meta?.graph_id || 'tarot_primary',
      version: graph?.meta?.version || 1,
      lastSavedAt: graph?.meta?.updated_at || graph?.meta?.created_at || null,
      counts,
      persistenceError: persistenceError ? String(persistenceError.message || persistenceError) : null,
    };
  }

  function subscribeTarotGraph(listener) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  if (channel) {
    channel.addEventListener('message', (event) => {
      const detail = event?.data || {};
      subscribers.forEach((listener) => {
        try {
          listener(detail);
        } catch (_error) {
          // no-op
        }
      });
    });
  }

  global.AstroBrainTarotStorage = {
    initDB,
    saveTarotGraph,
    loadTarotGraph,
    validateTarotGraph,
    clearTarotGraph,
    getPersistenceError,
    getStorageDiagnostics,
    createSnapshot,
    restoreLatestSnapshot,
    subscribeTarotGraph,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
