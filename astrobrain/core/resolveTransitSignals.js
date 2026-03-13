const SIGNAL_RULES = [
  {
    id: 'tension_relacional',
    when: ({ aspect, tags }) => ['square', 'opposition'].includes(aspect) && tags.some((tag) => tag.includes('venus')),
  },
  {
    id: 'reactividad_afectiva',
    when: ({ planet, target, tags }) => (
      planet === 'moon' && ['mars', 'venus'].includes(target)
    ) || tags.includes('aspecto_aplicativo'),
  },
  {
    id: 'contencion_emocional',
    when: ({ tags, context }) => tags.some((tag) => tag.includes('capricornio'))
      || ['tierra', 'earth'].includes(String(context.planetElement || '').toLowerCase()),
  },
  {
    id: 'impulso_vincular',
    when: ({ tags, context }) => tags.some((tag) => tag.includes('aries'))
      || ['fuego', 'fire'].includes(String(context.targetElement || '').toLowerCase()),
  },
  {
    id: 'friccion_entre_control_y_deseo',
    when: ({ tags }) => tags.includes('moon_en_capricornio') && tags.includes('venus_en_aries'),
  },
  {
    id: 'ajuste_fino_orbital',
    when: ({ tags }) => tags.includes('orb_ajustado') || tags.includes('orbe_ajustado') || tags.includes('aspecto_casi_exacto'),
  },
  {
    id: 'dinamica_aplicativa',
    when: ({ tags, context }) => tags.includes('aspecto_aplicativo') || context.isApplying === true,
  },
];

function resolveTransitSignals(transit = {}, tags = []) {
  const normalizedTags = [...new Set((tags || []).map((tag) => String(tag || '').toLowerCase()).filter(Boolean))];
  const planet = String(transit.planet || '').toLowerCase();
  const target = String(transit.target || '').toLowerCase();
  const aspect = String(transit.aspect || '').toLowerCase();
  const context = transit.context || {};

  const base = [
    aspect && ['square', 'opposition'].includes(aspect) ? 'friccion_aspectual' : null,
    planet === 'moon' ? 'sensibilidad_lunar' : null,
    target === 'venus' ? 'tema_relacional' : null,
  ].filter(Boolean);

  const inferred = SIGNAL_RULES
    .filter((rule) => rule.when({ transit, tags: normalizedTags, planet, target, aspect, context }))
    .map((rule) => rule.id);

  return [...new Set([...base, ...inferred])];
}

module.exports = {
  resolveTransitSignals,
};
