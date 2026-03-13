const { scoreTransit } = require('./scoreTransits');

function getPriorityWeight(transit) {
  const planet = (transit.planet || '').toLowerCase();
  const aspect = (transit.aspect || '').toLowerCase();

  const isMercuryRetrograde =
    planet.includes('mercury') && (planet.includes('retrograde') || aspect.includes('retrograde'));

  if (['moon', 'mars', 'saturn'].includes(planet) || isMercuryRetrograde || planet.includes('eclipse')) {
    return 3;
  }

  if (['sun', 'venus', 'jupiter'].includes(planet)) {
    return 2;
  }

  return 1;
}

function filterTransits(transits = [], limit = 3) {
  return transits
    .map((transit) => {
      const scored = scoreTransit(transit);
      return {
        ...scored,
        priorityWeight: getPriorityWeight(transit),
      };
    })
    .sort((a, b) => {
      if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
      if (b.score !== a.score) return b.score - a.score;
      return (a.orb || 99) - (b.orb || 99);
    })
    .slice(0, limit);
}

module.exports = filterTransits;
