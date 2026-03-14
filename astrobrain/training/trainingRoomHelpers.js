(function attachTrainingRoomHelpers(global) {
  const TRAINING_NEURON_SCHEMA = {
    id: 'string',
    match: 'string',
    triggers: ['string'],
    clusters: ['string'],
    signals: ['string'],
    weight: 'number',
    narrativeCategory: 'string',
    eventType: 'string',
    context: 'string',
    output: {
      energy: 'string',
      avoid: 'string',
      use: 'string',
      focus: 'string',
    },
  };

  const REQUIRED_FIELDS = [
    'weight',
    'eventType',
    'match',
    'triggers',
    'clusters',
    'context',
    'output.energy',
    'output.avoid',
    'output.use',
    'output.focus',
  ];

  function normalizeTextValue(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeArrayValue(value) {
    if (Array.isArray(value)) return value.map((item) => `${item}`.trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function serializeTrainingNeuron(draft) {
    return {
      id: normalizeTextValue(draft?.id),
      match: normalizeTextValue(draft?.match),
      triggers: normalizeArrayValue(draft?.triggers),
      clusters: normalizeArrayValue(draft?.clusters),
      signals: normalizeArrayValue(draft?.signals),
      weight: typeof draft?.peso === 'number' ? draft.peso : Number(draft?.peso),
      narrativeCategory: normalizeTextValue(draft?.categoriaNarrativa),
      eventType: normalizeTextValue(draft?.tipoEvento),
      context: normalizeTextValue(draft?.contexto),
      output: {
        energy: normalizeTextValue(draft?.output?.energy),
        avoid: normalizeTextValue(draft?.output?.avoid),
        use: normalizeTextValue(draft?.output?.use),
        focus: normalizeTextValue(draft?.output?.focus),
      },
    };
  }

  function deserializeTrainingNeuron(neuron, baseDraft) {
    const source = neuron || {};
    const weightInput = source.weight ?? source.peso;
    const parsedWeight = Number(weightInput);
    const existingOutput = baseDraft?.output || {};
    return {
      ...(baseDraft || {}),
      id: normalizeTextValue(source.id) || baseDraft?.id || `training_${Date.now()}`,
      match: normalizeTextValue(source.match),
      triggers: normalizeArrayValue(source.triggers),
      clusters: normalizeArrayValue(source.clusters),
      signals: normalizeArrayValue(source.signals),
      peso: Number.isFinite(parsedWeight) ? parsedWeight : '',
      categoriaNarrativa: normalizeTextValue(source.narrativeCategory ?? source.categoriaNarrativa),
      tipoEvento: normalizeTextValue(source.eventType ?? source.tipoEvento),
      contexto: normalizeTextValue(source.context ?? source.contexto),
      output: {
        energy: normalizeTextValue(source?.output?.energy) || normalizeTextValue(existingOutput.energy),
        avoid: normalizeTextValue(source?.output?.avoid) || normalizeTextValue(existingOutput.avoid),
        use: normalizeTextValue(source?.output?.use) || normalizeTextValue(existingOutput.use),
        focus: normalizeTextValue(source?.output?.focus) || normalizeTextValue(existingOutput.focus),
      },
    };
  }

  function validateTrainingNeuron(neuron) {
    const errors = [];
    const warnings = [];
    const unknownKeys = Object.keys(neuron || {}).filter((key) => !Object.prototype.hasOwnProperty.call(TRAINING_NEURON_SCHEMA, key));
    if (unknownKeys.length) warnings.push(`Claves extra ignoradas: ${unknownKeys.join(', ')}`);

    const normalized = deserializeTrainingNeuron(neuron, {});
    const canonical = serializeTrainingNeuron(normalized);

    if (!canonical.id) errors.push('id es requerido.');
    if (!Number.isFinite(canonical.weight)) errors.push('weight debe ser un número válido.');

    if (!Array.isArray(neuron?.triggers) && typeof neuron?.triggers !== 'string') {
      errors.push('triggers debe ser array o texto separado por comas.');
    }
    if (!Array.isArray(neuron?.clusters) && typeof neuron?.clusters !== 'string') {
      errors.push('clusters debe ser array o texto separado por comas.');
    }

    if (!neuron?.output || typeof neuron.output !== 'object') {
      errors.push('output es requerido y debe ser un objeto.');
    }

    const missingFields = REQUIRED_FIELDS.filter((path) => {
      if (path === 'weight') return !Number.isFinite(canonical.weight);
      if (path === 'triggers') return !canonical.triggers.length;
      if (path === 'clusters') return !canonical.clusters.length;
      if (path.startsWith('output.')) {
        const key = path.split('.')[1];
        return !canonical.output[key];
      }
      return !canonical[path];
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingFields,
      normalized,
      canonical,
      schema: TRAINING_NEURON_SCHEMA,
    };
  }

  function buildNeuronTrainingPack(draft) {
    const currentNeuron = serializeTrainingNeuron(draft);
    const validation = validateTrainingNeuron(currentNeuron);
    const status = validation.missingFields.length ? 'incomplete' : 'complete';
    const prompt = [
      'Estoy entrenando una neurona para AstroBrain. Te paso el schema esperado, la neurona parcial y los campos faltantes. Quiero que completes la neurona manteniendo un tono humano, natural, emocional y no técnico. No la vuelvas genérica. Devuélveme solo JSON válido respetando la estructura exacta.',
      '',
      `schema: ${JSON.stringify(TRAINING_NEURON_SCHEMA, null, 2)}`,
      `currentNeuron: ${JSON.stringify(currentNeuron, null, 2)}`,
      `missingFields: ${JSON.stringify(validation.missingFields, null, 2)}`,
    ].join('\n');

    return {
      meta: {
        origin: 'training_room',
        exportedAt: new Date().toISOString(),
        status,
      },
      schema: TRAINING_NEURON_SCHEMA,
      currentNeuron,
      missingFields: validation.missingFields,
      prompt,
    };
  }

  function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadNeuronTrainingPack(draft, filename) {
    const pack = buildNeuronTrainingPack(draft);
    const safeName = filename || `training-pack-${pack.currentNeuron.id || Date.now()}.json`;
    downloadTextFile(JSON.stringify(pack, null, 2), safeName);
    return pack;
  }

  global.TrainingRoomHelpers = {
    TRAINING_NEURON_SCHEMA,
    serializeTrainingNeuron,
    deserializeTrainingNeuron,
    validateTrainingNeuron,
    buildNeuronTrainingPack,
    downloadNeuronTrainingPack,
    downloadTextFile,
  };
})(window);
