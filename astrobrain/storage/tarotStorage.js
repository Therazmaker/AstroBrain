(function attachTarotStorage(global) {
  const DB_NAME = 'AstroBrainDB';
  // ⚠️ IMPORTANTE: la versión de IndexedDB jamás debe disminuir.
  // Si hay cambios de esquema, SIEMPRE incrementar este número.
  // Reducirlo dispara VersionError cuando el navegador ya tiene una versión superior.
  const DB_VERSION = 7;
  const STORE_NAME = 'tarot_graph';
  const GRAPH_RECORD_KEY = 'primary';
  const SNAPSHOT_STORE_NAME = 'tarot_snapshots';
  const METADATA_STORE_NAME = 'metadata';
  const REQUIRED_STORES = Object.freeze([
    { name: STORE_NAME, options: undefined },
    { name: SNAPSHOT_STORE_NAME, options: { keyPath: 'id' } },
    { name: METADATA_STORE_NAME, options: { keyPath: 'id' } },
  ]);
  const MAX_SNAPSHOTS = 10;
  const GRAPH_CHANNEL_NAME = 'astrobrain_tarot_graph_sync_v1';
  const channel = typeof global.BroadcastChannel === 'function' ? new BroadcastChannel(GRAPH_CHANNEL_NAME) : null;

  let dbPromise = null;
  let activeDB = null;
  let dbVersionInUse = null;
  let memoryGraph = null;
  let persistenceError = null;
  let fallbackReason = null;
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

  function formatPersistenceError(error) {
    if (!error) return null;
    return {
      message: error.message || String(error),
      name: error.name || 'Error',
      stack: error.stack || null,
    };
  }

  function logPersistenceError(context, error) {
    const details = formatPersistenceError(error);
    if (!details) return;
    console.debug(
      `[TarotStorage] ${context} persistenceError message="${details.message}" name="${details.name}" stack="${details.stack || 'N/D'}"`,
    );
  }

  function openDB() {
    if (!global.indexedDB) {
      return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
    }

    return new Promise((resolve, reject) => {
      console.debug(`[TarotStorage] Opening DB version ${DB_VERSION}`);
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = Number(event?.oldVersion || 0);
        const newVersion = Number(event?.newVersion || db.version || DB_VERSION);
        console.debug(`[TarotStorage] onupgradeneeded oldVersion=${oldVersion} newVersion=${newVersion}`);
        REQUIRED_STORES.forEach((store) => {
          if (!db.objectStoreNames.contains(store.name)) {
            console.debug(`[TarotStorage] Creating missing store: ${store.name}`);
            db.createObjectStore(store.name, store.options);
          }
        });
      };

      request.onsuccess = () => {
        activeDB = request.result;
        console.debug(`[TarotStorage] Existing stores: ${JSON.stringify(Array.from(activeDB.objectStoreNames || []))}`);
        console.debug(`[TarotStorage] IndexedDB ready name=${activeDB.name} version=${activeDB.version}`);
        activeDB.onversionchange = () => {
          try {
            activeDB.close();
          } catch (_error) {
            // no-op
          }
          activeDB = null;
          dbPromise = null;
        };
        dbVersionInUse = Number(request.result?.version || DB_VERSION);
        resolve(request.result);
      };
      request.onblocked = () => {
        console.warn('[TarotStorage] IndexedDB open blocked by another tab/process.');
      };
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

  function closeActiveDB() {
    if (!activeDB) return;
    try {
      activeDB.close();
    } catch (_error) {
      // no-op
    }
    activeDB = null;
    dbPromise = null;
  }

  function getMissingStores(db) {
    const storeNames = Array.from(db?.objectStoreNames || []);
    return REQUIRED_STORES.map((store) => store.name).filter((storeName) => !storeNames.includes(storeName));
  }

  function assertStoreExists(db, storeName, context) {
    if (db?.objectStoreNames?.contains(storeName)) return;
    const existing = Array.from(db?.objectStoreNames || []);
    throw new Error(
      `[TarotStorage] Missing object store "${storeName}" while ${context}. Existing stores: [${existing.join(', ')}]`,
    );
  }

  function getStoreTransaction(db, storeName, mode, context) {
    assertStoreExists(db, storeName, context);
    return db.transaction(storeName, mode);
  }

  async function deleteDatabase() {
    closeActiveDB();
    return new Promise((resolve, reject) => {
      const request = global.indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve(true);
      request.onblocked = () => reject(new Error('No se pudo borrar la DB: operación bloqueada por otra pestaña.'));
      request.onerror = () => reject(request.error || new Error('No se pudo borrar la DB rota.'));
    });
  }

  async function repairSchema() {
    const db = await initDB();
    const missing = getMissingStores(db);
    if (!missing.length) {
      console.debug('[TarotStorage] repairSchema: schema is already complete.');
      return { ok: true, repaired: false, missingStores: [] };
    }

    const targetVersion = Number((db.version || dbVersionInUse || DB_VERSION) + 1);
    console.warn(`[TarotStorage] repairSchema: missing stores detected=${missing.join(', ')} targetVersion=${targetVersion}`);
    closeActiveDB();

    await new Promise((resolve, reject) => {
      console.debug(`[TarotStorage] Opening DB version ${targetVersion} (repair)`);
      const request = global.indexedDB.open(DB_NAME, targetVersion);
      request.onupgradeneeded = () => {
        const upgradeDB = request.result;
        REQUIRED_STORES.forEach((store) => {
          if (!upgradeDB.objectStoreNames.contains(store.name)) {
            console.debug(`[TarotStorage] Creating missing store: ${store.name}`);
            upgradeDB.createObjectStore(store.name, store.options);
          }
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error || new Error('Falló la reparación del schema de IndexedDB.'));
    });

    dbPromise = null;
    const repairedDB = await initDB();
    const stillMissing = getMissingStores(repairedDB);
    if (stillMissing.length) {
      throw new Error(`[TarotStorage] repairSchema incomplete. Missing stores: ${stillMissing.join(', ')}`);
    }
    return { ok: true, repaired: true, missingStores: missing, targetVersion };
  }

  function shouldRepairFromError(error) {
    const message = String(error?.message || '');
    return error?.name === 'NotFoundError' || message.includes('object stores was not found') || message.includes('Missing object store');
  }

  async function readGraphFromIndexedDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = getStoreTransaction(db, STORE_NAME, 'readonly', 'reading tarot graph');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(GRAPH_RECORD_KEY);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('No se pudo leer tarot_graph.'));
    });
  }

  async function writeGraphToIndexedDB(graph) {
    const db = await initDB();
    const payload = ensureGraphShape(clone(graph));
    payload.meta.updated_at = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const tx = getStoreTransaction(db, STORE_NAME, 'readwrite', 'writing tarot graph');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(payload, GRAPH_RECORD_KEY);
      request.onsuccess = () => resolve(payload);
      request.onerror = () => reject(request.error || new Error('No se pudo guardar tarot_graph.'));
    });
  }

  async function clearGraphFromIndexedDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = getStoreTransaction(db, STORE_NAME, 'readwrite', 'clearing tarot graph');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(GRAPH_RECORD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('No se pudo limpiar tarot_graph.'));
    });
  }

  async function listSnapshotsFromIndexedDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = getStoreTransaction(db, SNAPSHOT_STORE_NAME, 'readonly', 'listing snapshots');
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('No se pudieron listar snapshots.'));
    });
  }

  async function saveSnapshotToIndexedDB(snapshotRecord) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = getStoreTransaction(db, SNAPSHOT_STORE_NAME, 'readwrite', 'saving snapshots');
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);
      const request = store.put(snapshotRecord);
      request.onsuccess = () => resolve(snapshotRecord);
      request.onerror = () => reject(request.error || new Error('No se pudo guardar snapshot.'));
    });
  }

  async function deleteSnapshotById(snapshotId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = getStoreTransaction(db, SNAPSHOT_STORE_NAME, 'readwrite', 'deleting snapshots');
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
      fallbackReason = null;
      console.debug('[TarotStorage] Save success');
      logGraphCounts('save', saved);
      console.debug('[TarotStorage] notifyGraphChanged source=indexeddb');
      notifyGraphChanged({
        source: 'indexeddb',
        updated_at: saved.meta?.updated_at || null,
        graphVersion: saved.meta?.version || 1,
        graphSchema: saved.schema,
        counts: getGraphCounts(saved),
      });
      return { ok: true, storage: 'indexeddb', graph: saved };
    } catch (error) {
      if (!options.repairAttempted && shouldRepairFromError(error)) {
        console.warn(`[TarotStorage] saveTarotGraph detected schema error (${error.name}). Triggering repair.`);
        await repairSchema();
        return saveTarotGraph(payload, { ...options, repairAttempted: true, skipSnapshot: true });
      }
      persistenceError = error;
      fallbackReason = `saveTarotGraph failed: ${error?.message || error}`;
      logPersistenceError('saveTarotGraph', error);
      return { ok: false, storage: 'indexeddb', graph: payload, error };
    }
  }

  async function loadTarotGraph() {
    try {
      const rawFromDB = await readGraphFromIndexedDB();
      if (rawFromDB) {
        const hasLegacyBuckets = [
          rawFromDB?.nodes?.tarot_card,
          rawFromDB?.nodes?.tarot_insight,
          rawFromDB?.nodes?.tarot_combination,
          rawFromDB?.nodes?.tarot_theme,
          rawFromDB?.nodes?.tarot_source,
        ].some((bucket) => Array.isArray(bucket));
        const fromDB = ensureGraphShape(rawFromDB);

        if (hasLegacyBuckets) {
          await createSnapshot('before_legacy_migration', rawFromDB);
          await saveTarotGraph(fromDB, { skipSnapshot: true, reason: 'legacy_migration' });
        }

        memoryGraph = fromDB;
        persistenceError = null;
        fallbackReason = null;
        console.debug('[TarotStorage] Load success');
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
      if (shouldRepairFromError(error)) {
        try {
          console.warn(`[TarotStorage] loadTarotGraph detected schema error (${error.name}). Triggering repair.`);
          await repairSchema();
          return loadTarotGraph();
        } catch (repairError) {
          console.warn(`[TarotStorage] loadTarotGraph repair failed: ${repairError?.message || repairError}`);
        }
      }
      persistenceError = error;
      fallbackReason = `loadTarotGraph failed: ${error?.message || error}`;
      logPersistenceError('loadTarotGraph', error);
      if (!memoryGraph) {
        const createBaseTarotGraph = getBaseGraphFactory();
        memoryGraph = createBaseTarotGraph();
      }
      console.debug('[TarotStorage] load source: memory (contingency fallback)');
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
      fallbackReason = null;
      return { ok: true, storage: 'indexeddb' };
    } catch (error) {
      memoryGraph = null;
      persistenceError = error;
      fallbackReason = `clearTarotGraph failed: ${error?.message || error}`;
      logPersistenceError('clearTarotGraph', error);
      return { ok: false, storage: 'memory', error };
    }
  }

  async function resetTarotStorage(options = {}) {
    const force = Boolean(options.force);
    if (!force) {
      return { ok: false, error: new Error('Reset cancelado: se requiere confirmación explícita (force=true).') };
    }

    let backupGraph = null;
    try {
      backupGraph = (await loadTarotGraph())?.graph || null;
    } catch (_error) {
      backupGraph = null;
    }

    try {
      if (backupGraph) {
        await createSnapshot('before_reset_storage', backupGraph);
      }
    } catch (error) {
      console.warn(`[TarotStorage] resetTarotStorage snapshot warning: ${error?.message || error}`);
    }

    await deleteDatabase();
    dbPromise = null;
    await initDB();

    const createBaseTarotGraph = getBaseGraphFactory();
    const baseGraph = createBaseTarotGraph();
    return saveTarotGraph(baseGraph, { reason: 'reset_storage_base', skipSnapshot: true });
  }

  async function repairOrResetTarotStorage(options = {}) {
    try {
      const repaired = await repairSchema();
      if (repaired.ok) {
        const loaded = await loadTarotGraph();
        return { ok: true, mode: repaired.repaired ? 'repair' : 'healthy', graph: loaded.graph, storage: loaded.storage };
      }
      throw new Error('Repair no pudo completar el schema.');
    } catch (repairError) {
      console.warn(`[TarotStorage] repair failed, attempting reset. reason=${repairError?.message || repairError}`);
      const resetResult = await resetTarotStorage({ force: true });
      return {
        ok: Boolean(resetResult?.ok),
        mode: 'reset',
        graph: resetResult?.graph || null,
        storage: resetResult?.storage || 'indexeddb',
        error: resetResult?.error || repairError,
      };
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
      storageMode: loaded.storage === 'memory' ? 'contingency' : 'persistent',
      storage: loaded.storage,
      isMemoryFallback: loaded.storage === 'memory',
      fallbackReason: loaded.storage === 'memory' ? (fallbackReason || 'IndexedDB no disponible o falló la operación.') : null,
      dbVersion: dbVersionInUse || DB_VERSION,
      dbName: DB_NAME,
      stores: Array.from(activeDB?.objectStoreNames || []),
      graphId: graph?.meta?.graph_id || 'tarot_primary',
      version: graph?.meta?.version || 1,
      lastSavedAt: graph?.meta?.updated_at || graph?.meta?.created_at || null,
      counts,
      persistenceError: persistenceError ? String(persistenceError.message || persistenceError) : null,
      persistenceErrorName: persistenceError?.name || null,
      persistenceErrorStack: persistenceError?.stack || null,
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
    resetTarotStorage,
    repairOrResetTarotStorage,
    subscribeTarotGraph,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
