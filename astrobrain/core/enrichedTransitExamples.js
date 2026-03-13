const { enrichTransitContext } = require('./enrichTransitContext');
const interpretTransits = require('./interpretTransits');

function mostrarCaso(titulo, transit) {
  const enriquecido = enrichTransitContext(transit);
  console.log(`\n=== ${titulo} ===`);
  console.log('Contexto enriquecido:', JSON.stringify(enriquecido.context, null, 2));
  console.log('Etiquetas derivadas:', enriquecido.derivedTags.join(', '));

  const resultado = interpretTransits([transit]);
  console.log('Narrativa:', resultado.narrative.energy);
  console.log('Sugerencia:', resultado.narrative.use);
}

function runExamples() {
  mostrarCaso('Luna cuadratura Venus con Venus en Aries', {
    planet: 'Moon',
    aspect: 'square',
    target: 'Venus',
    orb: 2.2,
    context: {
      targetSign: 'Aries',
      targetHouse: 10,
      isApplying: true,
    },
  });

  mostrarCaso('Marte conjunción Sol en signo de fuego', {
    planet: 'Mars',
    aspect: 'conjunction',
    target: 'Sun',
    orb: 1.4,
    context: {
      targetSign: 'Leo',
      targetHouse: 5,
    },
  });

  mostrarCaso('Saturno conjunción Sol con orbe fuerte', {
    planet: 'Saturn',
    aspect: 'conjunction',
    target: 'Sun',
    orb: 0.6,
    context: {
      targetSign: 'Capricornio',
      targetHouse: 10,
    },
  });
}

if (require.main === module) {
  runExamples();
}

module.exports = { runExamples };
