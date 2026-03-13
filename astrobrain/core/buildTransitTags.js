const {
  slug,
  normalizarPlaneta,
  normalizarAspecto,
  normalizarCasa,
  normalizarGrado,
  clasificarGrado,
  clasificarOrbe,
  contextoSigno,
} = require('./astroTagHelpers');

function agregarSiExiste(setTags, valor) {
  if (valor) setTags.add(valor);
}

function tagsPorSignoYCasa(tags, prefijo, entidad = {}) {
  agregarSiExiste(tags, entidad.signo ? `${prefijo}_en_${entidad.signo}` : null);
  agregarSiExiste(tags, entidad.casa ? `${prefijo}_casa_${entidad.casa}` : null);
  agregarSiExiste(tags, entidad.elemento ? `${prefijo}_${entidad.elemento}` : null);
  agregarSiExiste(tags, entidad.modalidad ? `${prefijo}_${entidad.modalidad}` : null);
  agregarSiExiste(tags, entidad.regente ? `${prefijo}_regida_por_${entidad.regente}` : null);
}

function tagsPorGrado(tags, prefijo, grado) {
  const clasificacion = clasificarGrado(grado);
  if (!clasificacion) return;

  tags.add(`${prefijo}_grado_${clasificacion.tramo}`);
  tags.add(`${prefijo}_grado_${clasificacion.fase}`);
  tags.add(clasificacion.zona);
}

function construirCombinaciones(tags = new Set(), base = {}) {
  const combinaciones = new Set();
  const aspectoBase = base.aspectoBase;

  const piezas = [
    base.planetaSigno && `${base.planeta}_en_${base.planetaSigno}`,
    base.targetSigno && `${base.target}_en_${base.targetSigno}`,
    base.planetaCasa && `${base.planeta}_casa_${base.planetaCasa}`,
    base.targetCasa && `${base.target}_casa_${base.targetCasa}`,
    base.orbeTag,
    base.planetaGradoFase && `${base.planeta}_grado_${base.planetaGradoFase}`,
    base.targetGradoFase && `${base.target}_grado_${base.targetGradoFase}`,
  ].filter(Boolean);

  if (aspectoBase) {
    piezas.slice(0, 4).forEach((pieza) => combinaciones.add(`${aspectoBase}__${pieza}`));
    if (base.orbeTag) combinaciones.add(`${aspectoBase}__${base.orbeTag}`);
  }

  if (base.targetSigno && base.targetGradoFase) {
    combinaciones.add(`${base.target}_en_${base.targetSigno}__${base.target}_grado_${base.targetGradoFase}`);
  }

  if (base.planetaSigno && base.planetaGradoFase) {
    combinaciones.add(`${base.planeta}_en_${base.planetaSigno}__${base.planeta}_grado_${base.planetaGradoFase}`);
  }

  [...combinaciones].forEach((tag) => tags.add(tag));
}

function buildTransitTags(transit = {}) {
  const tags = new Set();
  const context = transit.context || {};

  const planeta = normalizarPlaneta(transit.planet || transit.planeta || transit.source || context.planet);
  const target = normalizarPlaneta(transit.target || transit.objetivo || transit.object || context.target);
  const aspecto = normalizarAspecto(transit.aspect || transit.aspecto || context.aspect);

  const planetaSignoInfo = contextoSigno(context.planetSign || transit.planetSign || transit.planetSigno);
  const targetSignoInfo = contextoSigno(context.targetSign || transit.targetSign || transit.targetSigno);

  const planetaData = {
    signo: planetaSignoInfo?.signo || slug(context.planetSign || transit.planetSign || ''),
    casa: normalizarCasa(context.planetHouse ?? transit.planetHouse ?? context.planetCasa ?? transit.planetCasa),
    elemento: slug(context.planetElement || planetaSignoInfo?.elemento || ''),
    modalidad: slug(context.planetModality || planetaSignoInfo?.modalidad || ''),
    regente: normalizarPlaneta(context.planetRuler || planetaSignoInfo?.regente),
    grado: normalizarGrado(context.planetDegree ?? transit.planetDegree ?? context.planetGrado ?? transit.planetGrado),
  };

  const targetData = {
    signo: targetSignoInfo?.signo || slug(context.targetSign || transit.targetSign || ''),
    casa: normalizarCasa(context.targetHouse ?? transit.targetHouse ?? context.targetCasa ?? transit.targetCasa),
    elemento: slug(context.targetElement || targetSignoInfo?.elemento || ''),
    modalidad: slug(context.targetModality || targetSignoInfo?.modalidad || ''),
    regente: normalizarPlaneta(context.targetRuler || targetSignoInfo?.regente),
    grado: normalizarGrado(context.targetDegree ?? transit.targetDegree ?? context.targetGrado ?? transit.targetGrado),
  };

  const aspectoBase = planeta && target && aspecto ? `${planeta}_${aspecto}_${target}` : null;
  agregarSiExiste(tags, aspectoBase);

  if (targetData.grado !== null) tags.add(`target_grado_${clasificarGrado(targetData.grado)?.fase}`);

  if (planeta) {
    tagsPorSignoYCasa(tags, planeta, planetaData);
    tagsPorGrado(tags, planeta, planetaData.grado);
  }

  if (target) {
    tagsPorSignoYCasa(tags, target, targetData);
    tagsPorGrado(tags, target, targetData.grado);
  }

  const orbeTag = clasificarOrbe(transit.orb ?? transit.orbe ?? context.orb ?? context.orbe);
  tags.add(orbeTag);

  const isApplying = context.isApplying ?? transit.isApplying;
  if (isApplying === true) tags.add('aspecto_aplicativo');
  if (isApplying === false) tags.add('aspecto_separativo');
  if ((transit.orb ?? context.orb) !== null && Number(transit.orb ?? context.orb) <= 0.6) {
    tags.add('aspecto_casi_exacto');
  }

  construirCombinaciones(tags, {
    aspectoBase,
    planeta,
    target,
    planetaSigno: planetaData.signo,
    targetSigno: targetData.signo,
    planetaCasa: planetaData.casa,
    targetCasa: targetData.casa,
    planetaGradoFase: clasificarGrado(planetaData.grado)?.fase,
    targetGradoFase: clasificarGrado(targetData.grado)?.fase,
    orbeTag,
  });

  return [...tags].filter(Boolean);
}

module.exports = {
  buildTransitTags,
};
