'use strict';

const path = require('path');
const BASE = require(path.join(__dirname, '../memory/astrologer_base.json'));

// ─── UTILS ───────────────────────────────────────────────────────────────────

function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function endWithPeriod(str) {
  if (!str) return '';
  const s = str.trimEnd();
  return /[.!?]$/.test(s) ? s : s + '.';
}

// ─── DETECCIÓN DE EMOCIÓN ────────────────────────────────────────────────────
// Mapea palabras clave del campo `energy` a una emoción del base JSON

const EMOTION_MAP = [
  { keys: ['frustración', 'frustrado', 'bloqueo', 'bloqueado', 'obstáculo'],   emotion: 'frustración' },
  { keys: ['reactiv', 'impulsiv', 'irritab', 'tenso', 'tensa'],                emotion: 'reactividad' },
  { keys: ['pesadez', 'pesado', 'heaviness', 'peso', 'carga', 'lento'],        emotion: 'pesadez' },
  { keys: ['armonía', 'armonía', 'harmony', 'fluido', 'fluida', 'conexión'],   emotion: 'armonía' },
  { keys: ['expansión', 'expansivo', 'expansion', 'crecer', 'ampliar'],        emotion: 'expansión' },
  { keys: ['presión', 'obligación', 'deber', 'responsabilidad'],               emotion: 'presión' },
  { keys: ['claridad', 'claro', 'clara', 'lucidez', 'precis'],                 emotion: 'claridad' },
  { keys: ['impulso', 'acción', 'activo', 'activa', 'energía activa'],         emotion: 'impulso' },
  { keys: ['sensibilidad', 'sensible', 'sensitiv', 'permeab'],                 emotion: 'sensibilidad' },
];

function detectEmotion(energy = '', avoid = '') {
  const haystack = (energy + ' ' + avoid).toLowerCase();
  for (const { keys, emotion } of EMOTION_MAP) {
    if (keys.some(k => haystack.includes(k))) return emotion;
  }
  return null; // no match → no añade bloque de emoción
}

// ─── DETECCIÓN DE TONO ───────────────────────────────────────────────────────

function detectTone(signals = {}) {
  const tone = cleanText(signals.tone);
  if (tone === 'intense') return 'intensa';
  if (tone === 'active')  return 'activa';
  if (tone === 'soft')    return 'suave';

  // Fallback: inferir desde dominantCluster y metaSignals
  const cluster = cleanText(signals.dominantCluster);
  if (cluster === 'emotional' && signals.metaSignals?.length > 0) return 'intensa';
  if (cluster === 'actional' || cluster === 'mental') return 'activa';
  return 'suave';
}

// ─── DETECCIÓN DE COMBINACIONES PLANETARIAS ──────────────────────────────────
// Lee los tránsitos activos y busca pares con entrada en el base JSON

const PLANET_ES = {
  Moon: 'Luna', Mars: 'Marte', Saturn: 'Saturno',
  Sun: 'Sol', Venus: 'Venus', Mercury: 'Mercurio', Jupiter: 'Júpiter',
};

function detectCombination(transits = []) {
  if (!Array.isArray(transits) || transits.length < 2) return null;

  const planets = [...new Set(transits.map(t => PLANET_ES[t.planet] || t.planet))];

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const key1 = `${planets[i]}_${planets[j]}`;
      const key2 = `${planets[j]}_${planets[i]}`;
      if (BASE.combinaciones[key1]) return BASE.combinaciones[key1];
      if (BASE.combinaciones[key2]) return BASE.combinaciones[key2];
    }
  }
  return null;
}

// ─── META-SEÑAL ───────────────────────────────────────────────────────────────

function buildMetaBlock(metaSignals = []) {
  if (!Array.isArray(metaSignals) || metaSignals.length === 0) return '';

  // Buscar la primera señal con entrada en el base
  for (const signal of metaSignals) {
    const id = typeof signal === 'object' ? signal.id : signal;
    const frases = BASE.metaSenales[id];
    if (frases) return pick(frases);
  }

  // Fallback: humanizar el texto crudo de la primera señal
  const raw = typeof metaSignals[0] === 'object'
    ? metaSignals[0].then || metaSignals[0].id || ''
    : metaSignals[0];
  const cleaned = cleanText(raw);
  if (!cleaned) return '';
  const lowered = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return `${lowered} puede sentirse más fuerte de lo habitual`;
}

// ─── CONSTRUCTOR DE CONSEJO ───────────────────────────────────────────────────

function buildAdvice(avoid, use, focus) {
  const patterns = BASE.consejoPatrones;

  const evitar  = endWithPeriod(pick(patterns.evitar).replace('{avoid}', avoid));
  const usar    = endWithPeriod(pick(patterns.usar).replace('{use}', use));
  const enfocar = endWithPeriod(pick(patterns.enfocar).replace('{focus}', focus));

  const puente = pick(BASE.puentes);
  return `${puente} ${evitar} ${capitalize(usar)} ${capitalize(enfocar)}`;
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

/**
 * generateAstrologerVoice(signals)
 *
 * @param {object} signals
 *   - energy        {string}   Resumen de energía del día
 *   - avoid         {string}   Qué evitar
 *   - use           {string}   Qué aprovechar
 *   - focus         {string}   En qué enfocarse
 *   - tone          {string}   'intense' | 'active' | 'soft'
 *   - dominantCluster {string}
 *   - metaSignals   {Array}    Señales del motor neuronal
 *   - transits      {Array}    Tránsitos activos (opcional, para combinaciones)
 *
 * @returns {{ paragraph: string }}
 */
function generateAstrologerVoice(signals = {}) {
  const energy = cleanText(signals.energy) || 'una energía sensible';
  const avoid  = cleanText(signals.avoid)  || 'las reacciones impulsivas';
  const use    = cleanText(signals.use)    || 'las acciones conscientes';
  const focus  = cleanText(signals.focus)  || 'lo que hoy necesita atención real';

  const tone      = detectTone(signals);
  const emotion   = detectEmotion(energy, avoid);
  const combo     = detectCombination(signals.transits || []);
  const metaBlock = buildMetaBlock(signals.metaSignals || []);

  // ── 1. Apertura ─────────────────────────────────────────────────────────────
  const apertura = endWithPeriod(pick(BASE.aperturas[tone] || BASE.aperturas.activa));

  // ── 2. Bloque emocional ─────────────────────────────────────────────────────
  let bloqueEmocional = '';
  if (emotion && BASE.emociones[emotion]) {
    const transicion = pick(BASE.transiciones);
    const desc = pick(BASE.emociones[emotion]);
    bloqueEmocional = `${capitalize(transicion)} ${desc}`;
    if (!/[.!?]$/.test(bloqueEmocional)) bloqueEmocional += '.';
  } else {
    // Fallback si no se detecta emoción: usar el campo energy directamente
    const transicion = pick(BASE.transiciones);
    bloqueEmocional = endWithPeriod(`${capitalize(transicion)} ${energy}`);
  }

  // ── 3. Contexto cotidiano ────────────────────────────────────────────────────
  let bloqueContexto = '';
  if (metaBlock) {
    const primer = metaBlock.charAt(0).toUpperCase() + metaBlock.slice(1);
    bloqueContexto = endWithPeriod(primer);
  }

  // ── 4. Combinación planetaria ────────────────────────────────────────────────
  let bloqueCombo = '';
  if (combo) {
    bloqueCombo = endWithPeriod(combo.tension) + ' ' + endWithPeriod(combo.consejo);
  }

  // ── 5. Consejo (avoid / use / focus) ────────────────────────────────────────
  const bloqueConsejo = buildAdvice(avoid, use, focus);

  // ── 6. Cierre ────────────────────────────────────────────────────────────────
  const cierre = endWithPeriod(pick(BASE.cierres[tone] || BASE.cierres.activa));

  // ── Anclaje opcional (1 de cada 3 interpretaciones) ─────────────────────────
  const anclaje = Math.random() < 0.33
    ? endWithPeriod(pick(BASE.anclajes))
    : '';

  // ── Ensamblar párrafo ────────────────────────────────────────────────────────
  const partes = [
    apertura,
    bloqueEmocional,
    bloqueContexto,
    bloqueCombo,
    anclaje,
    bloqueConsejo,
    cierre,
  ].filter(Boolean).map(p => p.trim());

  const paragraph = partes.join(' ');

  return { paragraph };
}

module.exports = { generateAstrologerVoice };
