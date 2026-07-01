// Base de datos de cartas iniciales por defecto (Cartas Base)
// Estas cartas estarán disponibles para salir en los sobres y se mezclarán con las cartas creadas por el usuario.

const DEFAULT_CARDS = [
  // --- COMUNES (0 o 1 Moneda) ---
  {
    id: "base_soldado",
    name: "Soldado Recluta",
    cost: 1,
    attack: 2,
    health: 4,
    pattern: "front", // Ataca directo al frente
    rarity: "common",
    description: "Un luchador disciplinado que ataca de frente.",
    isSupport: false
  },
  {
    id: "base_escudo",
    name: "Escudero Guardián",
    cost: 1,
    attack: 0,
    health: 7,
    pattern: "defense", // Solo defiende (no ataca)
    rarity: "common",
    description: "Tiene gran defensa pero no realiza ataques.",
    isSupport: false
  },
  {
    id: "base_pocion_vida",
    name: "Poción Menor",
    cost: 0,
    attack: 0,
    health: 2,
    pattern: "defense",
    rarity: "common",
    description: "Carta de apoyo básica. Ofrece algo de bloqueo.",
    isSupport: true // Carta de apoyo compartida
  },
  {
    id: "base_refuerzo",
    name: "Milicia de Apoyo",
    cost: 1,
    attack: 1,
    health: 2,
    pattern: "front",
    rarity: "common",
    description: "Carta de apoyo barata que ataca de frente.",
    isSupport: true
  },

  // --- RARAS (1 o 2 Monedas) ---
  {
    id: "base_espadachin",
    name: "Espadachín Ágil",
    cost: 2,
    attack: 4,
    health: 3,
    pattern: "front",
    rarity: "rare",
    description: "Rápido y letal, excelente atacante frontal.",
    isSupport: false
  },
  {
    id: "base_arquero",
    name: "Arquero Flanqueador",
    cost: 2,
    attack: 3,
    health: 3,
    pattern: "adjacent", // Ataca a los lados
    rarity: "rare",
    description: "Ataca a los lados de la carta de enfrente.",
    isSupport: false
  },
  {
    id: "base_escudo_pesado",
    name: "Barrera de Energía",
    cost: 2,
    attack: 0,
    health: 12,
    pattern: "defense",
    rarity: "rare",
    description: "Excelente carta de apoyo defensiva.",
    isSupport: true
  },

  // --- ÉPICAS (2 o 3 Monedas) ---
  {
    id: "base_golem",
    name: "Golem de Piedra",
    cost: 3,
    attack: 3,
    health: 12,
    pattern: "front",
    rarity: "epic",
    description: "Un coloso con gran cantidad de vida.",
    isSupport: false
  },
  {
    id: "base_asesino",
    name: "Asesino de la Sombra",
    cost: 3,
    attack: 5,
    health: 4,
    pattern: "right", // Ataca específicamente al lado derecho
    rarity: "epic",
    description: "Flanquea atacando únicamente hacia la derecha.",
    isSupport: false
  },

  // --- LEGENDARIAS (3 o 4 Monedas) ---
  {
    id: "base_dragon",
    name: "Dragón de Plasma",
    cost: 4,
    attack: 6,
    health: 15,
    pattern: "adjacent",
    rarity: "legendary",
    description: "Devasta al frente y a los lados. ¡Un verdadero titán!",
    isSupport: false
  },
  {
    id: "base_avatar",
    name: "Avatar del Crossover",
    cost: 4,
    attack: 8,
    health: 10,
    pattern: "front",
    rarity: "legendary",
    description: "Su poder de ataque frontal es incomparable.",
    isSupport: false
  }
];

// Retorna los estilos visuales de las cartas según su rareza
function getRarityStyle(rarity) {
  switch (rarity) {
    case "common":
      return { border: "rgba(255, 255, 255, 0.2)", shadow: "rgba(255, 255, 255, 0.1)", text: "Común", color: "#8a92a6" };
    case "rare":
      return { border: "rgba(0, 168, 255, 0.6)", shadow: "0 0 10px rgba(0, 168, 255, 0.4)", text: "Rara", color: "#00a8ff" };
    case "epic":
      return { border: "rgba(156, 39, 176, 0.6)", shadow: "0 0 12px rgba(156, 39, 176, 0.5)", text: "Épica", color: "#9c27b0" };
    case "legendary":
      return { border: "rgba(255, 215, 0, 0.8)", shadow: "0 0 20px rgba(255, 215, 0, 0.6)", text: "Legendaria", color: "#ffd700" };
    default:
      return { border: "rgba(255, 255, 255, 0.2)", shadow: "none", text: "Desconocida", color: "#ffffff" };
  }
}

// Retorna el icono representativo del patrón de ataque
function getPatternIcon(pattern) {
  switch (pattern) {
    case "front":
      return "⬆️";
    case "adjacent":
      return "↔️";
    case "right":
      return "➡️";
    case "defense":
      return "🛡️";
    default:
      return "⚔️";
  }
}
