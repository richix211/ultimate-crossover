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

// Convierte lo que Firebase devuelve (puede ser objeto sparse) en un array limpio de 5 slots
function normalizeBoard(board) {
  const result = [null, null, null, null, null];
  if (!board) return result;
  for (let i = 0; i < 5; i++) {
    const val = board[i] || board[String(i)];
    result[i] = (val && typeof val === 'object' && val.id) ? val : null;
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

  battleListenerRef.on("value", (snap) => {
    if (!snap.exists()) return;
    const data = snap.val();
    if (!data || !data.player1 || !data.player2) return;

    activeBattle = data;

    // Renderizar siempre el estado actual
    renderBattle();

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

function transitionToRevealPhase() {
  // Fase de revelación: mostrar cartas de ambos 1.5s antes de combate
  activeBattle.phase = "revealing";
  activeBattle.combatLog = "⚔️ ¡Revelando posiciones! El combate comienza...";
  db.ref(`battles/${activeBattle.id}`).update({
    phase: "revealing",
    combatLog: activeBattle.combatLog
  }, () => {
    // Después de 2 segundos, ejecutar el combate
    setTimeout(executeCombatPhase, 2000);
  });
}

function executeCombatPhase() {
  if (!activeBattle) return;
  const p1 = JSON.parse(JSON.stringify(activeBattle.player1));
  const p2 = JSON.parse(JSON.stringify(activeBattle.player2));

  // CRÍTICO: normalizar los boards a arrays limpios de 5 elementos
  // Firebase puede devolver arrays con nulls como objetos sparse {"0": card, "2": card}
  p1.board = normalizeBoard(p1.board);
  p2.board = normalizeBoard(p2.board);

  const logs = [];

  // Aplicar ataques de cada carril
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

  // Eliminar cartas destruidas (vida <= 0)
  for (let i = 0; i < 5; i++) {
    if (p1.board[i] && p1.board[i].health <= 0) {
      logs.push(`💀 ${p1.board[i].name} (J1) fue destruida.`);
      p1.board[i] = null;
    }
    if (p2.board[i] && p2.board[i].health <= 0) {
      logs.push(`💀 ${p2.board[i].name} (J2) fue destruida.`);
      p2.board[i] = null;
    }
  }

  p1.hp = Math.max(0, p1.hp);
  p2.hp = Math.max(0, p2.hp);

  // Convertir board a formato aceptado por Firebase (sin nulls como objeto)
  p1.board = serializeBoard(p1.board);
  p2.board = serializeBoard(p2.board);

  // Verificar ganador
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
    // Avanzar a siguiente ronda
    const nextRound = activeBattle.round + 1;
    p1.energy = nextRound;
    p2.energy = nextRound;
    p1.ready = false;
    p2.ready = false;
    p1.hasDrawn = false;
    p2.hasDrawn = false;

    // Limpiar tablero de cartas restantes (quedan entre rondas)
    // Las cartas en tablero permanecen entre rondas (diseño estratégico)

    db.ref(`battles/${activeBattle.id}`).update({
      phase: "placement",
      round: nextRound,
      player1: p1,
      player2: p2,
      combatLog: `Ronda ${nextRound} — ${finalLog || "¡Preparate para la siguiente ronda!"}`,
      gameEnded: false,
      winner: null
    }, () => {
      combatProcessed = false; // Permitir siguiente ronda
    });
  }
}

function applyAttack(card, slotIdx, defender, logs, pattern, isP1Attacker) {
  if (!card || card.attack <= 0) return;
  const dmg = card.attack;
  if (!defender.board) defender.board = [null, null, null, null, null];
  // Sanitizar board: asegurar que tiene exactamente 5 posiciones
  while (defender.board.length < 5) defender.board.push(null);

  if (pattern === "front") {
    const target = defender.board[slotIdx];
    if (target) {
      target.health -= dmg;
      logs.push(`⚔️ ${card.name} → ${target.name} (-${dmg} ❤️)`);
    } else {
      defender.hp -= dmg;
      logs.push(`💥 ${card.name} → Vida directa (-${dmg})`);
    }
  } else if (pattern === "adjacent") {
    const targets = [slotIdx - 1, slotIdx, slotIdx + 1];
    let hit = false;
    targets.forEach(tIdx => {
      if (tIdx >= 0 && tIdx < 5 && defender.board[tIdx]) {
        defender.board[tIdx].health -= dmg;
        logs.push(`↔️ ${card.name} → ${defender.board[tIdx].name} (-${dmg} ❤️)`);
        hit = true;
      }
    });
    if (!hit) {
      defender.hp -= dmg;
      logs.push(`💥 ${card.name} → Vida directa (-${dmg})`);
    }
  } else if (pattern === "right") {
    const tIdx = slotIdx + 1 < 5 ? slotIdx + 1 : slotIdx;
    const target = defender.board[tIdx];
    if (target) {
      target.health -= dmg;
      logs.push(`➡️ ${card.name} → ${target.name} (-${dmg} ❤️)`);
    } else {
      defender.hp -= dmg;
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
    if (!me.deck || me.deck.length === 0) {
      alert("Tu baraja está vacía.");
      return;
    }
    me.hand.push(me.deck.shift());
  } else {
    if (!activeBattle.supportPool || activeBattle.supportPool.length === 0) {
      alert("No quedan cartas de apoyo.");
      return;
    }
    const idx = Math.floor(Math.random() * activeBattle.supportPool.length);
    me.hand.push({ ...activeBattle.supportPool[idx], instanceId: `drawn_${Math.random()}` });
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

  if (!isPlacing || myData.hasDrawn) {
    drawPhase.style.opacity = "0.4";
    btnDeck.disabled = true;
    btnSupport.disabled = true;
  } else {
    drawPhase.style.opacity = "1";
    btnDeck.disabled = false;
    btnSupport.disabled = false;
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
