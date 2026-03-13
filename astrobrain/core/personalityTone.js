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
  next = next.replace(BANNED_TECHNICAL_ASTROLOGY, 'pattern');

  if (!/^I notice|^You may notice|^There can be/i.test(next)) {
    next = `You may notice ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
  }

  return cleanText(next);
}

function softenStatements(text = '') {
  let next = String(text || '');
  next = next.replace(/\bwill\b/gi, 'may');
  next = next.replace(/\bis\b/gi, 'can feel');
  return cleanText(next);
}

module.exports = {
  applyPersonalityTone,
  softenStatements,
};
