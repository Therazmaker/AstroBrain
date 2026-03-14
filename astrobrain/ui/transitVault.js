(function (global) {
  const VAULT_LOG = '[TransitVault]';
  const STORE_DATASETS = 'transitDatasets';
  const STORE_SETTINGS = 'transitVaultSettings';

  const vaultState = {
    datasets: [],
    active: { chat: null, graph: null, general: null },
  };

  function uid(prefix = 'tv') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function safeDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function normalizeDay(day = {}) {
    return {
      ...day,
      date: day.date || day.day || '',
      moonPhase: day.moonPhase || {},
      transits: Array.isArray(day.transits) ? day.transits : [],
      bodies: day.bodies || {},
    };
  }

  function isValidTransitJson(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: 'JSON raíz inválido.' };
    if (!data.meta || typeof data.meta !== 'object') return { valid: false, error: 'Falta meta en el JSON.' };
    if (!Array.isArray(data.days)) return { valid: false, error: 'Falta days[] en el JSON.' };
    for (let i = 0; i < data.days.length; i += 1) {
      const day = data.days[i] || {};
      if (!day.date) return { valid: false, error: `El día #${i + 1} no tiene date.` };
      if (!day.bodies || typeof day.bodies !== 'object') return { valid: false, error: `El día ${day.date} no tiene bodies.` };
      const moon = day.moonPhase || {};
      if (!moon.phaseName && !moon.phase) return { valid: false, error: `El día ${day.date} no tiene moonPhase.phaseName.` };
      if (!moon.sign) return { valid: false, error: `El día ${day.date} no tiene moonPhase.sign.` };
    }
    return { valid: true };
  }

  function detectDatasetType(filename = '', data = {}) {
    const low = String(filename || '').toLowerCase();
    const daysCount = Array.isArray(data.days) ? data.days.length : 0;
    if (low.includes('today')) return 'today';
    if (low.includes('week')) return 'weekly';
    if (/\d{4}-\d{2}\.json$/i.test(low)) return 'monthly';
    if (low.includes('90d') || low.includes('180d')) return 'full';
    if (daysCount === 1) return 'today';
    if (daysCount <= 7) return 'weekly';
    if (daysCount <= 31) return 'monthly';
    return 'full';
  }

  function strengthToScale(strength = 'soft') {
    const map = { very_strong: 1, strong: 0.7, medium: 0.4, soft: 0.2, moon_phase: 0.5 };
    return map[strength] || 0.2;
  }

  function resolveSignalsFromDay(day = {}) {
    const moonSignals = global.resolveMoonSignalsFromDay ? global.resolveMoonSignalsFromDay(day) : [];
    const transitSignals = (Array.isArray(day.transits) ? day.transits : []).map((t) => ({
      key: `${(t.planet || '').toLowerCase()}_${(t.aspect || '').toLowerCase()}_${(t.target || '').toLowerCase()}`,
      strength: t.strength || 'medium',
      source: 'transit',
      date: day.date,
      transit: t,
    })).filter((s) => s.key !== '__');
    return [...transitSignals, ...moonSignals.map((s) => ({ ...s, date: day.date }))];
  }

  function activateGraphSignals(signals = [], brainGraph = null) {
    if (!brainGraph || typeof brainGraph !== 'object') return 0;
    brainGraph.activations = brainGraph.activations || {};
    let applied = 0;
    signals.forEach((signal) => {
      const inc = strengthToScale(signal.strength);
      brainGraph.activations[signal.key] = (brainGraph.activations[signal.key] || 0) + inc;
      applied += 1;
    });
    console.info(`${VAULT_LOG} Graph activation applied: ${applied}`);
    return applied;
  }

  function summarizeDataset(dataset = {}) {
    const days = dataset.days || [];
    const dates = days.map((d) => safeDate(d.date)).filter(Boolean).sort((a, b) => a - b);
    const moonPhaseCount = days.filter((d) => d.moonPhase && (d.moonPhase.phaseName || d.moonPhase.phase)).length;
    const majorMoon = days.filter((d) => ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'].includes(d?.moonPhase?.phaseName || d?.moonPhase?.phase)).length;
    let strongTransits = 0;
    const signFreq = {};
    days.forEach((d) => {
      const sign = d?.moonPhase?.sign;
      if (sign) signFreq[sign] = (signFreq[sign] || 0) + 1;
      (d.transits || []).forEach((t) => {
        if (t.strength === 'strong' || t.strength === 'very_strong') strongTransits += 1;
      });
    });
    const mostCommonMoonSigns = Object.entries(signFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sign, count]) => ({ sign, count }));
    return {
      totalDays: days.length,
      dateRange: dates.length ? { from: dates[0].toISOString().slice(0, 10), to: dates[dates.length - 1].toISOString().slice(0, 10) } : null,
      moonPhaseCount,
      majorMoon,
      strongTransits,
      mostCommonMoonSigns,
    };
  }

  async function saveTransitDataset(dataset) {
    const db = await global.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DATASETS, 'readwrite');
      const req = tx.objectStore(STORE_DATASETS).put(dataset);
      req.onsuccess = () => resolve(dataset);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllTransitDatasets() {
    const db = await global.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DATASETS, 'readonly');
      const req = tx.objectStore(STORE_DATASETS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function deleteTransitDataset(id) {
    const db = await global.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_DATASETS, STORE_SETTINGS], 'readwrite');
      tx.objectStore(STORE_DATASETS).delete(id);
      const getReq = tx.objectStore(STORE_SETTINGS).get('activeDatasets');
      getReq.onsuccess = () => {
        const active = getReq.result?.value || { chat: null, graph: null, general: null };
        Object.keys(active).forEach((k) => { if (active[k] === id) active[k] = null; });
        tx.objectStore(STORE_SETTINGS).put({ id: 'activeDatasets', value: active });
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getActiveMap() {
    const db = await global.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const req = tx.objectStore(STORE_SETTINGS).get('activeDatasets');
      req.onsuccess = () => resolve(req.result?.value || { chat: null, graph: null, general: null });
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function setActiveTransitDataset(id, mode = 'general') {
    const db = await global.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.get('activeDatasets');
      req.onsuccess = () => {
        const current = req.result?.value || { chat: null, graph: null, general: null };
        current[mode] = id;
        store.put({ id: 'activeDatasets', value: current });
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getActiveTransitDataset(mode = 'general') {
    const active = await getActiveMap();
    const all = await getAllTransitDatasets();
    return all.find((d) => d.id === active[mode]) || null;
  }

  function getDayByDate(dataset, dateStr) {
    return (dataset?.days || []).find((d) => d.date === dateStr);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function resolveTimeIntent(userText = '') {
    const txt = userText.toLowerCase();
    if (txt.includes('semana')) return 'weekly';
    if (txt.includes('mes')) return 'monthly';
    if (txt.includes('hoy')) return 'today';
    return 'today';
  }

  function getDaysForIntent(intent, dataset) {
    const days = dataset?.days || [];
    if (!days.length) return [];
    if (intent === 'today') {
      const today = todayISO();
      return [getDayByDate(dataset, today) || days[0]].filter(Boolean);
    }
    if (intent === 'weekly') return days.slice(0, 7);
    if (intent === 'monthly') return days.slice(0, 31);
    return days;
  }

  function filterInteresting(days = [], userText = '') {
    const txt = userText.toLowerCase();
    const needsInteresting = ['interesante', 'interesantes', 'importante', 'fuertes'].some((k) => txt.includes(k));
    if (!needsInteresting) return days;
    return filterInterestingDays(days);
  }

  function isMajorMoonPhase(phaseName) {
    return ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'].includes(phaseName);
  }

  function filterInterestingDays(days = []) {
    return days.map((day) => ({
      ...day,
      transits: (day.transits || []).filter((t) => ['very_strong', 'strong'].includes(t.strength)),
    })).filter((d) => {
      const phaseName = d?.moonPhase?.phaseName || d?.moonPhase?.phase;
      return d.transits.length > 0 || isMajorMoonPhase(phaseName);
    });
  }

  function buildNarrativeContext(days = []) {
    return days.slice(0, 10).map((day) => {
      const moon = day.moonPhase || {};
      return {
        date: day.date,
        moonPhase: {
          phaseName: moon.phaseName || moon.phase || '',
          sign: moon.sign || '',
          degree: moon.degree || null,
        },
        topTransits: (day.transits || []).slice(0, 3),
      };
    });
  }

  function buildPromptContext(days = [], signals = []) {
    return days.slice(0, 10).map((day) => {
      const moon = day.moonPhase || {};
      const topTransits = (day.transits || []).slice(0, 3).map((t) => `${t.planet} ${t.aspect} ${t.target}${t.strength ? ` (${t.strength})` : ''}`).join('; ');
      const activeSignals = signals.filter((s) => s.date === day.date).slice(0, 8).map((s) => s.key).join(', ');
      const themes = [moon.phaseName || moon.phase, moon.sign, (day.summary && (day.summary.theme || day.summary.dominantTheme))].filter(Boolean).join(' · ');
      return `Fecha: ${day.date}\nFase lunar: ${moon.phaseName || moon.phase || 'N/A'}\nSigno lunar: ${moon.sign || 'N/A'}\nTop tránsitos: ${topTransits || 'N/A'}\nSeñales activas: ${activeSignals || 'N/A'}\nTemas dominantes: ${themes || 'N/A'}`;
    }).join('\n\n');
  }

  function renderDatasetSummary(dataset) {
    const summary = summarizeDataset(dataset);
    const range = summary.dateRange ? `${summary.dateRange.from} → ${summary.dateRange.to}` : '—';
    return `Días: ${summary.totalDays} · Rango: ${range} · Fases lunares: ${summary.moonPhaseCount} · Tránsitos fuertes: ${summary.strongTransits}`;
  }

  function ensureVaultStateDecorations() {
    vaultState.datasets.forEach((d) => {
      d.isActiveForChat = vaultState.active.chat === d.id;
      d.isActiveForGraph = vaultState.active.graph === d.id;
      d.isActiveGeneral = vaultState.active.general === d.id;
      d.summary = d.summary || summarizeDataset(d);
    });
  }

  async function refreshVaultState() {
    vaultState.datasets = await getAllTransitDatasets();
    vaultState.active = await getActiveMap();
    ensureVaultStateDecorations();
    renderVaultLibrary();
    renderVaultActivation();
    renderVaultDebug();
  }

  function friendlyType(type) {
    const labels = { today: 'today', weekly: 'weekly', monthly: 'monthly', full: 'full' };
    return labels[type] || type;
  }

  function renderVaultLibrary() {
    const wrap = document.getElementById('tv-library-list');
    if (!wrap) return;
    if (!vaultState.datasets.length) {
      wrap.innerHTML = '<div style="color:var(--text-muted)">Sin datasets importados todavía.</div>';
      return;
    }
    wrap.innerHTML = vaultState.datasets.map((d) => {
      const s = d.summary || summarizeDataset(d);
      const range = s.dateRange ? `${s.dateRange.from} → ${s.dateRange.to}` : '—';
      return `<div class="tv-card">
        <div class="tv-card-head"><strong>${d.label}</strong><span class="tv-badge">${friendlyType(d.type)}</span></div>
        <div class="tv-card-meta">Rango: ${range} · Días: ${s.totalDays} · Importado: ${new Date(d.importedAt).toLocaleString()}</div>
        <div class="tv-card-meta">Chat: ${d.isActiveForChat ? '✅' : '—'} · Grafo: ${d.isActiveForGraph ? '✅' : '—'} · General: ${d.isActiveGeneral ? '✅' : '—'}</div>
        <div class="tv-actions">
          <button onclick="TransitVault.setActive('${d.id}','chat')">Activar para chat</button>
          <button onclick="TransitVault.setActive('${d.id}','graph')">Activar para grafo</button>
          <button onclick="TransitVault.setActive('${d.id}','general')">Uso general</button>
          <button onclick="TransitVault.showSummary('${d.id}')">Ver resumen</button>
          <button onclick="TransitVault.remove('${d.id}')">Eliminar</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderVaultActivation() {
    const el = document.getElementById('tv-activation-panel');
    if (!el) return;
    const byId = Object.fromEntries(vaultState.datasets.map((d) => [d.id, d]));
    function row(mode, label) {
      const d = byId[vaultState.active[mode]];
      const s = d?.summary;
      const range = s?.dateRange ? `${s.dateRange.from} → ${s.dateRange.to}` : '—';
      return `<div class="tv-activation-row"><strong>${label}:</strong> ${d ? `${d.label} (${d.type}) · ${s.totalDays} días · ${range}` : 'No definido'}</div>`;
    }
    el.innerHTML = `${row('general', 'Dataset general')}${row('chat', 'Dataset chat')}${row('graph', 'Dataset grafo')}`;
  }

  function currentDayPreview(dataset) {
    const day = getDayByDate(dataset, todayISO()) || dataset?.days?.[0];
    if (!day) return null;
    return {
      day,
      moonSignals: global.resolveMoonSignalsFromDay ? global.resolveMoonSignalsFromDay(day) : [],
      signals: resolveSignalsFromDay(day),
    };
  }

  function renderVaultDebug() {
    const el = document.getElementById('tv-debug-panel');
    if (!el) return;
    const totalDatasets = vaultState.datasets.length;
    const totalDays = vaultState.datasets.reduce((acc, d) => acc + (d.days?.length || 0), 0);
    const moonPhaseDays = vaultState.datasets.reduce((acc, d) => acc + (d.days || []).filter((x) => x?.moonPhase?.phaseName || x?.moonPhase?.phase).length, 0);
    const activeGeneral = vaultState.datasets.find((d) => d.id === vaultState.active.general) || null;
    const preview = activeGeneral ? currentDayPreview(activeGeneral) : null;
    const strong = activeGeneral
      ? (activeGeneral.days || []).flatMap((d) => d.transits || []).filter((t) => ['strong', 'very_strong'].includes(t.strength)).length
      : 0;
    el.innerHTML = `<div>Total datasets: ${totalDatasets}</div>
      <div>Total días indexados: ${totalDays}</div>
      <div>Días con moonPhase: ${moonPhaseDays}</div>
      <div>Tránsitos fuertes (dataset activo): ${strong}</div>
      <div>Preview día actual: ${preview ? preview.day.date : '—'}</div>
      <div>Señales lunares hoy: ${preview ? preview.moonSignals.map((s) => s.key).join(', ') : '—'}</div>`;
  }

  function readFilesAsJson(files) {
    return Promise.all(Array.from(files || []).map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          resolve({ fileName: file.name, data: parsed });
        } catch (e) {
          reject(new Error(`Archivo ${file.name} no es JSON válido.`));
        }
      };
      reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
      reader.readAsText(file);
    })));
  }

  async function importJsonData(data, sourceFile = 'manual.json') {
    const validation = isValidTransitJson(data);
    if (!validation.valid) {
      console.warn(`${VAULT_LOG} JSON inválido`, validation.error, data);
      throw new Error(validation.error);
    }
    const type = detectDatasetType(sourceFile, data);
    const dataset = {
      id: uid('dataset'),
      type,
      label: data.meta?.label || sourceFile,
      sourceFile,
      importedAt: new Date().toISOString(),
      isActiveForChat: false,
      isActiveForGraph: false,
      meta: data.meta || {},
      days: data.days.map(normalizeDay),
    };
    dataset.summary = summarizeDataset(dataset);
    await saveTransitDataset(dataset);
    console.info(`${VAULT_LOG} Dataset imported: ${dataset.label} (${dataset.type}) days=${dataset.days.length}`);
    await refreshVaultState();
    return dataset;
  }

  async function onImportFiles() {
    const input = document.getElementById('tv-file-input');
    const status = document.getElementById('tv-import-status');
    if (!input?.files?.length) {
      status.textContent = 'Selecciona uno o más archivos JSON.';
      return;
    }
    try {
      const parsedFiles = await readFilesAsJson(input.files);
      for (const item of parsedFiles) {
        await importJsonData(item.data, item.fileName);
      }
      status.textContent = `Importación completa: ${parsedFiles.length} archivo(s).`;
    } catch (err) {
      status.textContent = err.message;
      console.error(`${VAULT_LOG} Error importando archivos`, err);
    }
  }

  async function onImportPastedJson() {
    const txt = document.getElementById('tv-json-textarea')?.value || '';
    const status = document.getElementById('tv-import-status');
    if (!txt.trim()) {
      status.textContent = 'Pega un JSON en el textarea.';
      return;
    }
    try {
      const parsed = JSON.parse(txt);
      await importJsonData(parsed, 'pasted.json');
      status.textContent = 'JSON pegado importado correctamente.';
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      console.error(`${VAULT_LOG} Error importando JSON pegado`, err);
    }
  }

  async function setActive(id, mode) {
    await setActiveTransitDataset(id, mode);
    await refreshVaultState();
    const d = vaultState.datasets.find((x) => x.id === id);
    console.info(`${VAULT_LOG} Active dataset for ${mode}: ${d?.label || id}`);
  }

  async function quickUse(type, mode = 'chat') {
    const candidate = vaultState.datasets.find((d) => d.type === type);
    if (!candidate) return;
    await setActive(candidate.id, mode);
  }

  function showSummary(id) {
    const d = vaultState.datasets.find((x) => x.id === id);
    if (!d) return;
    alert(renderDatasetSummary(d));
  }

  async function remove(id) {
    await deleteTransitDataset(id);
    await refreshVaultState();
  }

  async function resolveTodaySignals() {
    const dataset = await getActiveTransitDataset('general');
    if (!dataset) return [];
    const day = getDayByDate(dataset, todayISO()) || dataset.days[0];
    if (!day) return [];
    const signals = resolveSignalsFromDay(day);
    console.info(`${VAULT_LOG} Moon signals resolved: ${(global.resolveMoonSignalsFromDay ? global.resolveMoonSignalsFromDay(day) : []).length}`);
    const target = document.getElementById('tv-debug-panel');
    if (target) {
      const line = document.createElement('div');
      line.textContent = `Signals for ${day.date}: ${signals.map((s) => s.key).slice(0, 14).join(', ')}`;
      target.appendChild(line);
    }
    return signals;
  }

  async function activateDatasetGraph() {
    const dataset = await getActiveTransitDataset('graph');
    if (!dataset) return 0;
    const day = getDayByDate(dataset, todayISO()) || dataset.days[0];
    if (!day) return 0;
    const signals = resolveSignalsFromDay(day);
    console.info(`${VAULT_LOG} Active dataset for graph: ${dataset.label}`);
    global.__astroBrainGraph = global.__astroBrainGraph || { activations: {} };
    return activateGraphSignals(signals, global.__astroBrainGraph);
  }

  function buildWeeklyNarrativePreview() {
    const dataset = vaultState.datasets.find((d) => d.id === vaultState.active.chat) || vaultState.datasets[0];
    if (!dataset) return 'No hay dataset activo para preview.';
    const days = getDaysForIntent('weekly', dataset);
    const narrative = global.renderSpanishNarrative ? global.renderSpanishNarrative(days) : buildPromptContext(days, days.flatMap((d) => resolveSignalsFromDay(d)));
    const out = `Narrativa semanal\n\n${narrative}`;
    const target = document.getElementById('tv-quick-output');
    if (target) target.textContent = out;
    return out;
  }

  async function answerFromTransitVault(userText = '') {
    const activeDataset = await getActiveTransitDataset('chat') || await getActiveTransitDataset('general');
    if (!activeDataset) return null;

    // Try the smart Q&A engine first — it understands specific questions
    if (global.AstroQA) {
      const qaAnswer = global.AstroQA.answer(userText, activeDataset);
      if (qaAnswer !== null) return qaAnswer;
    }

    // Fall back to narrative/context summary for open-ended questions
    const intent = resolveTimeIntent(userText);
    let days = getDaysForIntent(intent, activeDataset);
    days = filterInteresting(days, userText);
    if (global.renderSpanishNarrative) {
      return global.renderSpanishNarrative(days);
    }
    const signals = days.flatMap((d) => resolveSignalsFromDay(d));
    return buildPromptContext(days, signals);
  }

  function bindVaultUi() {
    const tabButtons = document.querySelectorAll('[data-tv-tab]');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tv-tab');
        document.querySelectorAll('.tv-subtab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tv-subtab').forEach((panel) => panel.classList.toggle('active', panel.id === `tv-tab-${tab}`));
      });
    });

    document.getElementById('tv-btn-import-files')?.addEventListener('click', onImportFiles);
    document.getElementById('tv-btn-import-text')?.addEventListener('click', onImportPastedJson);
    document.getElementById('tv-btn-chat-today')?.addEventListener('click', () => quickUse('today', 'chat'));
    document.getElementById('tv-btn-chat-week')?.addEventListener('click', () => quickUse('weekly', 'chat'));
    document.getElementById('tv-btn-graph-activate')?.addEventListener('click', activateDatasetGraph);
    document.getElementById('tv-btn-resolve-today')?.addEventListener('click', resolveTodaySignals);
    document.getElementById('tv-btn-weekly-preview')?.addEventListener('click', buildWeeklyNarrativePreview);
  }

  async function init() {
    bindVaultUi();
    await refreshVaultState();
  }

  const api = {
    init,
    isValidTransitJson,
    detectDatasetType,
    saveTransitDataset,
    getAllTransitDatasets,
    deleteTransitDataset,
    setActiveTransitDataset,
    getActiveTransitDataset,
    resolveMoonSignalsFromDay: global.resolveMoonSignalsFromDay,
    resolveSignalsFromDay,
    activateGraphSignals,
    resolveTimeIntent,
    getDaysForIntent,
    isMajorMoonPhase,
    filterInterestingDays,
    filterInteresting,
    buildNarrativeContext,
    buildPromptContext,
    summarizeDataset,
    importJsonData,
    setActive,
    remove,
    showSummary,
    answerFromTransitVault,
  };

  global.TransitVault = api;
})(window);
