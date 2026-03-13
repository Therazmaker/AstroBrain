const ESCALATION_PHRASES = [
  'this could intensify if unmanaged',
  'it may escalate quickly',
];

function anticipateOutcome(signals = {}) {
  const emotionalCluster = Number(signals.emotionalCluster || 0);
  const tension = Number(signals.tension || 0);

  if (emotionalCluster >= 1.2 && tension >= 1) {
    return ESCALATION_PHRASES[0];
  }

  if (emotionalCluster >= 1.8 || tension >= 2) {
    return ESCALATION_PHRASES[1];
  }

  return '';
}

module.exports = {
  anticipateOutcome,
};
