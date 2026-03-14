(function (global) {
  const MONTHS_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  function formatDateSpanish(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) return dateStr;
    return `${d.getUTCDate()} de ${MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }

  function phaseNarrative(phaseName, sign) {
    const phaseEs = global.translatePhase ? global.translatePhase(phaseName) : (phaseName || '');
    const signEs = global.translateSign ? global.translateSign(sign) : (sign || '');
    const signSuffix = signEs ? ` en ${signEs}` : '';

    const templates = {
      'New Moon': `La ${phaseEs}${signSuffix} invita a sembrar intenciones, iniciar ciclos y proyectar con claridad.`,
      'First Quarter': `El ${phaseEs}${signSuffix} activa la decisión y el impulso. Es momento de actuar y ajustar el rumbo.`,
      'Full Moon': `La ${phaseEs}${signSuffix} trae culminación, intensidad y revelación. Lo que estaba en proceso llega a su punto visible.`,
      'Last Quarter': `El ${phaseEs}${signSuffix} favorece revisión, depuración y cierre con más enfoque y seriedad.`,
      'Waxing Crescent': `La ${phaseEs}${signSuffix} impulsa un crecimiento inicial. Buen momento para ensayar y abrirse a nuevas posibilidades.`,
      'Waxing Gibbous': `La ${phaseEs}${signSuffix} marca un tiempo de maduración y refinamiento antes del punto álgido.`,
      'Waning Gibbous': `La ${phaseEs}${signSuffix} propicia integración, gratitud y compartir lo aprendido.`,
      'Waning Crescent': `La ${phaseEs}${signSuffix} pide descanso, introspección y recogimiento interior.`,
    };

    if (templates[phaseName]) return templates[phaseName];
    return phaseEs ? `${phaseEs}${signSuffix} marca el tono emocional del día.` : 'El clima lunar del día invita a la observación.';
  }

  function renderDayNarrative(day) {
    if (!day) return '';
    const moon = day.moonPhase || {};
    const phaseName = moon.phaseName || moon.phase || '';
    const sign = moon.sign || '';
    const dateLabel = formatDateSpanish(day.date);
    const phaseText = phaseNarrative(phaseName, sign);
    const topTransits = (day.transits || []).slice(0, 3);

    let transitText = '';
    if (topTransits.length && global.translateTransitLabel) {
      const labels = topTransits.map((t) => global.translateTransitLabel(t)).filter(Boolean);
      if (labels.length === 1) {
        transitText = ` Entre los movimientos más activos aparece ${labels[0]}.`;
      } else if (labels.length > 1) {
        const last = labels[labels.length - 1];
        const rest = labels.slice(0, -1);
        transitText = ` Entre los movimientos más activos aparecen ${rest.join(', ')} y ${last}.`;
      }
    }

    return `${dateLabel}. ${phaseText}${transitText}`;
  }

  function renderSpanishNarrative(days) {
    if (!Array.isArray(days) || !days.length) {
      return 'No hay datos disponibles para el período solicitado.';
    }
    return days.map(renderDayNarrative).filter(Boolean).join('\n\n');
  }

  global.renderDayNarrative = renderDayNarrative;
  global.renderSpanishNarrative = renderSpanishNarrative;
})(window);
