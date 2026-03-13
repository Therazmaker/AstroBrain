function joinUnique(values) {
  return [...new Set(values.filter(Boolean))].join(', ');
}

function toneFromScore(score) {
  if (score > 9) return 'intense';
  if (score >= 6) return 'active';
  return 'soft';
}

function buildNarrative({ interpretedTransits, activatedNeurons, memoryPhrases }) {
  const topScore = interpretedTransits[0]?.score || 0;
  const tone = toneFromScore(topScore);

  const emotionStates = interpretedTransits.map((t) => t.emotion).filter(Boolean);
  const avoidItems = activatedNeurons.map((n) => n.output?.avoid).filter(Boolean);
  const focusItems = [
    ...activatedNeurons.map((n) => n.output?.focus),
    ...memoryPhrases,
  ].filter(Boolean);

  const useItems = interpretedTransits.map((t) => t.action).filter(Boolean);

  return {
    energy: `${tone}: ${joinUnique(emotionStates) || 'mixed emotional weather'}`,
    avoid: joinUnique(avoidItems) || 'pushing conversations before you feel settled',
    use: joinUnique(useItems) || 'clear priorities and simple actions',
    focus: joinUnique(focusItems) || 'pause, regulate, and answer with intention',
  };
}

module.exports = {
  buildNarrative,
  toneFromScore,
};
