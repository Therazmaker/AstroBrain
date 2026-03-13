const CONTRAST_PHRASES = [
  'but there is clarity too',
  'although solutions exist',
];

function hasStrongTension(narrativeParts = {}) {
  const tensionTerms = /frustration|reactivity|heaviness|pressure|intense|block|conflict/i;
  return Object.values(narrativeParts).some((value) => (
    typeof value === 'string' && tensionTerms.test(value)
  ));
}

function counterbalance(narrativeParts = {}) {
  if (!hasStrongTension(narrativeParts)) return narrativeParts;

  const phrase = CONTRAST_PHRASES[Object.keys(narrativeParts).length % CONTRAST_PHRASES.length];
  const next = { ...narrativeParts };

  if (typeof next.focus === 'string' && next.focus.trim()) {
    next.focus = `${next.focus}, ${phrase}`;
  } else {
    next.focus = phrase;
  }

  return next;
}

module.exports = {
  counterbalance,
};
