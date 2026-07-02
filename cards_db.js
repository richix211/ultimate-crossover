// Base de datos de cartas iniciales por defecto (Cartas Base de la Expansión Galaxy)
// Únicamente contiene las 13 cartas oficiales de la colección Galaxy.

const DEFAULT_CARDS = [
  // --- APOYOS (2 Cartas) ---
  {
    id: "galaxy_nebulosa_curativa",
    name: "Nebulosa Curativa",
    cost: 1,
    attack: 0,
    health: 5,
    pattern: "defense",
    rarity: "common",
    description: "Al final de cada ronda, cura +2 de vida a los aliados adyacentes.",
    isSupport: true,
    image: "Nebulosacurativa.png"
  },
  {
    id: "galaxy_generador_plasma",
    name: "Generador de Plasma",
    cost: 2,
    attack: 0,
    health: 6,
    pattern: "defense",
    rarity: "rare",
    description: "Otorga +1 de ataque a los aliados adyacentes mientras esté en el tablero.",
    isSupport: true,
    image: "Generadordeplasma.png"
  },

  // --- GUERREROS COSTE 1 (2 Cartas) ---
  {
    id: "galaxy_cadete_estelar",
    name: "Cadete Estelar",
    cost: 1,
    attack: 2,
    health: 4,
    pattern: "front",
    rarity: "common",
    description: "Luchador ágil y barato ideal para reclamar carriles en las primeras rondas.",
    isSupport: false,
    image: "CadeteEstelar.png"
  },
  {
    id: "galaxy_droide_explorador",
    name: "Droide Explorador",
    cost: 1,
    attack: 1,
    health: 6,
    pattern: "front",
    rarity: "common",
    description: "Una unidad de reconocimiento barata programada para soportar castigos iniciales.",
    isSupport: false,
    image: "DroideExplorador.png"
  },

  // --- GUERREROS COSTE 2 (4 Cartas) ---
  {
    id: "galaxy_defensor_andromeda",
    name: "Defensor de Andrómeda",
    cost: 2,
    attack: 2,
    health: 8,
    pattern: "front",
    rarity: "common",
    description: "Su escudo de titanio galáctico absorbe los primeros choques en el frente.",
    isSupport: false,
    image: "Defensordeandromeda.png"
  },
  {
    id: "galaxy_cazador_pulsars",
    name: "Cazador de Pulsars",
    cost: 2,
    attack: 3,
    health: 6,
    pattern: "front",
    rarity: "common",
    description: "Ataca con rifles de impulsos cargados de radiación cósmica.",
    isSupport: false,
    image: "Cazadordepulsars.png"
  },
  {
    id: "galaxy_explorador_solar",
    name: "Explorador Solar",
    cost: 2,
    attack: 3,
    health: 5,
    pattern: "adjacent",
    rarity: "rare",
    description: "Al entrar en juego, si hay un aliado adyacente, este explorador obtiene +1 de vida.",
    isSupport: false,
    image: "ExploradorSolar.png"
  },
  {
    id: "galaxy_piloto_cazas",
    name: "Piloto de Cazas",
    cost: 2,
    attack: 4,
    health: 4,
    pattern: "right",
    rarity: "rare",
    description: "Al entrar en juego, inflige 1 de daño al guerrero situado en el carril a su derecha.",
    isSupport: false,
    image: "Pilotodecazas.png"
  },

  // --- GUERREROS COSTE 3 (3 Cartas) ---
  {
    id: "galaxy_guerrero_meteoritos",
    name: "Guerrero de Meteoritos",
    cost: 3,
    attack: 4,
    health: 9,
    pattern: "front",
    rarity: "rare",
    description: "Al morir, inflige 2 de daño al oponente que lo destruyó.",
    isSupport: false,
    image: "Guerrerodemeteoritos.png"
  },
  {
    id: "galaxy_bestia_agujero",
    name: "Bestia del Agujero Negro",
    cost: 3,
    attack: 5,
    health: 7,
    pattern: "adjacent",
    rarity: "rare",
    description: "Una aberración gravitacional que desgarra a los enemigos adyacentes.",
    isSupport: false,
    image: "Bestiadelagujeronegro.png"
  },
  {
    id: "galaxy_infiltrado_vacio",
    name: "Infiltrado del Vacío",
    cost: 3,
    attack: 4,
    health: 8,
    pattern: "right",
    rarity: "epic",
    description: "Si no hay ningún oponente enfrente de él al jugarse, obtiene +2 de ataque permanentemente.",
    isSupport: false,
    image: "Infiltradodelvacio.png"
  },

  // --- GUERREROS COSTE 4+ (2 Cartas) ---
  {
    id: "galaxy_centinela_titan",
    name: "Centinela Titán",
    cost: 4,
    attack: 4,
    health: 14,
    pattern: "front",
    rarity: "epic",
    description: "Al entrar en juego, cura +3 de vida a tu barra de vida principal.",
    isSupport: false,
    image: "Centinelatitan.png"
  },
  {
    id: "galaxy_emperador_dragon",
    name: "Emperador Dragón Cósmico",
    cost: 5,
    attack: 8,
    health: 12,
    pattern: "adjacent",
    rarity: "legendary",
    description: "Al entrar en juego, inflige 2 de daño a TODOS los guerreros enemigos en el tablero.",
    isSupport: false,
    image: "EmperadorDragonCosmico.png"
  }
];
