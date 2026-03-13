const BANNED_TECHNICAL_ASTROLOGY = /\b(transit|orb|conjunction|sextile|trine|square|opposition)\b/gi;

function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s([,.;!?])/g, '$1')
    .trim();
}

function applyPersonalityTone(text = '') {
  let next = String(text || '');

  next = next.replace(/!/g, '.');
  next = next.replace(/\b(always|never|disaster|catastrophe|extreme)\b/gi, 'often');

  return cleanText(next);
}

function softenStatements(text = '') {
  let next = String(text || '');
  next = next.replace(/\bwill\b/gi, 'may');
  return cleanText(next);
}

module.exports = {
  applyPersonalityTone,
  softenStatements,
};
