const interpretTransits = require('./core/interpretTransits');
const { ingestTranscript } = require('./training/ingestTranscript');
const { runRawPipeline } = require('./core/rawPipeline');
const { parseRaw } = require('./core/rawParser');
const feedbackLoop = require('./core/feedbackLoop');
const natalProfile = require('./core/natalProfile');

function runAstroBrain(transits) {
  return interpretTransits(transits).narrative;
}

module.exports = {
  runAstroBrain,
  interpretTransits,
  ingestTranscript,
  runRawPipeline,
  parseRaw,
  feedbackLoop,
  natalProfile,
};

if (require.main === module) {
  const transits = [
    { planet: 'Mars', aspect: 'square', target: 'Moon', orb: 0.8 },
    { planet: 'Venus', aspect: 'trine', target: 'Sun', orb: 1.2 },
    { planet: 'Jupiter', aspect: 'sextile', target: 'Mercury', orb: 2.1 },
    { planet: 'Saturn', aspect: 'conjunction', target: 'Sun', orb: 1.7 },
  ];

  console.log(JSON.stringify(interpretTransits(transits), null, 2));
}
