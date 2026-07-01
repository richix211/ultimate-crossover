// ==========================================================================
// BATTLE.JS - SISTEMA DEFINITIVO DE COMBATE ONLINE CON FIREBASE
// Fases: placement → revealing → combat → roundEnd → placement...
// ==========================================================================

let activeBattle = null;
let localRole = null;
let dragSelectedCardId = null;
let battleListenerRef = null;
let combatProcessed = false;
let gameEndHandled = false;

function normalizeBoard(board) {
  const result = [null, null, null, null, null];
  if (!board) return result;
  for (let i = 0; i < 5; i++) {
    const val = board[i] || board[String(i)];
    // Verificar estrictamente que val sea un objeto válido y contenga un ID de carta
    if (val && typeof val === 'object' && typeof val.id === 'string') {
      result[i] = val;
    } else {
      result[i] = null;
    }
  }
  return result;
}


// Convierte el board a un objeto con claves "0"-"4" para que Firebase
// preserve los slots vacíos (Firebase ignora null en arrays pero respeta objetos)
function serializeBoard(board) {
  const obj = {};
  for (let i = 0; i < 5; i++) {
    obj[String(i)] = board[i] ? board[i] : null;
  }
  return obj;
}


// ==========================================================================
// INICIO DE BATALLA
// ==========================================================================

function initiateBattleRoom(duelData, role) {
  localRole = role;
  combatProcessed = false;
  const battleId = duelData.id;

  // Desconectar listener de duelos del lobby
  db.ref(`duels`).off();
  showScreen("screen-battle");

  if (role === "player1") {
    db.ref(`users`).once("value", (snap) => {
      if (!snap.exists()) { alert("Error al cargar usuarios."); showScreen("screen-lobby"); return; }

      const usersData = snap.val();
      const p1User = usersData[duelData.from];
      const p2User = usersData[duelData.to];
      if (!p1User || !p2User) { alert("Error: jugador no encontrado."); showScreen("screen-lobby"); return; }

      const allCards = [...DEFAULT_CARDS, ...customCards];
      const p1Deck = buildDeckArray(p1User, allCards, "p1");
      const p2Deck = buildDeckArray(p2User, allCards, "p2");
      const supportPool = buildSupportPool(p1User, p2User, allCards);

      shuffle(p1Deck);
      shuffle(p2Deck);

      const initialHand1 = [p1Deck.shift(), p1Deck.shift(), p1Deck.shift()].filter(Boolean);
      const initialHand2 = [p2Deck.shift(), p2Deck.shift(), p2Deck.shift()].filter(Boolean);

      // Guardar copias de los mazos completos iniciales (las 10 cartas) para poder re-mezclar su propio mazo
      const p1OriginalDeck = [...p1Deck, ...initialHand1];
      const p2OriginalDeck = [...p2Deck, ...initialHand2];

      const battle = {
        id: battleId,
        phase: "placement",
        round: 1,
        combatLog: "¡Comienza el duelo! Ronda 1 — Roba una carta y coloca tus guerreros.",
        gameEnded: false,
        winner: null,
        supportPool: supportPool,
        player1: {
          username: p1User.username,
          hp: 100,
          energy: 1,
          deck: p1Deck,
          originalDeck: p1OriginalDeck,
          hand: initialHand1,
          board: serializeBoard([null, null, null, null, null]),
          hasDrawn: false,
          ready: false
        },
        player2: {
          username: p2User.username,
          hp: 100,
          energy: 1,
          deck: p2Deck,
          originalDeck: p2OriginalDeck,
          hand: initialHand2,
          board: serializeBoard([null, null, null, null, null]),
          hasDrawn: false,
          ready: false
        }
      };


      db.ref(`battles/${battleId}`).set(battle, () => {
        activeBattle = battle;
        subscribeToFirebaseBattle(battleId);
        setupBattleControls();
        renderBattle();
      });
    });
  } else {
    // Player 2: esperar a que Firebase tenga la batalla creada
    waitForBattleAndSubscribe(battleId);
  }
}

// Construir array de cartas del mazo
function buildDeckArray(user, allCards, prefix) {
  const deckIdx = user.activeDeckIdx || 0;
  const deck = user.decks[deckIdx] || user.decks[0] || { cards: [], support: [] };
  return (deck.cards || []).map((id, i) => {
    const card = allCards.find(c => c.id === id);
    return card ? { ...card, instanceId: `${prefix}_${id}_${i}_${Math.random().toString(36).slice(2)}` } : null;
  }).filter(Boolean);
}

// Construir pool de apoyo
function buildSupportPool(p1User, p2User, allCards) {
  const deckIdx1 = p1User.activeDeckIdx || 0;
  const deckIdx2 = p2User.activeDeckIdx || 0;
  const deck1 = p1User.decks[deckIdx1] || p1User.decks[0] || { support: [] };
  const deck2 = p2User.decks[deckIdx2] || p2User.decks[0] || { support: [] };
  const supp1 = (deck1.support || []).map(id => { const c = allCards.find(x => x.id === id); return c ? { ...c, instanceId: `supp1_${id}_${Math.random()}` } : null; }).filter(Boolean);
  const supp2 = (deck2.support || []).map(id => { const c = allCards.find(x => x.id === id); return c ? { ...c, instanceId: `supp2_${id}_${Math.random()}` } : null; }).filter(Boolean);
  return [...supp1, ...supp2];
}

// Player 2 espera hasta que la sala exista
function waitForBattleAndSubscribe(battleId) {
  const ref = db.ref(`battles/${battleId}`);
  ref.once("value", (snap) => {
    if (snap.exists() && snap.val().player1 && snap.val().player2) {
      activeBattle = snap.val();
      subscribeToFirebaseBattle(battleId);
      setupBattleControls();
      renderBattle();
    } else {
      setTimeout(() => waitForBattleAndSubscribe(battleId), 800);
    }
  });
}

// ==========================================================================
// FIREBASE LISTENER - Manejo estricto de fases
// ==========================================================================

function subscribeToFirebaseBattle(battleId) {
  if (battleListenerRef) battleListenerRef.off();
  battleListenerRef = db.ref(`battles/${battleId}`);
  gameEndHandled = false;
  isAnimatingCombat = false;

  battleListenerRef.on("value", (snap) => {
    if (!snap.exists()) return;
    const data = snap.val();
    if (!data || !data.player1 || !data.player2) return;

    activeBattle = data;

    // Si está en fase combat, corremos las animaciones
    if (data.phase === "combat") {
      runVisualCombatSequenced();
    } else {
      // De lo contrario, renderizar el estado normal (colocación o revelación)
      renderBattle();
    }

    // Fin de juego — solo ejecutar una vez
    if (data.gameEnded && !gameEndHandled) {
      gameEndHandled = true;
      handleGameEnd();
      return;
    }

    // Solo Player1 procesa el combate para evitar duplicados
    if (localRole === "player1" && !combatProcessed && !data.gameEnded) {
      if (data.phase === "placement" && data.player1.ready && data.player2.ready) {
        combatProcessed = true;
        transitionToRevealPhase();
      }
    }
  });
}


// ==========================================================================
// TRANSICIONES DE FASE (Solo ejecutadas por Player1)
// ==========================================================================

let isAnimatingCombat = false; // Bandera local para no re-animar

function transitionToRevealPhase() {
  activeBattle.phase = "revealing";
  activeBattle.combatLog = "⚔️ ¡Se revelan las cartas! Preparando ataque...";
  db.ref(`battles/${activeBattle.id}`).update({
    phase: "revealing",
    combatLog: activeBattle.combatLog
  }, () => {
    // 2.5 segundos de revelación, luego pasa a la fase de combate local y animaciones
    setTimeout(() => {
      if (localRole === "player1") {
        db.ref(`battles/${activeBattle.id}`).update({ phase: "combat" });
      }
    }, 2500);
  });
}

function runVisualCombatSequenced() {
  if (isAnimatingCombat) return;
  isAnimatingCombat = true;

  const p1 = JSON.parse(JSON.stringify(activeBattle.player1));
  const p2 = JSON.parse(JSON.stringify(activeBattle.player2));

  p1.board = normalizeBoard(p1.board);
  p2.board = normalizeBoard(p2.board);

  const animationsQueue = [];

  // Recorrer los 5 carriles secuencialmente
  for (let i = 0; i < 5; i++) {
    const c1 = p1.board[i];
    const c2 = p2.board[i];

    // Ataque del Jugador 1
    if (c1 && c1.pattern !== "defense" && c1.attack > 0) {
      animationsQueue.push({
        attackerRole: "player1",
        slotIdx: i,
        cardName: c1.name,
        dmg: c1.attack,
        pattern: c1.pattern
      });
    }

    // Ataque del Jugador 2
    if (c2 && c2.pattern !== "defense" && c2.attack > 0) {
      animationsQueue.push({
        attackerRole: "player2",
        slotIdx: i,
        cardName: c2.name,
        dmg: c2.attack,
        pattern: c2.pattern
      });
    }
  }

  let delay = 0;
  const logEl = document.getElementById("combat-status-log");

  animationsQueue.forEach((anim, index) => {
    setTimeout(() => {
      // Mostrar log actual de la acción
      const isMeAttacker = (anim.attackerRole === localRole);
      const logText = isMeAttacker
        ? `⚔️ Tu [${anim.cardName}] ataca carril ${anim.slotIdx + 1} (Daño: ${anim.dmg})`
        : `⚠️ [${anim.cardName}] enemigo ataca carril ${anim.slotIdx + 1} (Daño: ${anim.dmg})`;
      if (logEl) logEl.textContent = logText;

      // Localizar el DOM de la carta atacante
      const attackerBoardId = (anim.attackerRole === localRole) ? "player-board" : "enemy-board";
      const attackerBoard = document.getElementById(attackerBoardId);
      if (attackerBoard) {
        const slots = attackerBoard.querySelectorAll(".board-slot");
        const slot = slots[anim.slotIdx];
        const cardEl = slot ? slot.querySelector(".game-card") : null;
        if (cardEl) {
          const bounceClass = (anim.attackerRole === localRole) ? "attack-bounce-up" : "attack-bounce-down";
          cardEl.classList.add(bounceClass);
          setTimeout(() => cardEl.classList.remove(bounceClass), 600);
        }
      }

      // Aplicar vibración y daño visual al objetivo
      setTimeout(() => {
        applyVisualDamage(anim);
      }, 200);

    }, delay);
    delay += 1100; // 1.1 segundos entre ataque y ataque
  });

  // Al finalizar todas las animaciones de ataque
  setTimeout(() => {
    isAnimatingCombat = false;
    if (localRole === "player1") {
      executeCombatCalculationAndNextRound();
    }
  }, delay + 800);
}

function applyVisualDamage(anim) {
  const isMeAttacker = (anim.attackerRole === localRole);
  const targetBoardId = isMeAttacker ? "enemy-board" : "player-board";
  const targetBoard = document.getElementById(targetBoardId);
  if (!targetBoard) return;

  const slots = targetBoard.querySelectorAll(".board-slot");

  // Determinar qué slots son golpeados por el patrón
  let targetSlots = [];
  if (anim.pattern === "front") {
    targetSlots = [anim.slotIdx];
  } else if (anim.pattern === "adjacent") {
    targetSlots = [anim.slotIdx - 1, anim.slotIdx + 1];
  } else if (anim.pattern === "right") {

    targetSlots = [anim.slotIdx + 1 < 5 ? anim.slotIdx + 1 : anim.slotIdx];
  }

  let hitAnyCard = false;
  targetSlots.forEach(idx => {
    if (idx >= 0 && idx < 5) {
      const slot = slots[idx];
      const cardEl = slot ? slot.querySelector(".game-card") : null;
      if (cardEl && !cardEl.classList.contains("board-slot-label")) {
        hitAnyCard = true;
        // Sacudir carta objetivo y mostrar daño
        cardEl.classList.add("damage-shake");
        setTimeout(() => cardEl.classList.remove("damage-shake"), 400);

        // Crear indicador de daño flotante
        const dmgIndicator = document.createElement("div");
        dmgIndicator.className = "damage-indicator";
        dmgIndicator.textContent = `-${anim.dmg}`;
        cardEl.appendChild(dmgIndicator);
        setTimeout(() => dmgIndicator.remove(), 900);
      }
    }
  });

  // Si no golpeó ninguna carta, golpeó directamente al jugador (barra de vida)
  if (!hitAnyCard) {
    const healthValueId = isMeAttacker ? "enemy-health-text" : "player-health-text";
    const healthBarId = isMeAttacker ? "enemy-health-bar" : "player-health-bar";
    const healthValEl = document.getElementById(healthValueId);
    const healthBarEl = document.getElementById(healthBarId);

    if (healthValEl && healthBarEl) {
      // Parpadeo rojo en la barra de vida
      healthBarEl.style.filter = "brightness(1.5) sepia(1) saturate(5) hue-rotate(-50deg)";
      setTimeout(() => healthBarEl.style.filter = "", 400);
    }
  }
}

function executeCombatCalculationAndNextRound() {
  if (!activeBattle) return;
  const p1 = JSON.parse(JSON.stringify(activeBattle.player1));
  const p2 = JSON.parse(JSON.stringify(activeBattle.player2));

  p1.board = normalizeBoard(p1.board);
  p2.board = normalizeBoard(p2.board);

  const logs = [];

  // Calcular combate definitivo en el servidor
  for (let i = 0; i < 5; i++) {
    const c1 = p1.board[i];
    const c2 = p2.board[i];

    if (c1 && c1.pattern !== "defense" && c1.attack > 0) {
      applyAttack(c1, i, p2, logs, c1.pattern);
    }
    if (c2 && c2.pattern !== "defense" && c2.attack > 0) {
      applyAttack(c2, i, p1, logs, c2.pattern);
    }
  }

  // Eliminar destruidas
  for (let i = 0; i < 5; i++) {
    if (p1.board[i] && p1.board[i].health <= 0) {
      logs.push(`💥 ${p1.board[i].name} destruida.`);
      p1.board[i] = null;
    }
    if (p2.board[i] && p2.board[i].health <= 0) {
      logs.push(`💥 ${p2.board[i].name} destruida.`);
      p2.board[i] = null;
    }
  }

  p1.hp = Math.max(0, p1.hp);
  p2.hp = Math.max(0, p2.hp);

  p1.board = serializeBoard(p1.board);
  p2.board = serializeBoard(p2.board);

  let gameEnded = false;
  let winner = null;
  let finalLog = logs.join(" | ");

  if (p1.hp <= 0 && p2.hp <= 0) {
    gameEnded = true; winner = "Empate";
    finalLog += " | ¡Es un EMPATE!";
  } else if (p1.hp <= 0) {
    gameEnded = true; winner = p2.username;
    finalLog += ` | 🏆 ¡Victoria para ${p2.username}!`;
  } else if (p2.hp <= 0) {
    gameEnded = true; winner = p1.username;
    finalLog += ` | 🏆 ¡Victoria para ${p1.username}!`;
  }

  if (gameEnded) {
    db.ref(`battles/${activeBattle.id}`).update({
      phase: "combat",
      player1: p1,
      player2: p2,
      combatLog: finalLog || "¡Duelo finalizado!",
      gameEnded: true,
      winner: winner
    });
  } else {
    const nextRound = activeBattle.round + 1;
    p1.energy = nextRound;
    p2.energy = nextRound;
    p1.ready = false;
    p2.ready = false;
    p1.hasDrawn = false;
    p2.hasDrawn = false;

    db.ref(`battles/${activeBattle.id}`).update({
      phase: "placement",
      round: nextRound,
      player1: p1,
      player2: p2,
      combatLog: `Ronda ${nextRound} — ${finalLog || "¡Preparate para la siguiente ronda!"}`,
      gameEnded: false,
      winner: null
    }, () => {
      combatProcessed = false;
    });
  }
}


function applyAttack(card, slotIdx, defender, logs, pattern) {
  if (!card || card.attack <= 0) return;
  const dmg = card.attack;
  
  defender.board = normalizeBoard(defender.board);

  if (pattern === "front") {
    const target = defender.board[slotIdx];
    if (target) {
      target.health = Math.max(0, target.health - dmg);
      logs.push(`⚔️ ${card.name} → ${target.name} (-${dmg} ❤️)`);
    } else {
      defender.hp = Math.max(0, defender.hp - dmg);
      logs.push(`💥 ${card.name} → Vida directa (-${dmg})`);
    }
  } else if (pattern === "adjacent") {
    // Ataca a los lados (izquierda slotIdx-1 y derecha slotIdx+1)
    const sides = [slotIdx - 1, slotIdx + 1];
    
    sides.forEach(sIdx => {
      // Si el carril está dentro del tablero
      if (sIdx >= 0 && sIdx < 5) {
        const target = defender.board[sIdx];
        if (target) {
          target.health = Math.max(0, target.health - dmg);
          logs.push(`↔️ ${card.name} (Lado) → ${target.name} (-${dmg} ❤️)`);
        } else {
          // Si no hay carta en el lado, va directo al rival
          defender.hp = Math.max(0, defender.hp - dmg);
          logs.push(`💥 ${card.name} (Lado Vacío) → Vida directa (-${dmg})`);
        }
      } else {
        // Fuera de los límites del tablero (bordes izquierdo/derecho) también hace daño directo
        defender.hp = Math.max(0, defender.hp - dmg);
        logs.push(`💥 ${card.name} (Borde) → Vida directa (-${dmg})`);
      }
    });
  } else if (pattern === "right") {
    const tIdx = slotIdx + 1 < 5 ? slotIdx + 1 : slotIdx;
    const target = defender.board[tIdx];
    if (target) {
      target.health = Math.max(0, target.health - dmg);
      logs.push(`➡️ ${card.name} → ${target.name} (-${dmg} ❤️)`);
    } else {
      defender.hp = Math.max(0, defender.hp - dmg);
      logs.push(`💥 ${card.name} → Vida directa (-${dmg})`);
    }
  }
}



// ==========================================================================
// ACCIONES DEL JUGADOR
// ==========================================================================

function drawCard(type) {
  if (!activeBattle || activeBattle.phase !== "placement") return;
  const me = getMyData();

  if (me.hasDrawn) {
    alert("Ya has robado una carta en esta ronda.");
    return;
  }

  if (type === "deck") {
    // Si la baraja se queda sin cartas, la regeneramos a partir de su baraja original (las 10 cartas) para no perder sus propias cartas
    if (!me.deck || me.deck.length === 0) {
      const orig = me.originalDeck || [];
      if (orig.length > 0) {
        // Clonar y re-mezclar para el mazo activo
        const prefix = localRole === "player1" ? "p1" : "p2";
        const reshuffled = orig.map((c, i) => {
          return { ...c, instanceId: `${prefix}_reshuffled_${c.id}_${i}_${Math.random().toString(36).slice(2)}` };
        });
        shuffle(reshuffled);
        me.deck = reshuffled;
        alert("🔄 ¡Tu baraja se ha reciclado a partir de tus 10 cartas originales!");
      } else {
        // Fallback de seguridad si no hay originalDeck (usa solo DEFAULT_CARDS que sí es global)
        const allCards = DEFAULT_CARDS || [];
        const prefix = localRole === "player1" ? "p1" : "p2";
        const newCards = [];
        for (let i = 0; i < 5; i++) {
          const rc = allCards[Math.floor(Math.random() * allCards.length)];
          newCards.push({ ...rc, instanceId: `${prefix}_replenished_${rc.id}_${Math.random().toString(36).slice(2)}` });
        }
        me.deck = newCards;
      }
    }
    me.hand.push(me.deck.shift());
  } else {


    // Validar ronda par para cartas de apoyo
    if (activeBattle.round % 2 !== 0) {
      alert("Las cartas de apoyo solo se pueden robar en rondas pares (cada 2 rondas).");
      return;
    }

    const pool = activeBattle.supportPool || [];
    if (pool.length === 0) {
      alert("No quedan cartas de apoyo en la partida.");
      return;
    }
    const idx = Math.floor(Math.random() * pool.length);
    me.hand.push({ ...pool[idx], instanceId: `drawn_${Math.random()}` });
  }

  me.hasDrawn = true;
  pushMyUpdate(me);
}



function playCardToSlot(cardInstanceId, slotIndex) {
  if (!activeBattle || activeBattle.phase !== "placement") return;
  const me = getMyData();

  const cardIdx = (me.hand || []).findIndex(c => c && c.instanceId === cardInstanceId);
  if (cardIdx === -1) return;
  const card = me.hand[cardIdx];

  if (me.energy < card.cost) {
    alert(`Sin monedas suficientes. Costo: 🪙${card.cost} | Tienes: 🪙${me.energy}`);
    return;
  }

  // Normalizar el board antes de leer para evitar problemas con Firebase
  const currentBoard = normalizeBoard(me.board);
  if (currentBoard[slotIndex]) {
    alert("Este carril ya está ocupado.");
    return;
  }

  me.energy -= card.cost;
  me.hand.splice(cardIdx, 1);
  currentBoard[slotIndex] = card;
  // Serializar como objeto con claves string para Firebase
  me.board = serializeBoard(currentBoard);
  activeBattle.combatLog = `${me.username} colocó [${card.name}] en el carril ${slotIndex + 1}.`;

  pushMyUpdate(me);
}


function endPlacementPhase() {
  if (!activeBattle || activeBattle.phase !== "placement") return;
  const me = getMyData();

  if (!me.hasDrawn) {
    alert("Primero debes robar una carta.");
    return;
  }
  if (me.ready) return;

  me.ready = true;
  activeBattle.combatLog = `¡${me.username} está listo! Esperando al rival...`;
  pushMyUpdate(me);
}

function concedeGame() {
  if (!activeBattle) return;
  if (!confirm("¿Seguro que quieres rendirte?")) return;
  const me = getMyData();
  const opp = getOppData();

  db.ref(`battles/${activeBattle.id}`).update({
    gameEnded: true,
    winner: opp.username,
    combatLog: `🏳️ ${me.username} se rindió. ¡Victoria para ${opp.username}!`
  });
}

// ==========================================================================
// HELPERS DE DATOS
// ==========================================================================

function getMyData() {
  return localRole === "player1" ? activeBattle.player1 : activeBattle.player2;
}

function getOppData() {
  return localRole === "player1" ? activeBattle.player2 : activeBattle.player1;
}

function pushMyUpdate(me) {
  if (!activeBattle) return;
  const field = localRole === "player1" ? "player1" : "player2";
  db.ref(`battles/${activeBattle.id}`).update({
    [field]: me,
    combatLog: activeBattle.combatLog
  });
}

// ==========================================================================
// RENDER PRINCIPAL
// ==========================================================================

function renderBattle() {
  if (!activeBattle) return;

  const myData = getMyData();
  const oppData = getOppData();
  const phase = activeBattle.phase;
  const isRevealing = phase === "revealing" || phase === "combat";

  // Normalizar boards (por si Firebase los devuelve como objetos)
  const myBoard = normalizeBoard(myData.board);
  const oppBoard = normalizeBoard(oppData.board);

  // Nombres y estadísticas
  document.getElementById("player-name-display").textContent = `${myData.username} (Tú)`;
  document.getElementById("enemy-name-display").textContent = oppData.username;

  const myHp = Math.max(0, myData.hp);
  const oppHp = Math.max(0, oppData.hp);
  document.getElementById("player-health-text").textContent = `${myHp}/100`;
  document.getElementById("player-health-bar").style.width = `${myHp}%`;
  document.getElementById("enemy-health-text").textContent = `${oppHp}/100`;
  document.getElementById("enemy-health-bar").style.width = `${oppHp}%`;

  document.getElementById("player-energy-text").textContent = `${myData.energy}/${activeBattle.round}`;
  document.getElementById("enemy-energy-text").textContent = `${oppData.energy}/${activeBattle.round}`;

  // Log de combate
  const logEl = document.getElementById("combat-status-log");
  logEl.textContent = activeBattle.combatLog;
  if (phase === "revealing") {
    logEl.style.color = "var(--neon-pink)";
    logEl.classList.add("combat-reveal-anim");
  } else {
    logEl.style.color = "";
    logEl.classList.remove("combat-reveal-anim");
  }

  // Controles de robo
  const drawPhase = document.getElementById("draw-phase-controls");
  const btnDeck = document.getElementById("btn-draw-deck");
  const btnSupport = document.getElementById("btn-draw-support");
  const endBtn = document.getElementById("btn-end-turn");

  const isPlacing = phase === "placement";
  const isEvenRound = activeBattle.round % 2 === 0;

  // Actualizar etiquetas indicativas en los botones
  btnDeck.textContent = "🎴 Robar de Baraja Inicial";
  btnSupport.textContent = isEvenRound ? "🔮 Robar Carta de Apoyo" : "🔒 Apoyo (Rondas Pares)";

  if (!isPlacing || myData.hasDrawn) {
    drawPhase.style.opacity = "0.4";
    btnDeck.disabled = true;
    btnSupport.disabled = true;
  } else {
    drawPhase.style.opacity = "1";
    btnDeck.disabled = false;
    // El botón de apoyo se habilita solo en rondas pares
    btnSupport.disabled = !isEvenRound;
    if (!isEvenRound) {
      btnSupport.style.opacity = "0.5";
    } else {
      btnSupport.style.opacity = "1";
    }
  }

  if (myData.ready || !isPlacing) {

    endBtn.disabled = true;
    endBtn.textContent = isRevealing ? "⚔️ ¡Combatiendo!" : "Esperando al rival...";
  } else {
    endBtn.disabled = !myData.hasDrawn;
    endBtn.textContent = "Finalizar Colocación";
  }

  // Tableros
  renderHand(myData.hand || [], myData.energy);
  renderBoardSlots("player-board", myBoard, true, isRevealing);
  renderBoardSlots("enemy-board", oppBoard, false, isRevealing);
}

// ==========================================================================
// RENDER DE COMPONENTES
// ==========================================================================

function renderHand(hand, energy) {
  const container = document.getElementById("player-hand");
  container.innerHTML = "";

  hand.forEach(card => {
    if (!card) return;
    const el = document.createElement("div");
    el.className = `game-card rarity-${card.rarity}`;
    el.draggable = true;
    el.dataset.instanceId = card.instanceId;

    const canPlay = energy >= card.cost;
    if (!canPlay) {
      el.classList.add("unplayable");
      el.style.cursor = "not-allowed";
    }

    el.innerHTML = buildCardHTML(card, energy);

    el.addEventListener("click", () => {
      if (!canPlay) { alert(`Sin monedas. Necesitas 🪙${card.cost}, tienes 🪙${energy}`); return; }
      document.querySelectorAll("#player-hand .game-card").forEach(c => c.classList.remove("selected-for-play"));
      el.classList.add("selected-for-play");
      dragSelectedCardId = card.instanceId;
    });

    el.addEventListener("dragstart", (e) => {
      if (!canPlay) { e.preventDefault(); return; }
      e.dataTransfer.setData("text/plain", card.instanceId);
      dragSelectedCardId = card.instanceId;
    });

    container.appendChild(el);
  });
}

function renderBoardSlots(boardId, slots, isMyBoard, revealed) {
  const board = document.getElementById(boardId);
  const slotEls = board.querySelectorAll(".board-slot");

  slots.forEach((card, idx) => {
    const slot = slotEls[idx];
    slot.innerHTML = "";

    if (card) {
      if (!isMyBoard && !revealed) {
        // NIEBLA DE GUERRA: carta oculta
        const hidden = document.createElement("div");
        hidden.className = "game-card card-back-cyber";
        hidden.innerHTML = `
          <div style="font-size:2rem; margin-bottom:8px;">❓</div>
          <div style="font-size:0.7rem; color:var(--neon-pink); font-family:var(--font-title);">OCULTO</div>
          <div style="font-size:0.55rem; color:var(--text-muted); margin-top:6px;">Carta posicionada</div>
        `;
        slot.appendChild(hidden);
      } else {
        // Carta revelada
        const el = document.createElement("div");
        el.className = `game-card rarity-${card.rarity}`;
        if (revealed && !isMyBoard) el.classList.add("card-reveal-anim");
        el.innerHTML = buildCardHTML(card);
        slot.appendChild(el);
      }
    } else {
      const emptyEl = document.createElement("div");
      emptyEl.className = "board-slot-label";
      emptyEl.textContent = isMyBoard ? "COLOCAR" : "VACÍO";
      slot.appendChild(emptyEl);
    }
  });
}

function buildCardHTML(card) {
  const patternMap = { front: "⬆️ FRENTE", adjacent: "↔️ LADOS", right: "➡️ DERECHA", defense: "🛡️ DEFENSA" };
  const rarityMap = { common: "Común", rare: "Rara", epic: "Épica", legendary: "Legendaria" };

  return `
    <div class="card-cost">${card.cost}</div>
    <div class="card-rarity-badge">${rarityMap[card.rarity] || card.rarity}</div>
    <div class="card-name" style="color:#fff;">${card.name}</div>
    <div class="card-illustration">${card.isSupport ? "🛡️" : "⚔️"}</div>
    <div class="card-desc-tooltip">${card.description || "Carta crossover."}</div>
    <div class="card-stats">
      <div class="stat">⚔️ ${card.attack}</div>
      <div class="stat">❤️ ${card.health}</div>
    </div>
    <div class="card-footer-info">
      <span class="pattern-badge">${patternMap[card.pattern] || card.pattern}</span>
    </div>
  `;
}

// ==========================================================================
// DRAG & DROP Y CONTROLES
// ==========================================================================

function setupBattleControls() {
  document.getElementById("btn-draw-deck").onclick = () => drawCard("deck");
  document.getElementById("btn-draw-support").onclick = () => drawCard("support");
  document.getElementById("btn-end-turn").onclick = endPlacementPhase;
  document.getElementById("btn-concede").onclick = concedeGame;
  setupDragAndDrop();
}

function setupDragAndDrop() {
  const slots = document.querySelectorAll("#player-board .board-slot");
  slots.forEach(slot => {
    slot.addEventListener("dragover", e => { e.preventDefault(); slot.classList.add("hovered"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("hovered"));
    slot.addEventListener("drop", e => {
      e.preventDefault();
      slot.classList.remove("hovered");
      const id = e.dataTransfer.getData("text/plain") || dragSelectedCardId;
      if (id) playCardToSlot(id, parseInt(slot.getAttribute("data-slot")));
    });
    slot.addEventListener("click", () => {
      if (dragSelectedCardId) {
        playCardToSlot(dragSelectedCardId, parseInt(slot.getAttribute("data-slot")));
        dragSelectedCardId = null;
      }
    });
  });
}

// ==========================================================================
// FIN DE JUEGO
// ==========================================================================

function handleGameEnd() {
  if (!activeBattle) return;
  const winner = activeBattle.winner || "Empate";
  const battleId = activeBattle.id;
  const msg = `🏆 DUELO FINALIZADO\n\nGanador: ${winner}\n\nRegresando al lobby...`;

  // Desconectar listener inmediatamente para evitar re-disparos
  if (battleListenerRef) {
    battleListenerRef.off();
    battleListenerRef = null;
  }

  // Mostrar resultado con delay para que la animación de revelación sea visible
  setTimeout(() => {
    alert(msg);
    if (localRole === "player1") {
      db.ref(`battles/${battleId}`).remove().catch(() => {});
    }
    activeBattle = null;
    combatProcessed = false;
    gameEndHandled = false;
    showScreen("screen-lobby");
  }, 1800);
}

// ==========================================================================
// UTILIDADES
// ==========================================================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
