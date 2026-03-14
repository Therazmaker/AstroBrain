(function (global) {
  function translatePhase(phaseName) {
    const t = global.astroTranslations;
    if (!t || !phaseName) return '';
    return t.phases[phaseName] || phaseName;
  }

  function translateSign(sign) {
    const t = global.astroTranslations;
    if (!t || !sign) return '';
    return t.signs[sign] || sign;
  }

  function translatePlanet(planet) {
    const t = global.astroTranslations;
    if (!t || !planet) return '';
    return t.planets[planet] || planet;
  }

  function translateAspect(aspect) {
    const t = global.astroTranslations;
    if (!t || !aspect) return '';
    return t.aspects[(aspect || '').toLowerCase()] || aspect;
  }

  function translateTransitLabel(transit) {
    if (!transit) return '';
    if (typeof transit === 'string') {
      const parts = transit.trim().split(/\s+/);
      if (parts.length >= 3) {
        const planet = translatePlanet(parts[0]);
        const aspect = translateAspect(parts[1]);
        const target = translatePlanet(parts[2]);
        return `${planet} en ${aspect} con ${target}`;
      }
      return transit;
    }
    const planet = translatePlanet(transit.planet || '');
    const aspect = translateAspect(transit.aspect || '');
    const target = translatePlanet(transit.target || '');
    if (!planet && !aspect && !target) return '';
    return `${planet} en ${aspect} con ${target}`;
  }

  global.translatePhase = translatePhase;
  global.translateSign = translateSign;
  global.translatePlanet = translatePlanet;
  global.translateAspect = translateAspect;
  global.translateTransitLabel = translateTransitLabel;
})(window);
