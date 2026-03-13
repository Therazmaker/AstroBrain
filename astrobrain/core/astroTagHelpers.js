const { signContext } = require('./zodiacContext');

const ALIASES_PLANETAS = {
  sol: 'sun',
  sun: 'sun',
  luna: 'moon',
  moon: 'moon',
  mercurio: 'mercury',
  mercury: 'mercury',
  venus: 'venus',
  marte: 'mars',
  mars: 'mars',
  jupiter: 'jupiter',
  júpiter: 'jupiter',
  saturno: 'saturn',
  saturn: 'saturn',
  urano: 'uranus',
  uranus: 'uranus',
  neptuno: 'neptune',
  neptune: 'neptune',
  pluton: 'pluto',
  plutón: 'pluto',
  pluto: 'pluto',
};

const ALIASES_ASPECTOS = {
  conjunction: 'conjunction',
  conjuncion: 'conjunction',
  conjunción: 'conjunction',
  opposition: 'opposition',
  oposicion: 'opposition',
  oposición: 'opposition',
  square: 'square',
  cuadratura: 'square',
  trine: 'trine',
  trigono: 'trine',
  trígono: 'trine',
  sextile: 'sextile',
  sextil: 'sextile',
};

function slug(valor = '') {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizarPlaneta(valor = '') {
  const base = slug(valor);
  return ALIASES_PLANETAS[base] || base || null;
}

function normalizarAspecto(valor = '') {
  const base = slug(valor);
  return ALIASES_ASPECTOS[base] || base || null;
}

function normalizarCasa(valor) {
  const casa = Number(valor);
  if (!Number.isFinite(casa) || casa < 1 || casa > 12) return null;
  return Math.floor(casa);
}

function normalizarGrado(valor) {
  const grado = Number(valor);
  if (!Number.isFinite(grado)) return null;
  if (grado < 0 || grado >= 30) return null;
  return Number(grado.toFixed(2));
}

function clasificarGrado(grado) {
  if (!Number.isFinite(grado)) return null;
  if (grado < 10) {
    return {
      tramo: '0_9',
      fase: 'temprano',
      zona: 'zona_inicial_del_signo',
    };
  }

  if (grado < 20) {
    return {
      tramo: '10_19',
      fase: 'medio',
      zona: 'zona_media_del_signo',
    };
  }

  return {
    tramo: '20_29',
    fase: 'tardio',
    zona: 'zona_final_del_signo',
  };
}

function clasificarOrbe(orbe) {
  const valor = Number(orbe);
  if (!Number.isFinite(valor)) return 'orbe_desconocido';
  if (valor <= 0.6) return 'orbe_muy_fuerte';
  if (valor <= 1.5) return 'orbe_fuerte';
  if (valor <= 3) return 'orbe_medio';
  return 'orbe_suave';
}

function contextoSigno(signo = '') {
  const info = signContext(signo);
  if (!info) return null;
  return {
    signo: slug(info.signo),
    elemento: slug(info.elemento),
    modalidad: slug(info.modalidad),
    regente: normalizarPlaneta(info.regente),
  };
}

module.exports = {
  slug,
  normalizarPlaneta,
  normalizarAspecto,
  normalizarCasa,
  normalizarGrado,
  clasificarGrado,
  clasificarOrbe,
  contextoSigno,
};
