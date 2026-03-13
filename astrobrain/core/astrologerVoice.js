'use strict';

const path = require('path');
const BASE = require(path.join(__dirname, '../memory/astrologer_base.json'));
const { detectEventType } = require('./eventClassifier');

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

function normalizeAspect(aspect) {
  return cleanText(String(aspect || '')).toLowerCase();
}

function isRelationalHouse(house) {
  return [1, 4, 5, 7, 8].includes(Number(house));
}

function buildTensionProfile(transits = []) {
  const items = Array.isArray(transits) ? transits : [];

  const squareTransits = items.filter((transit) => {
    const aspect = normalizeAspect(transit.aspect);
    return aspect === 'square' || aspect === 'cuadratura';
  });

  const hasRelationalHouses = squareTransits.some((transit) => {
    const context = transit.context || {};
    return isRelationalHouse(context.planetHouse) || isRelationalHouse(context.targetHouse);
  });

  return {
    hasSquare: squareTransits.length > 0,
    hasSquareRelational: squareTransits.length > 0 && hasRelationalHouses,
    squareTransits,
  };
}

function buildRelationalContextBlock(squareTransits = []) {
  if (!squareTransits.length) return '';

  const houses = squareTransits.flatMap((transit) => {
    const context = transit.context || {};
    return [context.planetHouse, context.targetHouse].filter((house) => Number.isFinite(Number(house)));
  });

  const relationalHouses = [...new Set(houses.map(Number).filter(isRelationalHouse))];
  if (!relationalHouses.length) {
    return 'En el vínculo puede aparecer fricción entre necesidad emocional y forma de responder.';
  }

  const casas = relationalHouses.map((house) => `casa ${house}`).join(' y ');
  return `La tensión se activa en ${casas}: el vínculo pide ajustar límites, tiempos y forma de contacto.`;
}


function buildAspectTensionBlock(squareTransits = []) {
  if (!squareTransits.length) return '';

  const transit = squareTransits[0];
  const planet = PLANET_ES[transit.planet] || transit.planet || 'Un planeta';
  const target = PLANET_ES[transit.target] || transit.target || 'otro punto';
  return `${planet} en cuadratura a ${target} aumenta la fricción y exige respuestas más conscientes en el vínculo.`;
}

function buildProcessAwarenessBlock() {
  return 'El proceso clave es regular antes de reaccionar: nombrar lo que duele, bajar la velocidad y recién después conversar.';
}

function reduceSoftLanguage(text = '') {
  return text
    .replace(/\bsuavidad\b/gi, 'contención')
    .replace(/\bsoltar\b/gi, 'procesar')
    .replace(/\bfluidez\b/gi, 'claridad');
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

// ─── NARRATIVA DE EVENTOS COLECTIVOS ─────────────────────────────────────────
// Estructura de 5 partes: contexto, explicación, significado, integración, acción

/**
 * generateEventNarrative(eventType, params)
 *
 * Builds a 5-part narrative for collective astrological events.
 *
 * @param {string} eventType - "luna_nueva" | "luna_llena" | "stellium"
 * @param {object} params    - { avoid, use, focus, emotion }
 * @returns {{ paragraph: string }}
 */
function generateEventNarrative(eventType, params) {
  const { avoid, use, focus, emotion } = params;
  const eventData = BASE.eventos && BASE.eventos[eventType];

  if (!eventData) {
    // Fallback: should not happen in practice
    return null;
  }

  // ── 1. Contexto ──────────────────────────────────────────────────────────────
  const contexto = endWithPeriod(pick(eventData.contexto));

  // ── 2. Explicación ───────────────────────────────────────────────────────────
  const explicacion = endWithPeriod(pick(eventData.explicacion));

  // ── 3. Significado ───────────────────────────────────────────────────────────
  let significado = endWithPeriod(pick(eventData.significado));

  // Enrich significance with detected emotion if available
  if (emotion && BASE.emociones[emotion]) {
    const transicion = pick(BASE.transiciones);
    const emocDesc   = pick(BASE.emociones[emotion]);
    significado += ` ${capitalize(transicion)} ${endWithPeriod(emocDesc)}`;
  }

  // ── 4. Integración ───────────────────────────────────────────────────────────
  const integracion = endWithPeriod(pick(eventData.integracion));

  // ── 5. Acción (acción + consejo evitar/usar/enfocar) ────────────────────────
  const accionBase = endWithPeriod(pick(eventData.accion));
  const consejo    = buildAdvice(avoid, use, focus);
  const accion     = `${accionBase} ${consejo}`;

  const partes = [contexto, explicacion, significado, integracion, accion].filter(Boolean);
  const paragraph = partes.map((p) => p.trim()).join(' ');
  return { paragraph };
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

  const tensionProfile = buildTensionProfile(signals.transits || []);
  const tone      = tensionProfile.hasSquare ? 'intensa' : detectTone(signals);
  const emotion   = detectEmotion(energy, avoid);
  const combo     = detectCombination(signals.transits || []);
  const metaSignals = tensionProfile.hasSquare
    ? (signals.metaSignals || []).filter((signal) => {
      const raw = typeof signal === 'object' ? `${signal.id || ''} ${signal.then || ''}` : String(signal || '');
      return !/(signo|grado)/i.test(raw);
    })
    : (signals.metaSignals || []);
  const metaBlock = buildMetaBlock(metaSignals);

  // ── Capa de clasificación de eventos colectivos ──────────────────────────────
  const eventType = detectEventType(signals.transits || []);
  if (eventType) {
    const eventNarrative = generateEventNarrative(eventType, { avoid, use, focus, emotion });
    if (eventNarrative) return eventNarrative;
  }

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

  // ── 3. Contexto cotidiano / relacional ─────────────────────────────────────
  let bloqueContexto = '';
  if (tensionProfile.hasSquareRelational) {
    bloqueContexto = endWithPeriod(buildRelationalContextBlock(tensionProfile.squareTransits));
  } else if (metaBlock) {
    const primer = metaBlock.charAt(0).toUpperCase() + metaBlock.slice(1);
    bloqueContexto = endWithPeriod(primer);
  }

  // ── 4. Combinación planetaria ────────────────────────────────────────────────
  let bloqueCombo = '';
  if (combo) {
    bloqueCombo = endWithPeriod(combo.tension) + ' ' + endWithPeriod(combo.consejo);
  } else if (tensionProfile.hasSquare) {
    bloqueCombo = endWithPeriod(buildAspectTensionBlock(tensionProfile.squareTransits));
  }

  // ── 4.1 Conciencia de proceso para aspectos tensos ─────────────────────────
  const bloqueProceso = tensionProfile.hasSquare
    ? endWithPeriod(buildProcessAwarenessBlock())
    : '';

  // ── 5. Consejo (avoid / use / focus) ────────────────────────────────────────
  const bloqueConsejo = buildAdvice(avoid, use, focus);

  // ── 6. Cierre ────────────────────────────────────────────────────────────────
  const cierre = endWithPeriod(pick(BASE.cierres[tone] || BASE.cierres.activa));

  // ── Anclaje opcional (1 de cada 3 interpretaciones) ─────────────────────────
  const anclaje = Math.random() < 0.33
    ? endWithPeriod(pick(BASE.anclajes))
    : '';

  // ── Ensamblar párrafo ────────────────────────────────────────────────────────
  const partes = tensionProfile.hasSquare
    ? [
      bloqueEmocional,
      bloqueCombo,
      bloqueContexto,
      bloqueProceso,
      anclaje,
      bloqueConsejo,
      cierre,
    ]
    : [
      apertura,
      bloqueEmocional,
      bloqueContexto,
      bloqueCombo,
      anclaje,
      bloqueConsejo,
      cierre,
    ];

  const paragraph = partes
    .filter(Boolean)
    .map(p => p.trim())
    .join(' ');

  return { paragraph: tensionProfile.hasSquare ? reduceSoftLanguage(paragraph) : paragraph };
}

module.exports = { generateAstrologerVoice };
