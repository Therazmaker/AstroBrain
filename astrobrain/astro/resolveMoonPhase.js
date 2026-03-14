(function (global) {
  function normalizeMoonPhase(day) {
    const moonPhase = day?.moonPhase || {};
    const phaseName = moonPhase.phaseName || moonPhase.phase || '';
    const sign = moonPhase.sign || moonPhase.moonSign || '';
    return { phaseName, sign };
  }

  function resolveMoonSignalsFromDay(day = {}) {
    const map = global.moonPhaseMap || { phases: {}, signs: {}, combinations: {} };
    const { phaseName, sign } = normalizeMoonPhase(day);
    const phaseSignals = (map.phases[phaseName] || []).map((key, idx) => ({
      key,
      strength: idx === 0 ? 'strong' : 'medium',
      source: 'moon_phase',
    }));
    const signSignals = (map.signs[sign] || []).map((key, idx) => ({
      key,
      strength: idx === 0 ? 'strong' : 'medium',
      source: 'moon_sign',
    }));

    const comboKey = `${phaseName}|${sign}`;
    const comboSignals = (map.combinations[comboKey] || []).map((key) => ({
      key,
      strength: 'strong',
      source: 'moon_combo',
    }));

    return [...phaseSignals, ...signSignals, ...comboSignals];
  }

  global.resolveMoonSignalsFromDay = resolveMoonSignalsFromDay;
})(window);
