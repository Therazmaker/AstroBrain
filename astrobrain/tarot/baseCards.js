const MAJOR_ARCANA = [
  { slug: 'fool', name: 'El Loco' },
  { slug: 'magician', name: 'El Mago' },
  { slug: 'high_priestess', name: 'La Sacerdotisa' },
  { slug: 'empress', name: 'La Emperatriz' },
  { slug: 'emperor', name: 'El Emperador' },
  { slug: 'hierophant', name: 'El Hierofante' },
  { slug: 'lovers', name: 'Los Enamorados' },
  { slug: 'chariot', name: 'El Carro' },
  { slug: 'strength', name: 'La Fuerza' },
  { slug: 'hermit', name: 'El Ermitaño' },
  { slug: 'wheel_of_fortune', name: 'La Rueda de la Fortuna' },
  { slug: 'justice', name: 'La Justicia' },
  { slug: 'hanged_man', name: 'El Colgado' },
  { slug: 'death', name: 'La Muerte' },
  { slug: 'temperance', name: 'La Templanza' },
  { slug: 'devil', name: 'El Diablo' },
  { slug: 'tower', name: 'La Torre' },
  { slug: 'star', name: 'La Estrella' },
  { slug: 'moon', name: 'La Luna' },
  { slug: 'sun', name: 'El Sol' },
  { slug: 'judgement', name: 'El Juicio' },
  { slug: 'world', name: 'El Mundo' },
];

const MINOR_SUITS = ['wands', 'cups', 'swords', 'pentacles'];

const MINOR_RANKS = [
  { slug: 'ace', name: 'As', number: 1 },
  { slug: 'two', name: 'Dos', number: 2 },
  { slug: 'three', name: 'Tres', number: 3 },
  { slug: 'four', name: 'Cuatro', number: 4 },
  { slug: 'five', name: 'Cinco', number: 5 },
  { slug: 'six', name: 'Seis', number: 6 },
  { slug: 'seven', name: 'Siete', number: 7 },
  { slug: 'eight', name: 'Ocho', number: 8 },
  { slug: 'nine', name: 'Nueve', number: 9 },
  { slug: 'ten', name: 'Diez', number: 10 },
  { slug: 'page', name: 'Sota', number: 11 },
  { slug: 'knight', name: 'Caballero', number: 12 },
  { slug: 'queen', name: 'Reina', number: 13 },
  { slug: 'king', name: 'Rey', number: 14 },
];

const SUIT_NAMES_ES = {
  wands: 'Bastos',
  cups: 'Copas',
  swords: 'Espadas',
  pentacles: 'Oros',
};

function buildBaseCardNode({ id, name, arcana, suit, number }) {
  return {
    id,
    name,
    arcana,
    suit,
    number,
    base_meaning: {
      upright: '',
      shadow: '',
    },
    themes: [],
    sources: [],
    meta: {
      node_type: 'tarot_card',
      is_base: true,
    },
  };
}

function buildMajorArcanaCards() {
  return MAJOR_ARCANA.map((card, number) =>
    buildBaseCardNode({
      id: `card_major_${card.slug}`,
      name: card.name,
      arcana: 'major',
      suit: null,
      number,
    }),
  );
}

function buildMinorArcanaCards() {
  return MINOR_SUITS.flatMap((suit) =>
    MINOR_RANKS.map((rank) =>
      buildBaseCardNode({
        id: `card_minor_${rank.slug}_${suit}`,
        name: `${rank.name} de ${SUIT_NAMES_ES[suit]}`,
        arcana: 'minor',
        suit,
        number: rank.number,
      }),
    ),
  );
}

function createTarotBaseCards() {
  return [...buildMajorArcanaCards(), ...buildMinorArcanaCards()];
}

module.exports = {
  MAJOR_ARCANA,
  MINOR_SUITS,
  MINOR_RANKS,
  createTarotBaseCards,
};
