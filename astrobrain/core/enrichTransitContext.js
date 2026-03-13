const { signContext } = require('./zodiacContext');
const {
  normalizarPlaneta,
  normalizarAspecto,
  normalizarCasa,
  normalizarGrado,
  clasificarOrbe,
} = require('./astroTagHelpers');
const { buildTransitTags } = require('./buildTransitTags');
const { resolveTransitSignals } = require('./resolveTransitSignals');

function findValue(options = []) {
  return options.find((option) => option !== undefined && option !== null && option !== '');
}

function orbStrengthLabel(orb) {
  const tag = clasificarOrbe(orb);
  return tag.replace('orbe_', '');
}

function nombrePlanetaCanonico(id) {
  if (!id) return 'Desconocido';
  const map = {
    sun: 'Sun',
    moon: 'Moon',
    mercury: 'Mercury',
    venus: 'Venus',
    mars: 'Mars',
    jupiter: 'Jupiter',
    saturn: 'Saturn',
    uranus: 'Uranus',
    neptune: 'Neptune',
    pluto: 'Pluto',
  };
  return map[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

function normalizeTransit(transit = {}) {
  const planetId = normalizarPlaneta(transit.planet || transit.planeta || transit.source);
  const targetId = normalizarPlaneta(transit.target || transit.objetivo || transit.object);
  const aspectId = normalizarAspecto(transit.aspect || transit.aspecto);

  return {
    planet: nombrePlanetaCanonico(planetId),
    aspect: aspectId || 'desconocido',
    target: nombrePlanetaCanonico(targetId),
    orb: Number.isFinite(Number(transit.orb)) ? Number(transit.orb) : null,
    raw: transit,
  };
}

function resolveSignHouseDegree(raw = {}, context = {}, key) {
  const sign = findValue([
    context[`${key}Sign`],
    context[`${key}Signo`],
    raw[`${key}Sign`],
    raw[`${key}Signo`],
  ]);

  const house = findValue([
    context[`${key}House`],
    context[`${key}Casa`],
    raw[`${key}House`],
    raw[`${key}Casa`],
  ]);

  const degree = findValue([
    context[`${key}Degree`],
    context[`${key}Grado`],
    raw[`${key}Degree`],
    raw[`${key}Grado`],
  ]);

  return {
    sign: sign || null,
    house: normalizarCasa(house),
    degree: normalizarGrado(degree),
  };
}

function enrichTransitContext(transit = {}) {
  const normalized = normalizeTransit(transit);
  const incomingContext = transit.context || {};

  const planetInfo = resolveSignHouseDegree(transit, incomingContext, 'planet');
  const targetInfo = resolveSignHouseDegree(transit, incomingContext, 'target');

  const targetZodiac = signContext(targetInfo.sign || incomingContext.targetSign || transit.targetSign || '');
  const planetZodiac = signContext(planetInfo.sign || incomingContext.planetSign || transit.planetSign || '');

  const context = {
    planetSign: planetZodiac?.signo || planetInfo.sign || null,
    planetHouse: planetInfo.house,
    planetDegree: planetInfo.degree,
    targetSign: targetZodiac?.signo || targetInfo.sign || null,
    targetHouse: targetInfo.house,
    targetDegree: targetInfo.degree,
    targetElement: incomingContext.targetElement || targetZodiac?.elemento || null,
    targetModality: incomingContext.targetModality || targetZodiac?.modalidad || null,
    targetRuler: incomingContext.targetRuler || targetZodiac?.regente || null,
    planetElement: incomingContext.planetElement || planetZodiac?.elemento || null,
    planetModality: incomingContext.planetModality || planetZodiac?.modalidad || null,
    planetRuler: incomingContext.planetRuler || planetZodiac?.regente || null,
    isApplying: typeof incomingContext.isApplying === 'boolean'
      ? incomingContext.isApplying
      : (typeof transit.isApplying === 'boolean' ? transit.isApplying : null),
    strengthLabel: incomingContext.strengthLabel || orbStrengthLabel(normalized.orb),
  };

  const enrichedTransit = {
    ...transit,
    ...normalized,
    context,
  };

  const derivedTags = buildTransitTags(enrichedTransit);
  const resolvedSignals = resolveTransitSignals(enrichedTransit, derivedTags);
  console.debug('[AstroBrain] Tránsito enriquecido:', {
    planeta: enrichedTransit.planet,
    aspecto: enrichedTransit.aspect,
    objetivo: enrichedTransit.target,
    contexto: enrichedTransit.context,
  });
  console.debug('[AstroBrain] Tags generados:', derivedTags);

  return {
    ...enrichedTransit,
    derivedTags,
    resolvedSignals,
  };
}

function enrichTransits(transits = []) {
  return transits.map((transit) => enrichTransitContext(transit));
}

module.exports = {
  enrichTransitContext,
  enrichTransits,
  orbStrengthLabel,
};
