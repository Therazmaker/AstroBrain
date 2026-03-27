(function attachTarotStorage(global) {
  const DB_NAME = 'AstroBrainDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'tarot_graph';
  const GRAPH_RECORD_KEY = 'primary';
  const LEGACY_LOCAL_STORAGE_KEY = 'astrobrain_tarot_graph_override_v1';
  const GRAPH_SOURCE_PATHS = [
    '/astrobrain/memory/tarotGraph.json',
    '../memory/tarotGraph.json',
    '/memory/tarotGraph.json',
  ];

  let dbPromise = null;
  let memoryGraph = null;
  let persistenceError = null;

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
        tarot_edge: [],
      };
    };
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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
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

  async function tryLoadOptionalGraphBackup() {
    for (const path of GRAPH_SOURCE_PATHS) {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        return ensureGraphShape(data);
      } catch (_error) {
        // backup opcional
      }
    }

    return null;
  }

  async function migrateLegacyLocalStorageIfNeeded() {
    if (!global.localStorage) return { migrated: false };

    const raw = global.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return { migrated: false };

    try {
      const parsed = JSON.parse(raw);
      await writeGraphToIndexedDB(parsed);
      global.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      return { migrated: true };
    } catch (error) {
      global.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      return { migrated: false, error };
    }
  }

  async function saveTarotGraph(graph) {
    const payload = ensureGraphShape(clone(graph));

    try {
      const saved = await writeGraphToIndexedDB(payload);
      memoryGraph = saved;
      persistenceError = null;
      return { ok: true, storage: 'indexeddb', graph: saved };
    } catch (error) {
      memoryGraph = payload;
      persistenceError = error;
      return { ok: false, storage: 'memory', graph: payload, error };
    }
  }

  async function loadTarotGraph() {
    try {
      await migrateLegacyLocalStorageIfNeeded();
      const fromDB = await readGraphFromIndexedDB();
      if (fromDB) {
        memoryGraph = fromDB;
        persistenceError = null;
        return { graph: fromDB, storage: 'indexeddb', initialized: false };
      }

      let baseGraph;
      try {
        const createBaseTarotGraph = getBaseGraphFactory();
        baseGraph = createBaseTarotGraph();
      } catch (_error) {
        baseGraph = await tryLoadOptionalGraphBackup();
      }

      if (!baseGraph) {
        throw new Error('No se pudo construir el grafo base (ni dataset base ni backup opcional).');
      }

      const saveResult = await saveTarotGraph(baseGraph);
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
      return {
        graph: ensureGraphShape(clone(memoryGraph)),
        storage: 'memory',
        initialized: false,
        error,
      };
    }
  }

  async function clearTarotGraph() {
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

  global.AstroBrainTarotStorage = {
    initDB,
    saveTarotGraph,
    loadTarotGraph,
    clearTarotGraph,
    getPersistenceError,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
