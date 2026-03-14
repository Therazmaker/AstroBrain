/**
 * connectBySignals.js
 * Sistema de conexión automática entre neuronas por signals estructurales.
 * Detecta coincidencias de signals, normaliza y genera conexiones para el grafo.
 */
(function attachConnectBySignals(global) {

  // ── Diccionario de aliases (español → canónico) ──────────────
  const SIGNAL_ALIASES = {
    mercurio: 'mercury',
    mercurio_retrogrado: 'mercury_retrograde',
    mercurio_retrograda: 'mercury_retrograde',
    retrogrado: 'retrograde',
    retrograda: 'retrograde',
    luna: 'moon',
    luna_nueva: 'new_moon',
    luna_llena: 'full_moon',
    sol: 'sun',
    venus: 'venus',
    marte: 'mars',
    jupiter: 'jupiter',
    saturno: 'saturn',
    urano: 'uranus',
    neptuno: 'neptune',
    pluton: 'pluto',
    revision: 'revision',
    reinterpretacion: 'reinterpretacion',
    comunicacion: 'comunicacion',
    lenguaje: 'lenguaje',
    mente: 'mente',
    mensaje: 'mensaje',
    mensaje_interno: 'mensaje_interno',
    eclipse: 'eclipse',
    nodo_norte: 'north_node',
    nodo_sur: 'south_node',
    karma: 'karma',
    lilith: 'lilith',
    quiron: 'chiron',
    chiron: 'chiron',
  };

  // ── normalizeSignals ─────────────────────────────────────────
  /**
   * Normaliza un array o string de signals:
   * - convierte a minúsculas
   * - quita acentos
   * - reemplaza espacios por "_"
   * - quita caracteres no alfanuméricos (excepto _)
   * - quita duplicados y vacíos
   * - aplica aliases del diccionario
   *
   * @param {string|string[]} rawSignals
   * @returns {string[]}
   */
  function normalizeSignals(rawSignals) {
    const list = Array.isArray(rawSignals)
      ? rawSignals
      : typeof rawSignals === 'string'
        ? rawSignals.split(',')
        : [];

    const normalized = list
      .map(function(s) {
        return String(s || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '')
          .replace(/^_+|_+$/g, '');
      })
      .filter(Boolean);

    const aliased = normalized.map(function(s) {
      return SIGNAL_ALIASES[s] || s;
    });

    return Array.from(new Set(aliased));
  }

  // ── connectNeuronBySignals ───────────────────────────────────
  /**
   * Encuentra conexiones de una neurona con todas las demás por signals compartidos.
   *
   * @param {{id:string, signals:string[]}} neuron
   * @param {{id:string, signals:string[]}[]} allNeurons
   * @returns {{from:string, to:string, type:string, weight:number, signals:string[]}[]}
   */
  function connectNeuronBySignals(neuron, allNeurons) {
    var connections = [];
    var neuronSignals = neuron.signals || [];

    if (!neuronSignals.length) return connections;

    allNeurons.forEach(function(other) {
      if (other.id === neuron.id) return;
      var otherSignals = other.signals || [];
      var shared = neuronSignals.filter(function(s) { return otherSignals.indexOf(s) !== -1; });
      if (shared.length > 0) {
        var sorted = [neuron.id, other.id].sort();
        connections.push({
          from: sorted[0],
          to: sorted[1],
          type: 'signal_overlap',
          weight: shared.length,
          signals: shared,
        });
      }
    });

    console.log(
      '[graph] connectNeuronBySignals: ' + neuron.id +
      ' → ' + connections.length + ' conexiones encontradas'
    );
    return connections;
  }

  // ── rebuildGraphConnections ──────────────────────────────────
  /**
   * Reconstruye todas las conexiones del grafo desde cero por signals.
   * Evita duplicados.
   *
   * @param {{id:string, signals:string[]}[]} allNeurons
   * @returns {{from:string, to:string, type:string, weight:number, signals:string[]}[]}
   */
  function rebuildGraphConnections(allNeurons) {
    var seen = new Set();
    var connections = [];

    for (var i = 0; i < allNeurons.length; i++) {
      for (var j = i + 1; j < allNeurons.length; j++) {
        var a = allNeurons[i];
        var b = allNeurons[j];
        var aSignals = a.signals || [];
        var bSignals = b.signals || [];
        var shared = aSignals.filter(function(s) { return bSignals.indexOf(s) !== -1; });

        if (shared.length > 0) {
          var key = signalConnectionId(a.id, b.id);
          if (!seen.has(key)) {
            seen.add(key);
            connections.push({
              from: a.id,
              to: b.id,
              type: 'signal_overlap',
              weight: shared.length,
              signals: shared,
            });
            console.log('[graph] connecting ' + a.id + ' → ' + b.id + ' (shared: ' + shared.join(', ') + ')');
          }
        }
      }
    }

    console.log('[graph] rebuildGraphConnections: ' + connections.length + ' conexiones totales');
    return connections;
  }

  // ── ensureSignalNeurons ──────────────────────────────────────
  /**
   * Si un signal no existe como neurona, crea una neurona base automática.
   *
   * @param {string[]} signals - Lista de signals normalizados
   * @param {{id:string}[]} allNeurons - Neuronas existentes
   * @returns {{id:string, label:string, type:string, signals:string[], activation:number, createdFrom:string}[]}
   */
  function ensureSignalNeurons(signals, allNeurons) {
    var existingIds = new Set(allNeurons.map(function(n) { return n.id; }));
    var newNeurons = [];

    signals.forEach(function(signal) {
      if (!existingIds.has(signal)) {
        existingIds.add(signal); // prevent duplicate creation within same call
        var newNeuron = {
          id: signal,
          label: signal,
          type: 'semantic_signal',
          signals: [signal],
          activation: 0,
          createdFrom: 'auto_signal',
          triggers: [],
          clusters: [],
          output: { energy: '', avoid: '', use: '', focus: '' },
        };
        newNeurons.push(newNeuron);
        console.log('[graph] auto-created signal neuron: ' + signal);
      }
    });

    return newNeurons;
  }

  // ── signalConnectionId ───────────────────────────────────────
  /**
   * Genera un ID de conexión canónico (ordenado) para evitar duplicados.
   * @param {string} fromId
   * @param {string} toId
   * @returns {string}
   */
  function signalConnectionId(fromId, toId) {
    return [fromId, toId].sort().join('|');
  }

  // ── Expose ───────────────────────────────────────────────────
  global.ConnectBySignals = {
    SIGNAL_ALIASES: SIGNAL_ALIASES,
    normalizeSignals: normalizeSignals,
    connectNeuronBySignals: connectNeuronBySignals,
    rebuildGraphConnections: rebuildGraphConnections,
    ensureSignalNeurons: ensureSignalNeurons,
    signalConnectionId: signalConnectionId,
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
