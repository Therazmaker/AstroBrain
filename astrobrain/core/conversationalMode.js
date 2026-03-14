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
 * MODOS DE RESPUESTA:
 *   - 'data'      (default): devuelve JSON estructurado sin narrativa.
 *   - 'narrative': devuelve narrativa interpretativa (modo legado).
 */

const interpretTransits = require('./interpretTransits');
const { enrichTransits } = require('./enrichTransitContext');
const { scoreTransit: legacyScoreTransit, strengthLabel } = require('./scoreTransits');
const { assignStrength, isMoonPhaseTransit, STRENGTH_RANK } = require('./filterTransits');
const { rankDayTransits, labelScore } = require('../astro/scoring/scoreTransit');

// ─── RESPONSE MODE ────────────────────────────────────────────────────────────

/** Default response mode: returns structured JSON instead of narrative text. */
const DEFAULT_RESPONSE_MODE = 'data';

// ─── CONVERSATIONAL STATE ─────────────────────────────────────────────────────

/**
 * Persists context across conversational turns so that relative references
 * ("y el 15", "y mañana", "y ese día") resolve correctly without repeating
 * the previous date by mistake.
 */
const astroConversationState = {
  lastReferencedDate: null,
  lastDatasetType:    null,
  lastIntent:         null,
};

// ─── INTENT DETECTION ────────────────────────────────────────────────────────

// Intent detection patterns.
// Note: 'accion' is intentionally stored without the accent to keep object keys
// ASCII-safe. The regex below matches both 'accion' and 'acción' from user input.
// 'transit_data_request' is listed first so it takes priority over overlapping patterns.
const INTENT_PATTERNS = [
  {
    intent: 'transit_data_request',
    pattern: /tr[aá]nsito.*d[ií]a|tr[aá]nsito.*ma[nñ]ana|qu[eé].*hay.*semana|dame\s+(varios|uno\s+fuerte)|cu[aá]l\s+meto|tr[aá]nsito\s+del\s+d[ií]a|y\s+(el\s+\d+|ma[nñ]ana|ese\s+d[ií]a)/i,
  },
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
 * @returns {'transit_data_request'|'hoy'|'semana'|'interesantes'|'emocional'|'accion'}
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
      const scored = t.score !== undefined ? t : legacyScoreTransit(t);
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

// ─── DATA MODE CONSTANTS ─────────────────────────────────────────────────────

/** Aspect labels in Spanish for form preset sectionB.aspectType. */
const ASPECT_LABEL_ES = {
  conjunction: 'Conjunción',
  square:      'Cuadratura',
  trine:       'Trígono',
  opposition:  'Oposición',
  sextile:     'Sextil',
};

/** Active signal tags emitted per moon phase (English phase names). */
const MOON_PHASE_SIGNALS = {
  'New Moon':       ['moon_new_moon',       'inicio'],
  'First Quarter':  ['moon_first_quarter',  'accion', 'decision'],
  'Full Moon':      ['moon_full_moon',       'culminacion', 'intensidad'],
  'Last Quarter':   ['moon_last_quarter',   'revision', 'cierre'],
  'Waxing Crescent': ['moon_waxing_crescent', 'crecimiento'],
  'Waxing Gibbous':  ['moon_waxing_gibbous',  'maduracion'],
  'Waning Gibbous':  ['moon_waning_gibbous',  'integracion'],
  'Waning Crescent': ['moon_waning_crescent', 'descanso', 'introspeccion'],
};

/** Spanish month name → 1-based month number. */
const MONTH_MAP_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// ─── DATA MODE: LOOKUP TYPE DETECTION ────────────────────────────────────────

/**
 * Determines how many transits and what date range the user is asking for.
 *
 * Rules:
 *   "dame varios"                   → 'multiple'        (top 3 transits)
 *   "cuál meto" / "más fuerte" / "dame uno fuerte" → 'strongest' (1 transit)
 *   "interesantes … semana"         → 'interesting_week' (top 1–2/day, score ≥ 11)
 *   "semana" / "esta semana"        → 'week'
 *   default                         → 'specific_day' (1–3 transits)
 *
 * @param {string} userText
 * @returns {'specific_day'|'week'|'strongest'|'multiple'|'interesting_week'}
 */
function detectLookupType(userText = '') {
  if (/dame\s+varios/i.test(userText)) return 'multiple';
  if (/cu[aá]l\s+meto|dame\s+uno\s+fuerte|m[aá]s\s+fuerte/i.test(userText)) return 'strongest';
  if (/interesantes?.*semana|semana.*interesantes?/i.test(userText)) return 'interesting_week';
  if (/semana/i.test(userText)) return 'week';
  return 'specific_day';
}

// ─── DATA MODE: DATE RESOLUTION ──────────────────────────────────────────────

/**
 * Resolves the target date from the user text and the dataset.
 *
 * Priority order:
 *   1. Contextual back-reference ("y ese día" → lastReferencedDate)
 *   2. "y mañana" relative reference
 *   3. "el 15 [de marzo]" — explicit day with optional Spanish month
 *   4. "mañana" → tomorrow
 *   5. "hoy"    → today
 *   6. First date in dataset, otherwise today
 *
 * @param {string} userText
 * @param {Array}  days  - Array of { date?, ... } objects
 * @returns {string}  ISO date string "YYYY-MM-DD"
 */
function resolveDate(userText, days) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 1. Contextual back-reference
  if (/y\s+(ese\s+d[ií]a|eso|ese\s+mismo)/i.test(userText) && astroConversationState.lastReferencedDate) {
    return astroConversationState.lastReferencedDate;
  }

  // 2. "y mañana" relative reference
  if (/y\s+ma[nñ]ana/i.test(userText)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // 3. "el 15 [de marzo]"
  const dayMatch = userText.match(/\bel\s+(\d{1,2})(?:\s+de\s+([a-záéíóúñ]+))?/i);
  if (dayMatch) {
    const dayNum = parseInt(dayMatch[1], 10);
    const monthName = (dayMatch[2] || '').toLowerCase();
    const monthNum = MONTH_MAP_ES[monthName] || today.getMonth() + 1;
    const year = today.getFullYear();
    // Validate the parsed date before returning
    const candidate = new Date(Date.UTC(year, monthNum - 1, dayNum));
    if (
      !Number.isNaN(candidate.getTime())
      && candidate.getUTCMonth() === monthNum - 1
      && candidate.getUTCDate() === dayNum
    ) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  // 4. "mañana"
  if (/\bma[nñ]ana\b/i.test(userText)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // 5. "hoy"
  if (/\bhoy\b/i.test(userText)) return todayStr;

  // 6. First day in dataset or today
  const firstDay = Array.isArray(days) && days.length > 0 ? days[0] : null;
  return (firstDay && firstDay.date) ? firstDay.date : todayStr;
}

// ─── DATA MODE: FORM PRESET BUILDER ─────────────────────────────────────────

/**
 * Builds a UI-ready form preset object from a single enriched transit.
 *
 * Maps:
 *   transit.planet / context.planetSign / context.planetDegree  → sectionA
 *   transit.aspect / transit.orb / context.isApplying           → sectionB
 *   transit.target / context.targetSign / context.targetDegree  → sectionC
 *
 * @param {object} transit
 * @returns {{sectionA: object, sectionB: object, sectionC: object}}
 */
function buildFormPreset(transit) {
  const ctx = transit.context || {};
  const applyingRaw = ctx.isApplying !== undefined ? ctx.isApplying : transit.applying;
  const aspectState = applyingRaw === true
    ? 'Aplicativo'
    : applyingRaw === false
      ? 'Separativo'
      : '';

  return {
    sectionA: {
      planet:   transit.planet   || '',
      bodyType: 'Planeta',
      sign:     ctx.planetSign   || transit.sign   || '',
      degree:   ctx.planetDegree !== undefined ? ctx.planetDegree  : (transit.degree  ?? null),
    },
    sectionB: {
      aspectType:  ASPECT_LABEL_ES[transit.aspect] || transit.aspect || '',
      orb:         transit.orb !== undefined ? transit.orb : null,
      aspectState,
    },
    sectionC: {
      targetPlanet: transit.target     || '',
      targetType:   'Planeta',
      targetSign:   ctx.targetSign     || '',
      targetDegree: ctx.targetDegree   !== undefined ? ctx.targetDegree : null,
    },
  };
}

// ─── DATA MODE: ACTIVE SIGNALS BUILDER ───────────────────────────────────────

/**
 * Aggregates active signal tags for a day from the moon phase and transits.
 *
 * Includes:
 *   - Phase-specific signals (moon_new_moon, descanso, introspeccion, …)
 *   - Moon-in-sign signal   (moon_in_capricorn, moon_in_aries, …)
 *   - Per-transit resolvedSignals already computed by enrichTransitContext
 *
 * Tags are NOT translated — they stay in their canonical lowercase form.
 *
 * @param {object} moonPhase - { phaseName?, phase?, sign?, degree? }
 * @param {Array}  transits  - Enriched transit objects (may have resolvedSignals)
 * @returns {string[]}
 */
function buildActiveSignals(moonPhase = {}, transits = []) {
  const signals = [];

  // Phase signals
  const phaseName = moonPhase.phaseName || moonPhase.phase || '';
  const phaseSignals = MOON_PHASE_SIGNALS[phaseName] || [];
  signals.push(...phaseSignals);

  // Moon-in-sign signal
  const sign = moonPhase.sign || '';
  if (sign) signals.push(`moon_in_${sign.toLowerCase()}`);

  // Per-transit resolved signals (computed during enrichment)
  for (const t of transits) {
    if (Array.isArray(t.resolvedSignals)) signals.push(...t.resolvedSignals);
  }

  return [...new Set(signals)];
}

// ─── DATA MODE: SINGLE DAY PAYLOAD ───────────────────────────────────────────

/** Minimum finalScore for a transit to appear in an 'interesting_week' response. */
const INTERESTING_MIN_SCORE = 11;

/**
 * Maps a lookupType to the scoring intent used inside rankDayTransits.
 *
 * @param {string} lookupType
 * @returns {string|null}
 */
function lookupTypeToScoringIntent(lookupType) {
  if (lookupType === 'strongest')        return 'strongest_pick';
  if (lookupType === 'interesting_week') return 'interesting';
  return null;
}

/**
 * Builds a structured data payload for a single day.
 *
 * @param {object} day          - { date?, transits: [], moonPhase?: {} }
 * @param {string} lookupType   - 'specific_day'|'week'|'strongest'|'multiple'|'interesting_week'
 * @param {number} transitCount - Max number of topTransits to include
 * @returns {object}
 */
function buildDayPayload(day = {}, lookupType, transitCount) {
  const rawTransits = day.transits || [];
  const moonPhase   = day.moonPhase || {};
  const date        = day.date || new Date().toISOString().slice(0, 10);

  // 1. Enrich transits (adds sign / house / element context)
  const enriched = enrichTransits(rawTransits);

  // 2. Assign legacy strength label (used in formPresets and backward-compat fields)
  const withStrength = enriched.map((t) => {
    const s = t.score !== undefined ? t : legacyScoreTransit(t);
    return { ...s, strength: assignStrength(s) };
  });

  // 3. Build active signals from all enriched transits + moon phase
  const activeSignals = buildActiveSignals(moonPhase, withStrength);

  // 4. Rank using the new scoring system
  const scored = rankDayTransits(
    { ...day, transits: withStrength },
    {
      activeSignals,
      intent:      lookupTypeToScoringIntent(lookupType),
      userProfile: {},
    },
  );

  // 5. For 'interesting_week', apply minimum score filter (up to 2 per day)
  const topTransits = lookupType === 'interesting_week'
    ? scored.filter((t) => t.score >= INTERESTING_MIN_SCORE).slice(0, 2)
    : scored.slice(0, transitCount);

  return {
    mode: 'data',
    date,
    lookupType,
    moonPhase: {
      phaseName: moonPhase.phaseName || moonPhase.phase || '',
      sign:      moonPhase.sign      || '',
      degree:    moonPhase.degree    !== undefined ? moonPhase.degree : null,
    },
    topTransits: topTransits.map((t) => ({
      planet:         t.planet,
      aspect:         t.aspect,
      target:         t.target,
      strength:       t.strength,
      orb:            t.orb !== undefined ? t.orb : null,
      sign:           (t.context && t.context.planetSign) || t.sign   || null,
      degree:         (t.context && t.context.planetDegree) !== undefined
        ? t.context.planetDegree
        : (t.degree ?? null),
      applying:       t.context && t.context.isApplying !== undefined
        ? t.context.isApplying
        : (t.applying !== undefined ? t.applying : null),
      score:          t.score,
      scoreBreakdown: t.scoreBreakdown,
      scoreLabel:     t.scoreLabel,
    })),
    activeSignals,
    formPresets: topTransits.map(buildFormPreset),
  };
}

// ─── DATA MODE: MAIN BUILDER ─────────────────────────────────────────────────

/**
 * buildTransitDataResponse — resolves intent, picks transits and date, and
 * returns a clean structured JSON payload with NO narrative text.
 *
 * Pipeline:
 *   intent → dataset → select day → select transits →
 *   resolve signals → build JSON → return
 *
 * Transit count rules:
 *   specific_day     → 1–3 transits ordered by score
 *   strongest        → 1 transit  (top score)
 *   multiple         → top 3 transits
 *   week             → each day gets its own payload (up to 3 transits each)
 *   interesting_week → top 1–2 per day with score ≥ 11
 *
 * @param {Array}  days     - Array of day objects: { date?, transits: [], moonPhase?: {} }
 * @param {string} userText - The user's raw message (used for intent & date resolution)
 * @returns {object}        - Structured data payload (always JSON, never narrative)
 */
function buildTransitDataResponse(days = [], userText = '') {
  const safeDays   = Array.isArray(days) ? days : [days];
  const lookupType = detectLookupType(userText);

  // Update state
  astroConversationState.lastIntent = 'transit_data_request';

  // Week / interesting-week lookup: return one payload per day
  if (lookupType === 'week' || lookupType === 'interesting_week') {
    astroConversationState.lastDatasetType = lookupType;
    return {
      mode:       'data',
      lookupType,
      days:       safeDays.map((day) => buildDayPayload(day, lookupType, 3)),
    };
  }

  // Specific-day / strongest / multiple lookup
  const targetDate = resolveDate(userText, safeDays);
  const targetDay  = safeDays.find((d) => d.date === targetDate)
    || (safeDays.length > 0 ? safeDays[0] : null);

  // Guard: if no day data is available return a minimal valid payload
  if (!targetDay) {
    return {
      mode:          'data',
      date:          targetDate,
      lookupType,
      moonPhase:     { phaseName: '', sign: '', degree: null },
      topTransits:   [],
      activeSignals: [],
      formPresets:   [],
    };
  }

  const transitCount = lookupType === 'strongest' ? 1
    : lookupType === 'multiple' ? 3
    : 3; // specific_day default

  const payload = buildDayPayload(targetDay, lookupType, transitCount);

  // Persist for contextual back-references in next turn
  astroConversationState.lastReferencedDate = payload.date;
  astroConversationState.lastDatasetType    = lookupType;

  return payload;
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
 *     moonPhase:       object – (optional) { phaseName?, phase?, sign?, degree? }
 *     date:            string – (optional) ISO date of the day
 *     days:            Array  – (optional) multi-day array [{ date, transits, moonPhase }]
 *     summary:         string – (optional) day summary
 *   }
 *   Alternatively, pass a raw Array of transit objects directly.
 *
 * @param {object} conversationalContext - Active user conversation context:
 *   {
 *     userMessage:  string – the user's message (used for intent detection)
 *     message:      string – alias for userMessage
 *     history:      Array  – (optional) previous conversation turns
 *     responseMode: string – 'data' (default) | 'narrative'
 *   }
 *
 * @param {object} [neuralGraph] - (optional) Astrological neural graph
 *   { neurons, aspects, signs, activations }
 *   Passed through to the neural engine when present (narrative mode only).
 *
 * @returns {object}
 *   In 'data' mode    : structured JSON payload (buildTransitDataResponse output)
 *   In 'narrative' mode: { intent, narrative, synthesis, filteredTransits, sessionId, recordFeedback }
 */
function runConversationalMode(transitData = {}, conversationalContext = {}, neuralGraph = null) {
  const userMessage = conversationalContext.userMessage
    || conversationalContext.message
    || '';

  const responseMode = conversationalContext.responseMode || DEFAULT_RESPONSE_MODE;

  // ── DATA MODE (default) ───────────────────────────────────────────────────
  if (responseMode === 'data') {
    // Normalise transitData into the days array format expected by buildTransitDataResponse.
    let days;
    if (Array.isArray(transitData)) {
      days = [{ transits: transitData }];
    } else if (Array.isArray(transitData.days)) {
      days = transitData.days;
    } else {
      days = [{
        date:       transitData.date,
        transits:   transitData.transits || [],
        moonPhase:  transitData.moonPhase,
      }];
    }

    return buildTransitDataResponse(days, userMessage);
  }

  // ── NARRATIVE MODE (legacy) ───────────────────────────────────────────────
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
  const topTransits     = interpretation.topTransits || filteredTransits;
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
  buildTransitDataResponse,
  detectIntent,
  detectLookupType,
  resolveDate,
  prioritizeByStrength,
  filterByIntent,
  getSemanticMeaning,
  buildAstroContextSentence,
  buildSemanticParagraph,
  buildFormPreset,
  buildActiveSignals,
  buildDayPayload,
  buildSynthesis,
  astroConversationState,
  DEFAULT_RESPONSE_MODE,
  INTENT_PLANET_PRIORITY,
  INTERESTING_MIN_SCORE,
  STRENGTH_RANK,
};
