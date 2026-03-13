const SIGNOS = {
  aries: { signo: 'Aries', elemento: 'fuego', modalidad: 'cardinal', regente: 'Marte' },
  tauro: { signo: 'Tauro', elemento: 'tierra', modalidad: 'fijo', regente: 'Venus' },
  geminis: { signo: 'Géminis', elemento: 'aire', modalidad: 'mutable', regente: 'Mercurio' },
  cancer: { signo: 'Cáncer', elemento: 'agua', modalidad: 'cardinal', regente: 'Luna' },
  leo: { signo: 'Leo', elemento: 'fuego', modalidad: 'fijo', regente: 'Sol' },
  virgo: { signo: 'Virgo', elemento: 'tierra', modalidad: 'mutable', regente: 'Mercurio' },
  libra: { signo: 'Libra', elemento: 'aire', modalidad: 'cardinal', regente: 'Venus' },
  escorpio: { signo: 'Escorpio', elemento: 'agua', modalidad: 'fijo', regente: 'Plutón' },
  sagitario: { signo: 'Sagitario', elemento: 'fuego', modalidad: 'mutable', regente: 'Júpiter' },
  capricornio: { signo: 'Capricornio', elemento: 'tierra', modalidad: 'cardinal', regente: 'Saturno' },
  acuario: { signo: 'Acuario', elemento: 'aire', modalidad: 'fijo', regente: 'Urano' },
  piscis: { signo: 'Piscis', elemento: 'agua', modalidad: 'mutable', regente: 'Neptuno' },
};

const ALIASES = {
  aries: 'aries',
  tauro: 'tauro',
  taurus: 'tauro',
  geminis: 'geminis',
  géminis: 'geminis',
  gemini: 'geminis',
  cancer: 'cancer',
  cáncer: 'cancer',
  leo: 'leo',
  virgo: 'virgo',
  libra: 'libra',
  escorpio: 'escorpio',
  scorpio: 'escorpio',
  sagitario: 'sagitario',
  sagittarius: 'sagitario',
  capricornio: 'capricornio',
  capricorn: 'capricornio',
  acuario: 'acuario',
  aquarius: 'acuario',
  piscis: 'piscis',
  pisces: 'piscis',
};

function normalizeSign(sign = '') {
  const raw = String(sign).trim().toLowerCase();
  return ALIASES[raw] || raw;
}

function signContext(sign = '') {
  const normalized = normalizeSign(sign);
  return SIGNOS[normalized] || null;
}

module.exports = {
  signContext,
  normalizeSign,
};

