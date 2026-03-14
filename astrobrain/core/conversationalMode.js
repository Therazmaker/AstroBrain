'use strict';

/**
 * conversationalMode.js
 *
 * AstroBrain en modo operativo conversacional.
 *
 * INPUTS:
 *   1. JSON de tránsitos precalculados (dailyPositions, transits, moonPhase, summary).
 *   2. Grafo neuronal astrológico (neuronas semánticas, aspectos, signos, activaciones).
 *   3. Contexto conversacional activo del usuario (userMessage, history).
 *
 * OBJETIVO:
 *   Convertir datos astronómicos en narrativa astrológica viva, clara y significativa.
 */

const interpretTransits = require('./interpretTransits');
const { enrichTransits } = require('./enrichTransitContext');
const { scoreTransit, strengthLabel } = require('./scoreTransits');
const { assignStrength, isMoonPhaseTransit, STRENGTH_RANK } = require('./filterTransits');

// ─── INTENT DETECTION ────────────────────────────────────────────────────────

// Intent detection patterns.
// Note: 'accion' is intentionally stored without the accent to keep object keys
// ASCII-safe. The regex below matches both 'accion' and 'acción' from user input.
const INTENT_PATTERNS = [
  { intent: 'semana',       pattern: /\bsemana\b/i },
  { intent: 'interesantes', pattern: /\binteresantes?\b/i },
  { intent: 'emocional',    pattern: /\bemocional(es)?\b/i },
  { intent: 'accion',       pattern: /\bacci[oó]n\b|\bactuar\b|\bimpulso\b/i },
  { intent: 'hoy',          pattern: /\bhoy\b/i },
];

/**
 * Detects the user's intent from their message.
 * Defaults to 'hoy' when no keyword matches.
 *
 * @param {string} userMessage
 * @returns {'hoy'|'semana'|'interesantes'|'emocional'|'accion'}
 */
function detectIntent(userMessage = '') {
  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(userMessage)) return intent;
  }
  return 'hoy';
}

// ─── PLANET PRIORITY LISTS BY INTENT ─────────────────────────────────────────

const INTENT_PLANET_PRIORITY = {
  emocional: ['Moon', 'Venus', 'Neptune'],
  accion:    ['Mars', 'Sun', 'Jupiter'],
};

// ─── SEMANTIC MEANING MAP ────────────────────────────────────────────────────
// Maps transit keys to human-readable meaning arrays (tensión → significado).

const SEMANTIC_MEANINGS = {
  moon_square_mars:          ['tensión emocional', 'impulsividad', 'necesidad de descargar energía'],
  moon_opposition_mars:      ['tensión emocional intensa', 'reactividad elevada', 'necesidad de espacio propio'],
  moon_conjunction_mars:     ['energía emocional directa', 'impulso desde las emociones', 'necesidad de acción'],
  moon_square_saturn:        ['peso emocional', 'necesidad de estructura interna', 'proceso de maduración'],
  moon_opposition_saturn:    ['frialdad emocional', 'distancia afectiva', 'llamado a la responsabilidad'],
  moon_trine_venus:          ['armonía emocional', 'sensibilidad abierta', 'facilidad para el vínculo'],
  moon_sextile_venus:        ['apertura afectiva suave', 'conexión emocional fluida', 'disfrute interior'],
  venus_trine_jupiter:       ['expansión afectiva', 'disfrute', 'apertura social'],
  venus_conjunction_jupiter: ['abundancia afectiva', 'celebración interior', 'generosidad emocional'],
  venus_square_mars:         ['tensión entre deseo y acción', 'atracción con fricción', 'impulsividad en los vínculos'],
  venus_opposition_mars:     ['polaridad afectiva', 'tensión entre dar y recibir', 'energía relacional intensa'],
  venus_sextile_neptune:     ['sensibilidad romántica', 'intuición afectiva', 'idealismo suave'],
  mars_trine_sun:            ['impulso creativo', 'capacidad de acción fluida', 'energía activa y dirigida'],
  mars_sextile_jupiter:      ['impulso expansivo', 'oportunidad de acción', 'confianza para avanzar'],
  mars_square_saturn:        ['bloqueo en la acción', 'fricción con los límites', 'necesidad de paciencia activa'],
  mars_opposition_saturn:    ['resistencia externa a la acción', 'tensión con la autoridad', 'llamado a replantear la estrategia'],
  mercury_square_saturn:     ['bloqueo mental', 'lentitud en la comunicación', 'revisión interna necesaria'],
  mercury_trine_jupiter:     ['claridad mental expansiva', 'fluidez en la expresión', 'pensamiento amplio'],
  sun_conjunction_jupiter:   ['expansión del ser', 'confianza', 'apertura al crecimiento'],
  sun_trine_moon:            ['armonía entre emoción y voluntad', 'fluidez interior', 'momento de integración'],
  sun_square_saturn:         ['presión sobre la identidad', 'peso de las responsabilidades', 'necesidad de consolidarse'],
  saturn_conjunction_sun:    ['presión hacia la madurez', 'peso sobre el ego', 'construcción interna lenta'],
  jupiter_trine_moon:        ['expansión emocional', 'optimismo interior', 'confianza en los sentimientos'],
  neptune_conjunction_moon:  ['hipersensibilidad', 'permeabilidad emocional', 'apertura a lo intuitivo'],
  neptune_square_moon:       ['confusión emocional', 'dificultad para discernir', 'necesidad de enraizarse'],
};

// ─── SPANISH DICTIONARIES ────────────────────────────────────────────────────

const PLANET_ES = {
  Moon:    'la Luna',
  Mars:    'Marte',
  Saturn:  'Saturno',
  Sun:     'el Sol',
  Venus:   'Venus',
  Mercury: 'Mercurio',
  Jupiter: 'Júpiter',
  Neptune: 'Neptuno',
  Uranus:  'Urano',
  Pluto:   'Plutón',
};

const ASPECT_ES = {
  conjunction: 'conjunción',
  square:      'cuadratura',
  trine:       'trígono',
  opposition:  'oposición',
  sextile:     'sextil',
};

const ASPECT_NATURE = {
  conjunction: 'fusión e intensificación',
  square:      'tensión y fricción creativa',
  opposition:  'polaridad y tensión',
  trine:       'flujo armónico',
  sextile:     'oportunidad suave',
};

const ASPECT_ENERGY_TYPE = {
  conjunction: 'energía fusionada',
  square:      'energía en tensión',
  opposition:  'energía polarizada',
  trine:       'energía en flujo',
  sextile:     'energía de oportunidad',
};

// ─── PRIORITIZATION ──────────────────────────────────────────────────────────

/**
 * Assigns a strength label and sorts transits by:
 * very_strong > strong > moon_phase > medium > soft
 *
 * @param {Array} transits
 * @returns {Array} sorted transits, each with a `strength` field
 */
function prioritizeByStrength(transits = []) {
  return transits
    .map((t) => {
      const scored = t.score !== undefined ? t : scoreTransit(t);
      return { ...scored, strength: assignStrength(scored) };
    })
    .sort((a, b) => (STRENGTH_RANK[b.strength] ?? 0) - (STRENGTH_RANK[a.strength] ?? 0));
}

/**
 * Filters and re-orders transits based on the detected user intent.
 *
 * @param {Array}  transits
 * @param {string} intent   - 'hoy'|'semana'|'interesantes'|'emocional'|'accion'
 * @returns {Array}
 */
function filterByIntent(transits = [], intent = 'hoy') {
  const prioritized = prioritizeByStrength(transits);

  switch (intent) {
    case 'interesantes':
      return prioritized.filter((t) =>
        ['very_strong', 'strong', 'moon_phase'].includes(t.strength),
      );

    case 'emocional': {
      const emotionalPlanets = INTENT_PLANET_PRIORITY.emocional;
      return [...prioritized].sort((a, b) => {
        const aScore = emotionalPlanets.includes(a.planet) ? 1 : 0;
        const bScore = emotionalPlanets.includes(b.planet) ? 1 : 0;
        return bScore - aScore;
      });
    }

    case 'accion': {
      const actionPlanets = INTENT_PLANET_PRIORITY.accion;
      return [...prioritized].sort((a, b) => {
        const aScore = actionPlanets.includes(a.planet) ? 1 : 0;
        const bScore = actionPlanets.includes(b.planet) ? 1 : 0;
        return bScore - aScore;
      });
    }

    default: // 'hoy', 'semana', or unknown
      return prioritized;
  }
}

// ─── SEMANTIC FILTER ─────────────────────────────────────────────────────────

/**
 * Returns the semantic meanings for a transit (if known).
 *
 * @param {object} transit
 * @returns {string[]|null}
 */
function getSemanticMeaning(transit) {
  const key = `${transit.planet}_${transit.aspect}_${transit.target}`.toLowerCase();
  return SEMANTIC_MEANINGS[key] || null;
}

/**
 * Builds a single contextual sentence for a transit including:
 * sign, aspect nature, and energy type — never using raw technical tokens.
 *
 * Example output:
 *   "Con Marte en Cáncer en cuadratura con la Luna,
 *    se activa tensión y fricción creativa (energía en tensión)."
 *
 * @param {object} transit
 * @returns {string}
 */
function buildAstroContextSentence(transit) {
  const planet     = PLANET_ES[transit.planet]   || transit.planet   || '';
  const aspect     = ASPECT_ES[transit.aspect]   || transit.aspect   || '';
  const nature     = ASPECT_NATURE[transit.aspect]    || '';
  const energyType = ASPECT_ENERGY_TYPE[transit.aspect] || '';
  const target     = PLANET_ES[transit.target]   || transit.target   || '';
  const ctx        = transit.context             || {};
  const sign       = ctx.planetSign              || '';

  const signPhrase   = sign ? ` en ${sign}` : '';
  const natureSuffix = nature
    ? ` — ${nature}${energyType ? ` (${energyType})` : ''}`
    : '';

  if (!aspect || !target) {
    return planet ? `${planet}${signPhrase} activa una energía sensible.` : '';
  }

  return `Con ${planet}${signPhrase} en ${aspect} con ${target}${natureSuffix}.`;
}

/**
 * Converts a transit into a full semantic paragraph:
 * astrological context sentence + human meaning list.
 *
 * @param {object} transit
 * @returns {string}
 */
function buildSemanticParagraph(transit) {
  const context  = buildAstroContextSentence(transit);
  const meanings = getSemanticMeaning(transit);

  if (meanings && meanings.length) {
    return `${context} Esto puede traducirse en: ${meanings.join(', ')}.`;
  }

  if (transit.emotion) {
    return `${context} La energía activa se manifiesta como ${transit.emotion}.`;
  }

  return context;
}

// ─── NARRATIVE BUILDING ───────────────────────────────────────────────────────

/**
 * Builds the semantic-context block that precedes the full narrative:
 * one paragraph per top transit (max 3) explaining sign/aspect/energy.
 *
 * @param {Array} transits
 * @returns {string}
 */
function buildSemanticBlock(transits = []) {
  return transits
    .slice(0, 3)
    .map(buildSemanticParagraph)
    .filter(Boolean)
    .join('\n');
}

/**
 * Builds a brief synthesis sentence based on the dominant transit and intent.
 *
 * @param {Array}  topTransits
 * @param {string} intent
 * @returns {string}
 */
function buildSynthesis(topTransits = [], intent = 'hoy') {
  const top = topTransits[0];
  if (!top) return 'Sin tránsitos significativos para este momento.';

  const planet  = PLANET_ES[top.planet] || top.planet || 'un planeta';
  const emotion = top.emotion           || 'movimiento energético';

  const prefixes = {
    hoy:          `Hoy, el acento está en ${emotion} con ${planet} como motor principal.`,
    semana:       `Esta semana, la energía dominante es ${emotion} con la influencia de ${planet}.`,
    interesantes: `El momento más significativo está marcado por ${emotion} activado por ${planet}.`,
    emocional:    `En lo emocional, destaca ${emotion} con la presencia de ${planet}.`,
    accion:       `Para la acción, ${planet} aporta ${emotion} como energía central.`,
  };

  return prefixes[intent] || prefixes.hoy;
}

// ─── MAIN CONVERSATIONAL ENTRY POINT ─────────────────────────────────────────

/**
 * runConversationalMode — AstroBrain en modo operativo conversacional.
 *
 * @param {object|Array} transitData - Pre-calculated transit JSON:
 *   {
 *     transits:        Array  – transit objects (planet, aspect, target, orb, strength?)
 *     dailyPositions:  object – (optional) planet positions by sign/degree
 *     moonPhase:       object – (optional) { phase, sign }
 *     summary:         string – (optional) day summary
 *   }
 *   Alternatively, pass a raw Array of transit objects directly.
 *
 * @param {object} conversationalContext - Active user conversation context:
 *   {
 *     userMessage: string  – the user's message (used for intent detection)
 *     history:     Array   – (optional) previous conversation turns
 *   }
 *
 * @param {object} [neuralGraph] - (optional) Astrological neural graph
 *   { neurons, aspects, signs, activations }
 *   Passed through to the neural engine when present.
 *
 * @returns {{
 *   intent:           string,
 *   narrative:        { reading: object, semanticContext: string },
 *   synthesis:        string,
 *   filteredTransits: Array,
 *   sessionId:        string,
 *   recordFeedback:   Function
 * }}
 */
function runConversationalMode(transitData = {}, conversationalContext = {}, neuralGraph = null) {
  const userMessage = conversationalContext.userMessage
    || conversationalContext.message
    || '';

  const intent = detectIntent(userMessage);

  // ── 1. Extract transits ───────────────────────────────────────────────────
  const rawTransits = Array.isArray(transitData)
    ? [...transitData]
    : [...(transitData.transits || [])];

  // Inject moon-phase transit when present in the input package
  const moonPhase = !Array.isArray(transitData) ? transitData.moonPhase : null;
  if (moonPhase && moonPhase.phase) {
    rawTransits.push({
      planet:   'Moon',
      event:    moonPhase.phase,
      type:     moonPhase.phase,
      sign:     moonPhase.sign || '',
      strength: 'moon_phase',
    });
  }

  // ── 2. Enrich with sign/house/element context ────────────────────────────
  const enrichedTransits = enrichTransits(rawTransits);

  // ── 3. Filter & prioritize by intent ────────────────────────────────────
  const filteredTransits = filterByIntent(enrichedTransits, intent);

  // ── 4. Run the core interpretation engine ───────────────────────────────
  const interpretation = interpretTransits(filteredTransits.slice(0, 5));

  // ── 5. Build semantic context block (sign, aspect nature, energy type) ──
  const topTransits    = interpretation.topTransits || filteredTransits;
  const semanticContext = buildSemanticBlock(topTransits);

  // ── 6. Build brief synthesis ─────────────────────────────────────────────
  const synthesis = buildSynthesis(topTransits, intent);

  return {
    intent,
    narrative: {
      reading:        interpretation.narrative,
      semanticContext,
    },
    synthesis,
    filteredTransits: filteredTransits.slice(0, 5),
    sessionId:        interpretation.sessionId,
    recordFeedback:   interpretation.recordFeedback,
  };
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

module.exports = {
  runConversationalMode,
  detectIntent,
  prioritizeByStrength,
  filterByIntent,
  getSemanticMeaning,
  buildAstroContextSentence,
  buildSemanticParagraph,
  buildSynthesis,
  INTENT_PLANET_PRIORITY,
  STRENGTH_RANK,
};
