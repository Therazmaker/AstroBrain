const { scoreTransit, strengthLabel } = require('./scoreTransits');

const STRENGTH_RANK = { very_strong: 4, strong: 3, moon_phase: 2, medium: 1, soft: 0 };

function isMoonPhaseTransit(transit) {
  const type = (transit.type || transit.event || '').toLowerCase();
  return /luna_(nueva|llena)|new_moon|full_moon|eclipse/.test(type);
}

function assignStrength(transit) {
  if (transit.strength) return transit.strength;
  if (isMoonPhaseTransit(transit)) return 'moon_phase';
  const scored = transit.score !== undefined ? transit : scoreTransit(transit);
  return strengthLabel(scored.score);
}

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
        strength: assignStrength(scored),
        priorityWeight: getPriorityWeight(transit),
      };
    })
    .sort((a, b) => {
      const strengthDiff = (STRENGTH_RANK[b.strength] ?? 0) - (STRENGTH_RANK[a.strength] ?? 0);
      if (strengthDiff !== 0) return strengthDiff;
      if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
      if (b.score !== a.score) return b.score - a.score;
      return (a.orb || 99) - (b.orb || 99);
    })
    .slice(0, limit);
}

module.exports = filterTransits;
module.exports.assignStrength = assignStrength;
module.exports.isMoonPhaseTransit = isMoonPhaseTransit;
module.exports.STRENGTH_RANK = STRENGTH_RANK;
