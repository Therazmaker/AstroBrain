const { signContext } = require('./zodiacContext');

function slug(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function orbStrengthLabel(orb) {
  const value = Number(orb);
  if (!Number.isFinite(value)) return 'desconocido';
  if (value <= 1) return 'fuerte';
  if (value <= 3) return 'medio';
  return 'suave';
}

function findValue(options = []) {
  return options.find((option) => option !== undefined && option !== null && option !== '');
}

function normalizeTransit(transit = {}) {
  return {
    planet: transit.planet || transit.planeta || transit.source || 'Desconocido',
    aspect: transit.aspect || transit.aspecto || 'desconocido',
    target: transit.target || transit.objetivo || transit.object || 'Desconocido',
    orb: Number.isFinite(Number(transit.orb)) ? Number(transit.orb) : null,
    raw: transit,
  };
}

function resolveSignHouse(raw = {}, context = {}, key) {
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

  return {
    sign: sign || null,
    house: Number.isFinite(Number(house)) ? Number(house) : null,
  };
}

function buildDerivedTags({ planet, aspect, target, context }) {
  const planetSlug = slug(planet);
  const targetSlug = slug(target);
  const aspectSlug = slug(aspect);
  const tags = new Set();

  if (planetSlug && targetSlug && aspectSlug) {
    tags.add(`${planetSlug}_${aspectSlug}_${targetSlug}`);
  }

  const targetSignSlug = slug(context.targetSign || '');
  const targetElementSlug = slug(context.targetElement || '');
  const targetModalitySlug = slug(context.targetModality || '');
  const targetRulerSlug = slug(context.targetRuler || '');
  const orbSlug = slug(context.strengthLabel || '');

  if (targetSignSlug) tags.add(`${targetSlug}_en_${targetSignSlug}`);
  if (targetElementSlug) tags.add(`${targetSlug}_${targetElementSlug}`);
  if (targetModalitySlug) tags.add(`${targetSlug}_${targetModalitySlug}`);
  if (targetRulerSlug) tags.add(`${targetSlug}_regida_por_${targetRulerSlug}`);
  if (orbSlug) tags.add(`orb_${orbSlug}`);

  if (planetSlug === 'moon' && targetSlug === 'venus' && aspectSlug === 'square') {
    if (targetElementSlug === 'fuego') {
      tags.add('tono_afectivo_impulsivo');
      tags.add('reaccion_emocional_rapida');
      tags.add('tension_relacional_activa');
    }

    if (targetElementSlug === 'agua') {
      tags.add('sensibilidad_vincular_profunda');
      tags.add('necesidad_de_contencion_afectiva');
    }
  }

  if (context.isApplying === true) tags.add('fase_aplicando');
  if (context.isApplying === false) tags.add('fase_separando');

  return [...tags];
}

function enrichTransitContext(transit = {}) {
  const normalized = normalizeTransit(transit);
  const incomingContext = transit.context || {};

  const planetInfo = resolveSignHouse(transit, incomingContext, 'planet');
  const targetInfo = resolveSignHouse(transit, incomingContext, 'target');

  const targetZodiac = signContext(targetInfo.sign || incomingContext.targetSign || transit.targetSign || '');
  const planetZodiac = signContext(planetInfo.sign || incomingContext.planetSign || transit.planetSign || '');

  const context = {
    planetSign: planetZodiac?.signo || planetInfo.sign || null,
    planetHouse: planetInfo.house,
    targetSign: targetZodiac?.signo || targetInfo.sign || null,
    targetHouse: targetInfo.house,
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

  return {
    ...transit,
    ...normalized,
    context,
    derivedTags: buildDerivedTags({
      planet: normalized.planet,
      aspect: normalized.aspect,
      target: normalized.target,
      context,
    }),
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
