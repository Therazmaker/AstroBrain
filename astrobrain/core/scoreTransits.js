const PLANET_BASE_SCORE = {
  Moon: 5,
  Mars: 4,
  Saturn: 4,
  Mercury: 3,
  Venus: 3,
  Sun: 3,
  Jupiter: 2,
};

const ASPECT_SCORE = {
  conjunction: 3,
  opposition: 3,
  square: 2,
  trine: 2,
  sextile: 1,
};

function scoreOrb(orb = Infinity) {
  if (orb < 1) return 3;
  if (orb < 2) return 2;
  if (orb < 3) return 1;
  return 0;
}

function scoreTransit(transit) {
  const planetScore = PLANET_BASE_SCORE[transit.planet] || 0;
  const aspectScore = ASPECT_SCORE[transit.aspect] || 0;
  const orbScore = scoreOrb(transit.orb);
  const total = planetScore + aspectScore + orbScore;

  return {
    ...transit,
    score: total,
    scoreBreakdown: {
      planet: planetScore,
      aspect: aspectScore,
      orb: orbScore,
    },
  };
}

module.exports = {
  scoreTransit,
  PLANET_BASE_SCORE,
  ASPECT_SCORE,
};
