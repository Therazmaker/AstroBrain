(function (global) {
  const moonPhaseMap = {
    phases: {
      'New Moon': ['moon_new_moon', 'inicio_ciclo', 'siembra', 'intencion', 'nueva_energia'],
      'First Quarter': ['moon_first_quarter', 'accion', 'decision', 'ajuste', 'impulso'],
      'Full Moon': ['moon_full_moon', 'culminacion', 'visibilidad', 'emocion_alta', 'revelacion'],
      'Last Quarter': ['moon_last_quarter', 'release_cycle', 'depuracion', 'revision', 'cierre'],
      'Waxing Crescent': ['moon_waxing_crescent', 'crecimiento_inicial', 'esperanza', 'ensayo', 'apertura'],
      'Waxing Gibbous': ['moon_waxing_gibbous', 'maduracion', 'refinamiento', 'ajuste_fino', 'preparacion'],
      'Waning Gibbous': ['moon_waning_gibbous', 'integracion', 'gratitud', 'compartir', 'aprendizaje'],
      'Waning Crescent': ['moon_waning_crescent', 'descanso', 'introspeccion', 'soltar', 'cuidado_interno'],
    },
    signs: {
      Aries: ['moon_in_aries', 'impulso_emocional', 'iniciativa', 'fuego_interno'],
      Taurus: ['moon_in_taurus', 'estabilidad_emocional', 'cuerpo', 'ritmo_lento'],
      Gemini: ['moon_in_gemini', 'mente_emocional', 'curiosidad', 'conversacion'],
      Cancer: ['moon_in_cancer', 'sensibilidad', 'hogar', 'cuidado'],
      Leo: ['moon_in_leo', 'expresion_emocional', 'creatividad', 'corazon'],
      Virgo: ['moon_in_virgo', 'orden_emocional', 'discernimiento', 'servicio'],
      Libra: ['moon_in_libra', 'balance_emocional', 'vinculo', 'armonizacion'],
      Scorpio: ['moon_in_scorpio', 'intensidad_emocional', 'profundidad', 'transformacion'],
      Sagittarius: ['moon_in_sagittarius', 'expansion_emocional', 'sentido', 'vision'],
      Capricorn: ['moon_in_capricorn', 'estructura_emocional', 'responsabilidad', 'foco'],
      Aquarius: ['moon_in_aquarius', 'distancia_emocional', 'observacion', 'perspectiva'],
      Pisces: ['moon_in_pisces', 'permeabilidad_emocional', 'intuicion', 'fusion'],
    },
    combinations: {
      'Last Quarter|Aquarius': ['revision_con_distancia', 'soltar_con_lucidez', 'cierre_mental', 'limpieza_de_patrones'],
      'Full Moon|Scorpio': ['revelacion_profunda', 'catarsis_emocional', 'verdad_interna'],
      'New Moon|Aries': ['inicio_valiente', 'intencion_activa', 'chispa_inicial'],
    },
  };

  global.moonPhaseMap = moonPhaseMap;
})(window);
