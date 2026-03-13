const { enrichTransitContext } = require('./enrichTransitContext');
const { activateNeurons } = require('./neuralNet');

const casos = [
  {
    nombre: 'Caso 1: Luna cuadratura Venus con contexto relacional',
    transit: {
      planet: 'Moon',
      aspect: 'square',
      target: 'Venus',
      orb: 2.9,
      context: {
        targetSign: 'Aries',
        targetHouse: 7,
        targetDegree: 5,
        planetSign: 'Cancer',
        planetHouse: 4,
        planetDegree: 21,
        isApplying: true,
      },
    },
  },
  {
    nombre: 'Caso 2: Saturno conjunción Sol con orbe casi exacto',
    transit: {
      planet: 'Saturn',
      aspect: 'conjunction',
      target: 'Sun',
      orb: 0.4,
      context: {
        targetHouse: 10,
        planetDegree: 24,
        targetDegree: 18,
        isApplying: false,
      },
    },
  },
  {
    nombre: 'Caso 3: Marte conjunción Sol en fuego y grado temprano',
    transit: {
      planet: 'Mars',
      aspect: 'conjunction',
      target: 'Sun',
      orb: 1.1,
      context: {
        planetSign: 'Aries',
        planetDegree: 3,
        targetSign: 'Leo',
        targetDegree: 7,
      },
    },
  },
];

casos.forEach((caso) => {
  const enriquecido = enrichTransitContext(caso.transit);
  const activadas = activateNeurons([enriquecido]);

  console.log(`\n=== ${caso.nombre} ===`);
  console.log('Tags:', enriquecido.derivedTags);
  console.log('Neuronas activadas:', activadas.map((n) => n.id));
});
