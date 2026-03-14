// ─────────────────────────────────────────────────────────────
// AstroQA — Smart astrological Q&A engine (Spanish)
// Answers specific questions from transit datasets:
//   · Next moon phase (date + sign)
//   · Transits for a specific date
//   · Weekly summary
//   · Planet positions
//   · Strongest upcoming transits
//   · Eclipses / retrogrades
// ─────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // ── Translation maps ──────────────────────────────────────────────────────

  const MOON_PHASE_ES = {
    'New Moon': 'Luna Nueva',
    'Full Moon': 'Luna Llena',
    'First Quarter': 'Cuarto Creciente',
    'Last Quarter': 'Cuarto Menguante',
    'Waxing Crescent': 'Luna Creciente',
    'Waning Crescent': 'Luna Balsámica',
    'Waxing Gibbous': 'Luna Gibosa Creciente',
    'Waning Gibbous': 'Luna Gibosa Menguante',
  };

  const SIGN_ES = {
    Aries: 'Aries', Taurus: 'Tauro', Gemini: 'Géminis',
    Cancer: 'Cáncer', Leo: 'Leo', Virgo: 'Virgo',
    Libra: 'Libra', Scorpio: 'Escorpio', Sagittarius: 'Sagitario',
    Capricorn: 'Capricornio', Aquarius: 'Acuario', Pisces: 'Piscis',
  };

  const PLANET_ES = {
    Sun: 'Sol', Moon: 'Luna', Mercury: 'Mercurio',
    Venus: 'Venus', Mars: 'Marte', Jupiter: 'Júpiter',
    Saturn: 'Saturno', Uranus: 'Urano', Neptune: 'Neptuno',
    Pluto: 'Plutón', Chiron: 'Quirón', NorthNode: 'Nodo Norte',
    SouthNode: 'Nodo Sur', Ascendant: 'Ascendente', Midheaven: 'Medio Cielo',
  };

  const SPANISH_MONTHS = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function formatDateES(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    if (isNaN(d.getTime())) return dateStr;
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }

  function phaseES(phase) {
    return MOON_PHASE_ES[phase] || phase || '';
  }

  function signES(sign) {
    return SIGN_ES[sign] || sign || '';
  }

  function normStr(s) {
    // Lowercase + strip diacritics
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function strengthLabel(s) {
    return { very_strong: 'muy fuerte', strong: 'fuerte', medium: 'moderado', soft: 'suave' }[s] || s || '';
  }

  function formatTransit(t) {
    const planet = PLANET_ES[t.planet] || t.planet || '';
    const target = PLANET_ES[t.target] || t.target || '';
    const aspect = t.aspect || '';
    const str = strengthLabel(t.strength);
    return `${planet} ${aspect} ${target}${str ? ` (${str})` : ''}`.trim();
  }

  function getTopTransits(day, count) {
    const rank = { very_strong: 4, strong: 3, medium: 2, soft: 1 };
    return (day.transits || [])
      .slice()
      .sort((a, b) => (rank[b.strength] || 0) - (rank[a.strength] || 0))
      .slice(0, count || 5);
  }

  // ── Intent detectors ──────────────────────────────────────────────────────

  function detectMoonPhaseTarget(lower) {
    if (/luna\s*nueva|new\s*moon/.test(lower)) return 'New Moon';
    if (/luna\s*llena|full\s*moon/.test(lower)) return 'Full Moon';
    if (/cuarto\s*creciente|first\s*quarter/.test(lower)) return 'First Quarter';
    if (/cuarto\s*menguante|last\s*quarter/.test(lower)) return 'Last Quarter';
    return null;
  }

  function detectPlanet(lower) {
    const map = {
      mercurio: 'Mercury', mercury: 'Mercury',
      venus: 'Venus',
      marte: 'Mars', mars: 'Mars',
      jupiter: 'Jupiter',
      saturno: 'Saturn', saturn: 'Saturn',
      urano: 'Uranus', uranus: 'Uranus',
      neptuno: 'Neptune', neptune: 'Neptune',
      pluton: 'Pluto', pluto: 'Pluto',
      sol: 'Sun', sun: 'Sun',
      luna: 'Moon', moon: 'Moon',
      quiron: 'Chiron', chiron: 'Chiron',
    };
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key)) return val;
    }
    return null;
  }

  function parseDateFromText(lower, days) {
    const today = todayISO();
    const now = new Date(today + 'T12:00:00Z');

    if (/\bhoy\b|today/.test(lower)) return today;

    if (/manana|tomorrow/.test(lower)) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().split('T')[0];
    }

    if (/pasado\s*manana/.test(lower)) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + 2);
      return d.toISOString().split('T')[0];
    }

    // "el 15 de marzo de 2026" or "el 15 de marzo"
    const monthRe = new RegExp(
      '(?:el\\s+)?(\\d{1,2})\\s+de\\s+(' + Object.keys(SPANISH_MONTHS).join('|') + ')(?:\\s+de\\s+(\\d{4}))?'
    );
    const monthMatch = lower.match(monthRe);
    if (monthMatch) {
      const day = parseInt(monthMatch[1], 10);
      const month = SPANISH_MONTHS[monthMatch[2]];
      const year = monthMatch[3] ? parseInt(monthMatch[3], 10) : now.getUTCFullYear();
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // "el día 15" — look up in loaded days
    const dayNumMatch = lower.match(/(?:el\s+(?:dia\s+)?|dia\s+)(\d{1,2})/);
    if (dayNumMatch && Array.isArray(days)) {
      const num = parseInt(dayNumMatch[1], 10);
      const found = days.find((d) => new Date(d.date + 'T12:00:00Z').getUTCDate() === num && d.date >= today);
      if (found) return found.date;
    }

    return null;
  }

  // ── Dataset lookups ───────────────────────────────────────────────────────

  function findNextMoonPhase(phaseName, days) {
    const today = todayISO();
    const target = normStr(phaseName);
    return days.find((d) => {
      if (d.date < today) return false;
      const p = normStr(d.moonPhase?.phaseName || d.moonPhase?.phase || '');
      return p === target;
    }) || null;
  }

  function findDayByDate(days, dateStr) {
    return days.find((d) => d.date === dateStr) || null;
  }

  // ── Answer builders ───────────────────────────────────────────────────────

  function answerNextMoonPhase(phaseName, days) {
    const day = findNextMoonPhase(phaseName, days);
    if (!day) {
      return `No encontré la próxima ${phaseES(phaseName)} en el dataset cargado. Intenta importar un dataset con mayor rango de fechas.`;
    }
    const moon = day.moonPhase || {};
    const phase = phaseES(moon.phaseName || moon.phase || phaseName);
    const sign = signES(moon.sign || '');
    const degree = moon.degree ? ` a ${moon.degree}°` : '';
    const dateStr = formatDateES(day.date);
    const top = getTopTransits(day, 3);

    let r = `La próxima <strong>${phase}</strong> es el <strong>${dateStr}</strong>`
      + (sign ? ` en <strong>${sign}${degree}</strong>` : '') + '.';

    if (top.length) {
      r += `<br>Tránsitos activos ese día: ${top.map(formatTransit).join(', ')}.`;
    }
    return r;
  }

  function answerDateTransits(dateStr, days) {
    const day = findDayByDate(days, dateStr);
    if (!day) {
      return `No encontré datos para el <strong>${formatDateES(dateStr)}</strong> en el dataset. Puede que esa fecha esté fuera del rango cargado.`;
    }
    const moon = day.moonPhase || {};
    const sign = signES(moon.sign || '');
    const phase = phaseES(moon.phaseName || moon.phase || '');
    const top = getTopTransits(day, 5);
    const dateLabel = formatDateES(day.date);

    let r = `<strong>${dateLabel}</strong>: Luna en <strong>${sign}</strong>${phase ? ` · ${phase}` : ''}.`;
    if (top.length) {
      r += `<br>Tránsitos: ${top.map(formatTransit).join(', ')}.`;
    } else {
      r += ' No hay tránsitos destacados ese día.';
    }
    return r;
  }

  function answerToday(days) {
    const today = todayISO();
    const day = findDayByDate(days, today)
      || days.find((d) => d.date >= today)
      || days[0];
    if (!day) return 'No hay datos disponibles en el dataset.';
    return answerDateTransits(day.date, days);
  }

  function answerWeeklySummary(days) {
    const today = todayISO();
    const week = days.filter((d) => d.date >= today).slice(0, 7);
    if (!week.length) return 'No hay datos para esta semana en el dataset cargado.';

    let r = '<strong>Resumen semanal:</strong><br>';
    week.forEach((day) => {
      const moon = day.moonPhase || {};
      const sign = signES(moon.sign || '');
      const phase = phaseES(moon.phaseName || moon.phase || '');
      const top = getTopTransits(day, 1)[0];
      r += `· <strong>${formatDateES(day.date)}</strong>: Luna en ${sign}`;
      if (phase) r += ` (${phase})`;
      if (top) r += ` — ${formatTransit(top)}`;
      r += '<br>';
    });
    return r;
  }

  function answerStrongest(days) {
    const today = todayISO();
    const upcoming = days.filter((d) => d.date >= today).slice(0, 60);
    const all = upcoming.flatMap((d) =>
      (d.transits || []).map((t) => ({ ...t, date: d.date }))
    );
    const strong = all
      .filter((t) => t.strength === 'very_strong' || t.strength === 'strong')
      .sort((a, b) => {
        const rank = { very_strong: 2, strong: 1 };
        return (rank[b.strength] || 0) - (rank[a.strength] || 0);
      })
      .slice(0, 5);

    if (!strong.length) return 'No se encontraron tránsitos fuertes en el período disponible.';
    const list = strong.map((t) => `${formatTransit(t)} — ${formatDateES(t.date)}`).join('<br>· ');
    return `Tránsitos más fuertes próximos:<br>· ${list}.`;
  }

  function answerPlanetPosition(planetKey, days) {
    const today = todayISO();
    const day = findDayByDate(days, today)
      || days.find((d) => d.date >= today)
      || days[0];
    if (!day) return 'No hay datos disponibles.';

    const bodies = day.bodies || {};
    const body = bodies[planetKey];
    const nameES = PLANET_ES[planetKey] || planetKey;

    if (body) {
      const sign = signES(body.sign || '');
      const degree = body.degree !== undefined ? ` a ${Math.round(body.degree)}°` : '';
      const retro = body.retrograde ? ' (retrógrado ℞)' : '';
      return `<strong>${nameES}</strong> está actualmente en <strong>${sign}${degree}${retro}</strong>.`;
    }

    // Fallback: check transits
    const transits = (day.transits || []).filter((t) => t.planet === planetKey || t.target === planetKey);
    if (transits.length) {
      return `Hoy <strong>${nameES}</strong> está activo en: ${transits.map(formatTransit).join(', ')}.`;
    }

    return `No encontré datos de posición para <strong>${nameES}</strong> en el dataset actual.`;
  }

  function answerMoonSign(days) {
    const today = todayISO();
    const day = findDayByDate(days, today)
      || days.find((d) => d.date >= today)
      || days[0];
    if (!day) return 'No hay datos disponibles.';
    const sign = signES(day.moonPhase?.sign || '');
    const phase = phaseES(day.moonPhase?.phaseName || day.moonPhase?.phase || '');
    return `Hoy, <strong>${formatDateES(day.date)}</strong>, la Luna está en <strong>${sign}</strong>${phase ? ` · ${phase}` : ''}.`;
  }

  function answerMercuryRetrograde(days) {
    const today = todayISO();
    const day = days.find((d) => {
      if (d.date < today) return false;
      if (d.bodies?.Mercury?.retrograde) return true;
      return (d.transits || []).some(
        (t) => (t.planet === 'Mercury' || t.target === 'Mercury')
          && (t.retrograde || normStr(t.aspect || '').includes('retro'))
      );
    });
    if (day) {
      return `Próximo Mercurio retrógrado detectado alrededor del <strong>${formatDateES(day.date)}</strong>.`;
    }
    return 'No encontré Mercurio retrógrado en el dataset actual. Puede que necesites un rango de fechas más amplio.';
  }

  function answerEclipse(days) {
    const today = todayISO();
    const day = days.find((d) => {
      if (d.date < today) return false;
      const p = normStr(d.moonPhase?.phaseName || d.moonPhase?.phase || '');
      if (p.includes('eclipse')) return true;
      return (d.transits || []).some((t) => normStr(t.aspect || '').includes('eclipse'));
    });
    if (day) {
      const sign = signES(day.moonPhase?.sign || '');
      return `Próximo eclipse detectado el <strong>${formatDateES(day.date)}</strong>${sign ? ` en <strong>${sign}</strong>` : ''}.`;
    }
    return 'No encontré eclipses en el dataset cargado. Puede que necesites un rango de fechas más amplio.';
  }

  function answerDatasetInfo(days) {
    const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date;
    const last = sorted[sorted.length - 1]?.date;
    return `Tengo cargados <strong>${days.length} días</strong> de datos, desde el <strong>${formatDateES(first)}</strong> hasta el <strong>${formatDateES(last)}</strong>.`;
  }

  // ── Main answer function ──────────────────────────────────────────────────

  /**
   * answer(userText, dataset)
   *
   * Returns an HTML string answering the question, or null if the question
   * doesn't match any known intent (caller can fall through to another engine).
   *
   * @param {string} userText  - Raw text from user
   * @param {object} dataset   - Transit dataset { days: [...] }
   * @returns {string|null}
   */
  function answer(userText, dataset) {
    if (!dataset || !Array.isArray(dataset.days) || !dataset.days.length) {
      return 'No hay datos de tránsitos cargados. Importa un dataset en la sección <strong>Transit Vault</strong> para poder responder preguntas sobre fechas, fases lunares y tránsitos específicos.';
    }

    const lower = normStr(userText);
    const days = dataset.days;

    // ── Next moon phase ────────────────────────────────────────────────────
    const moonTarget = detectMoonPhaseTarget(lower);
    if (moonTarget) return answerNextMoonPhase(moonTarget, days);

    // ── Moon sign today ────────────────────────────────────────────────────
    if (/en que signo (esta|hay) (la )?luna|signo (de la|lunar|de luna)|en que signo esta la luna/.test(lower)) {
      return answerMoonSign(days);
    }

    // ── Specific date query ────────────────────────────────────────────────
    const parsedDate = parseDateFromText(lower, days);
    if (parsedDate) return answerDateTransits(parsedDate, days);

    // ── Today ──────────────────────────────────────────────────────────────
    if (/\bhoy\b|\bahora\b|este momento|today/.test(lower)) return answerToday(days);

    // ── Weekly summary ─────────────────────────────────────────────────────
    if (/esta semana|proxima semana|semana que viene|resumen semanal|\bsemana\b/.test(lower)) {
      return answerWeeklySummary(days);
    }

    // ── Strongest transits ─────────────────────────────────────────────────
    if (/mas fuerte|mas importante|mejor transito|principal|destacado|dominante/.test(lower)) {
      return answerStrongest(days);
    }

    // ── Mercury retrograde ─────────────────────────────────────────────────
    if (/mercurio retro|mercurio en retro|mercury retro/.test(lower)) {
      return answerMercuryRetrograde(days);
    }

    // ── Eclipse ────────────────────────────────────────────────────────────
    if (/eclipse/.test(lower)) return answerEclipse(days);

    // ── Dataset info ───────────────────────────────────────────────────────
    if (/que datos tienes|cuantos dias|rango de fechas|fechas disponibles|que tienes cargado/.test(lower)) {
      return answerDatasetInfo(days);
    }

    // ── Planet position ────────────────────────────────────────────────────
    if (/donde esta|en que signo esta|posicion|esta (el|la) |esta actualmente/.test(lower)) {
      const planet = detectPlanet(lower);
      if (planet) return answerPlanetPosition(planet, days);
    }

    // No specific intent matched — return null so the caller can fall through
    return null;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  global.AstroQA = {
    answer,
    // Expose helpers for external use / testing
    formatDateES,
    phaseES,
    signES,
    normStr,
    detectMoonPhaseTarget,
    detectPlanet,
    parseDateFromText,
    findNextMoonPhase,
    getTopTransits,
    formatTransit,
  };
}(window));
