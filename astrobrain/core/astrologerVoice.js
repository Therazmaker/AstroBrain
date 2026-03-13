function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeMetaSignal(metaSignals = []) {
  if (!Array.isArray(metaSignals) || metaSignals.length === 0) return '';

  const firstSignal = cleanText(metaSignals.find((signal) => typeof signal === 'string' && signal.trim()));
  if (!firstSignal) return '';

  const lowered = firstSignal.charAt(0).toLowerCase() + firstSignal.slice(1);
  return `${lowered} puede sentirse más fuerte de lo habitual`;
}

function generateAstrologerVoice(signals = {}) {
  const energy = cleanText(signals.energy) || 'una energía sensible';
  const avoid = cleanText(signals.avoid) || 'reacciones impulsivas';
  const use = cleanText(signals.use) || 'acciones conscientes';
  const focus = cleanText(signals.focus) || 'lo que hoy necesita atención real';
  const metaSignal = normalizeMetaSignal(signals.metaSignals);

  const emotion = `Hoy puede sentirse ${energy}, con una sensibilidad que podrías notar en lo que vas viviendo por dentro.`;
  const context = metaSignal
    ? `En lo cotidiano, ${metaSignal}.`
    : 'En lo cotidiano, podrías notar que algunas conversaciones tocan fibras más profundas de lo habitual.';
  const tension = `Aun así, entre el impulso de reaccionar y la necesidad de cuidarte, conviene evitar ${avoid} para sostener más claridad.`;
  const guidance = `Con esa energía, es buen momento para ${use} y ayuda enfocarte en ${focus}, paso a paso y con calma.`;

  return {
    paragraph: `${emotion} ${context} ${tension} ${guidance}`,
  };
}

module.exports = {
  generateAstrologerVoice,
};
