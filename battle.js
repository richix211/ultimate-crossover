// ==========================================================================
// BATTLE.JS - SISTEMA DE COMBATE ONLINE BLINDADO CON NIEBLA DE GUERRA
// ==========================================================================

let activeBattle = null;
let localRole = null; // "player1" o "player2"
let dragSelectedCardId = null;
let battleListenerRef = null;
let isProcessingCombatLocal = false;

// --- INICIAR SALA DE BATALLA ONLINE ---
function initiateBattleRoom(duelData, role) {
  localRole = role;
  const battleId = duelData.id;
  isProcessingCombatLocal = false;

  db.ref(`duels`).off();

  if (role === "player1") {
    db.ref(`users`).once("value", (usersSnapshot) => {
      if (!usersSnapshot.exists()) {
        alert("Error al cargar los usuarios.");
        showScreen("screen-lobby");
        return;
      }

      const usersData = usersSnapshot.val();
      const p1User = usersData[duelData.from];
      const p2User = usersData[duelData.to];

      if (!p1User || !p2User) {
        alert("Error: Jugador no encontrado.");
        showScreen("screen-lobby");
        return;
      }

      const allCards = [...DEFAULT_CARDS, ...customCards];

      const p1ActiveDeck = p1User.decks[p1User.activeDeckIdx || 0] || p1User.decks[0];
      const p2ActiveDeck = p2User.decks[p2User.activeDeckIdx || 0] || p2User.decks[0];

      const p1Deck = (p1ActiveDeck.cards || []).map(id => ({ 
        ...allCards.find(c => c.id === id), 
        instanceId: `p1_${id}_${Math.random()}` 
      }));
      const p2Deck = (p2ActiveDeck.cards || []).map(id => ({ 
        ...allCards.find(c => c.id === id), 
        instanceId: `p2_${id}_${Math.random()}` 
      }));

      const p1Supp = p1ActiveDeck.support || [];
      const p2Supp = p2ActiveDeck.support || [];

      const supportPool = [
        ...p1Supp.map(id => ({ ...allCards.find(c => c.id === id), instanceId: `supp_p1_${id}_${Math.random()}` })),
        ...p2Supp.map(id => ({ ...allCards.find(c => c.id === id), instanceId: `supp_p2_${id}_${Math.random()}` }))
      ];

      shuffle(p1Deck);
      shuffle(p2Deck);

      activeBattle = {
        id: battleId,
        player1: {
          username: p1User.username,
          hp: 100,
          energy: 1,
          deck: p1Deck,
          hand: [],
          board: [null, null, null, null, null],
          ready: false,
          hasDrawn: false
        },
        player2: {
          username: p2User.username,
          hp: 100,
          energy: 1,
          deck: p2Deck,
          hand: [],
          board: [null, null, null, null, null],
          ready: false,
          hasDrawn: false
        },
        supportPool: supportPool,
        round: 1,
        combatLog: "¡Comienza el duelo! Ronda 1: Roba una carta.",
        gameEnded: false,
        winner: null
      };

      for (let i = 0; i < 3; i++) {
        if (activeBattle.player1.deck.length > 0) activeBattle.player1.hand.push(activeBattle.player1.deck.shift());
        if (activeBattle.player2.deck.length > 0) activeBattle.player2.hand.push(activeBattle.player2.deck.shift());
      }

      db.ref(`battles/${battleId}`).set(activeBattle, () => {
        setupBattleFirebaseSync(battleId);
      });
    });
  } else {
    setupBattleFirebaseSync(battleId);
  }

  showScreen("screen-battle");
}

// --- SINCRONIZACIÓN ONLINE DE LA BATALLA ---
function setupBattleFirebaseSync(battleId) {
  battleListenerRef = db.ref(`battles/${battleId}`);
  battleListenerRef.on("value", (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (!data.player1 || !data.player2 || !data.supportPool) return;

      activeBattle = data;
      renderBattleScreen();

      // Si ambos jugadores marcaron listo, el Player 1 corre los cálculos
      if (localRole === "player1" && activeBattle.player1.ready && activeBattle.player2.ready && !activeBattle.gameEnded && !isProcessingCombatLocal) {
        isProcessingCombatLocal = true;
        setTimeout(processCombatPhase, 1200);
      }
    }
  });

  setupDragAndDrop();

  document.getElementById("btn-draw-deck").onclick = () => drawCard("deck");
  document.getElementById("btn-draw-support").onclick = () => drawCard("support");
  document.getElementById("btn-end-turn").onclick = endPlacementPhase;
  document.getElementById("btn-concede").onclick = concedeGame;
}

// --- ACCIONES DE COMBATE ---
function drawCard(type) {
  if (!activeBattle) return;
  const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;
  
  if (me.hasDrawn) {
    alert("Ya has robado una carta en esta ronda.");
    return;
  }

  if (!me.hand) me.hand = [];
  if (!me.deck) me.deck = [];

  if (type === "deck") {
    if (me.deck.length > 0) {
      me.hand.push(me.deck.shift());
    } else {
      alert("No te quedan cartas en tu baraja principal.");
      return;
    }
  } else if (type === "support") {
    if (activeBattle.supportPool && activeBattle.supportPool.length > 0) {
      const idx = Math.floor(Math.random() * activeBattle.supportPool.length);
      const drawn = { ...activeBattle.supportPool[idx], instanceId: `supp_drawn_${Math.random()}` };
      me.hand.push(drawn);
    } else {
      alert("No quedan cartas de apoyo.");
      return;
    }
  }

  if (activeBattle.round > 1 && activeBattle.round % 2 === 1 && type === "deck") {
    if (activeBattle.supportPool && activeBattle.supportPool.length > 0) {
      const idx = Math.floor(Math.random() * activeBattle.supportPool.length);
      const autoDrawn = { ...activeBattle.supportPool[idx], instanceId: `supp_auto_${Math.random()}` };
      me.hand.push(autoDrawn);
      activeBattle.combatLog = `¡Bono de apoyo! ${me.username} recibe una carta de apoyo adicional.`;
    }
  }

  me.hasDrawn = true;
  updateBattleState();
}

function playCardToSlot(cardInstanceId, slotIndex) {
  if (!activeBattle) return;
  const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;

  if (!me.hand) return;
  const cardIdx = me.hand.findIndex(c => c.instanceId === cardInstanceId);
  if (cardIdx === -1) return;
  const card = me.hand[cardIdx];

  // VALIDACIÓN ESTRICTA DE COSTO
  if (me.energy < card.cost) {
    alert(`No tienes monedas suficientes para colocar esta carta. Costo: ${card.cost} | Monedas: ${me.energy}`);
    return;
  }

  if (!me.board) me.board = [null, null, null, null, null];
  if (me.board[slotIndex] !== null && me.board[slotIndex] !== undefined) {
    alert("Este carril ya está ocupado.");
    return;
  }

  me.energy -= card.cost;
  me.hand.splice(cardIdx, 1);
  me.board[slotIndex] = card;

  activeBattle.combatLog = `${me.username} colocó a [${card.name}] en el carril ${slotIndex + 1}.`;
  updateBattleState();
}

function endPlacementPhase() {
  if (!activeBattle) return;
  const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;

  if (!me.hasDrawn) {
    alert("Primero debes robar una carta.");
    return;
  }

  me.ready = true;
  activeBattle.combatLog = `¡${me.username} está listo! Esperando a que el rival finalice su fase...`;
  
  updateBattleState();
}

function concedeGame() {
  if (!activeBattle) return;
  if (confirm("¿Estás seguro de que quieres rendirte?")) {
    const opponent = localRole === "player1" ? activeBattle.player2 : activeBattle.player1;
    const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;

    activeBattle.gameEnded = true;
    activeBattle.winner = opponent.username;
    activeBattle.combatLog = `¡${me.username} se rindió! Victoria para ${opponent.username}.`;
    updateBattleState();
  }
}

function updateBattleState() {
  if (!activeBattle) return;
  db.ref(`battles/${activeBattle.id}`).set(activeBattle);
}

// --- PROCESAR FASE DE COMBATE (EJECUTADO POR JUGADOR 1 EN LA NUBE) ---
function processCombatPhase() {
  if (!activeBattle) return;
  const p1 = activeBattle.player1;
  const p2 = activeBattle.player2;

  // ROMPER RECURSIÓN
  p1.ready = false;
  p2.ready = false;

  let log = `Ronda ${activeBattle.round} - Combate finalizado. \n`;

  if (!p1.board) p1.board = [null, null, null, null, null];
  if (!p2.board) p2.board = [null, null, null, null, null];

  // Aplicar ataques
  for (let i = 0; i < 5; i++) {
    const cardP1 = p1.board[i];
    const cardP2 = p2.board[i];

    if (cardP1 && cardP1.attack > 0 && cardP1.pattern !== "defense") {
      executeCardAttack(cardP1, i, p1, p2);
    }
    if (cardP2 && cardP2.attack > 0 && cardP2.pattern !== "defense") {
      executeCardAttack(cardP2, i, p2, p1);
    }
  }

  // Limpiar destruidos
  for (let i = 0; i < 5; i++) {
    if (p1.board[i] && p1.board[i].health <= 0) p1.board[i] = null;
    if (p2.board[i] && p2.board[i].health <= 0) p2.board[i] = null;
  }

  // Comprobar ganador
  if (p1.hp <= 0 && p2.hp <= 0) {
    activeBattle.gameEnded = true;
    activeBattle.winner = "Empate";
    activeBattle.combatLog = "¡Es un empate! Ambos cayeron en la batalla.";
  } else if (p1.hp <= 0) {
    activeBattle.gameEnded = true;
    activeBattle.winner = p2.username;
    activeBattle.combatLog = `¡Victoria para ${p2.username}!`;
  } else if (p2.hp <= 0) {
    activeBattle.gameEnded = true;
    activeBattle.winner = p1.username;
    activeBattle.combatLog = `¡Victoria para ${p1.username}!`;
  } else {
    // Siguiente Ronda
    activeBattle.round++;
    p1.energy = activeBattle.round;
    p2.energy = activeBattle.round;
    p1.ready = false;
    p2.ready = false;
    p1.hasDrawn = false;
    p2.hasDrawn = false;
    activeBattle.combatLog = `Comienza la ronda ${activeBattle.round}. Monedas restablecidas a ${activeBattle.round}.`;
  }

  isProcessingCombatLocal = false;
  updateBattleState();
}

function executeCardAttack(card, slotIdx, attacker, defender) {
  const dmg = card.attack;
  if (!defender.board) defender.board = [null, null, null, null, null];

  if (card.pattern === "front") {
    const target = defender.board[slotIdx];
    if (target) target.health -= dmg;
    else defender.hp = Math.max(0, defender.hp - dmg);
  } else if (card.pattern === "adjacent") {
    const targets = [slotIdx - 1, slotIdx, slotIdx + 1];
    let hit = false;
    targets.forEach(tIdx => {
      if (tIdx >= 0 && tIdx < 5) {
        const target = defender.board[tIdx];
        if (target) {
          target.health -= dmg;
          hit = true;
        }
      }
    });
    if (!defender.board[slotIdx]) {
      defender.hp = Math.max(0, defender.hp - dmg);
    }
  } else if (card.pattern === "right") {
    const targetIdx = slotIdx + 1;
    if (targetIdx < 5) {
      const target = defender.board[targetIdx];
      if (target) target.health -= dmg;
      else defender.hp = Math.max(0, defender.hp - dmg);
    } else {
      const target = defender.board[slotIdx];
      if (target) target.health -= dmg;
      else defender.hp = Math.max(0, defender.hp - dmg);
    }
  }
}

// --- RENDERIZAR TABLERO ---
function renderBattleScreen() {
  if (!activeBattle) return;

  const isP1 = localRole === "player1";
  const myData = isP1 ? activeBattle.player1 : activeBattle.player2;
  const oppData = isP1 ? activeBattle.player2 : activeBattle.player1;

  document.getElementById("player-name-display").textContent = `${myData.username} (Tú)`;
  document.getElementById("enemy-name-display").textContent = oppData.username;

  document.getElementById("player-health-text").textContent = `${myData.hp}/100`;
  document.getElementById("player-health-bar").style.width = `${myData.hp}%`;
  
  document.getElementById("enemy-health-text").textContent = `${oppData.hp}/100`;
  document.getElementById("enemy-health-bar").style.width = `${oppData.hp}%`;

  document.getElementById("player-energy-text").textContent = `${myData.energy}/${activeBattle.round}`;
  document.getElementById("enemy-energy-text").textContent = `${oppData.energy}/${activeBattle.round}`;

  document.getElementById("combat-status-log").textContent = activeBattle.combatLog;

  const drawControls = document.getElementById("draw-phase-controls");
  if (myData.hasDrawn) {
    drawControls.style.opacity = "0.5";
    document.getElementById("btn-draw-deck").disabled = true;
    document.getElementById("btn-draw-support").disabled = true;
  } else {
    drawControls.style.opacity = "1";
    document.getElementById("btn-draw-deck").disabled = false;
    document.getElementById("btn-draw-support").disabled = false;
  }

  const endBtn = document.getElementById("btn-end-turn");
  if (myData.ready) {
    endBtn.disabled = true;
    endBtn.textContent = "Esperando al rival...";
  } else {
    endBtn.disabled = !myData.hasDrawn;
    endBtn.textContent = "Finalizar Fase de Colocación";
  }

  renderPlayerHand(myData.hand || [], myData.energy);
  renderBoard(document.getElementById("player-board"), myData.board || [null, null, null, null, null], true);
  renderBoard(document.getElementById("enemy-board"), oppData.board || [null, null, null, null, null], false);

  if (activeBattle.gameEnded) {
    alert(`¡DUELO FINALIZADO! Ganador: ${activeBattle.winner}`);
    if (battleListenerRef) {
      battleListenerRef.off();
    }
    db.ref(`battles/${activeBattle.id}`).remove();
    showScreen("screen-lobby");
  }
}

// --- RENDERIZAR COMPONENTES ---
function renderPlayerHand(hand, myEnergy) {
  const container = document.getElementById("player-hand");
  container.innerHTML = "";

  hand.forEach(card => {
    if (!card) return;
    const cardDiv = document.createElement("div");
    cardDiv.className = `game-card rarity-${card.rarity}`;
    cardDiv.draggable = true;
    cardDiv.dataset.instanceId = card.instanceId;

    // Feedback visual si no tienes monedas suficientes
    if (myEnergy < card.cost) {
      cardDiv.style.opacity = "0.4";
      cardDiv.style.cursor = "not-allowed";
      cardDiv.classList.add("unplayable");
    } else {
      cardDiv.style.opacity = "1";
      cardDiv.style.cursor = "pointer";
    }

    cardDiv.innerHTML = `
      <div class="card-cost">${card.cost}</div>
      <div class="card-name" style="color:#fff;">${card.name}</div>
      <div class="card-illustration">${card.isSupport ? "🛡️" : "⚔️"}</div>
      <div class="card-desc-tooltip">${card.description || "Carta crossover."}</div>
      <div class="card-stats">
        <div class="stat">⚔️ ${card.attack}</div>
        <div class="stat">❤️ ${card.health}</div>
      </div>
    `;

    cardDiv.addEventListener("click", () => {
      if (myEnergy < card.cost) return; // Bloquear clic
      document.querySelectorAll("#player-hand .game-card").forEach(c => c.classList.remove("selected-for-play"));
      cardDiv.classList.add("selected-for-play");
      dragSelectedCardId = card.instanceId;
    });

    cardDiv.addEventListener("dragstart", (e) => {
      if (myEnergy < card.cost) {
        e.preventDefault(); // Impedir arrastre si no hay fondos
        return;
      }
      e.dataTransfer.setData("text/plain", card.instanceId);
      dragSelectedCardId = card.instanceId;
    });

    container.appendChild(cardDiv);
  });
}

function renderBoard(boardContainer, slotsArray, isPlayerBoard) {
  const slotsElements = boardContainer.querySelectorAll(".board-slot");
  
  // Niebla de Guerra: Ocultar hasta que ambos terminen su colocación
  const bothReady = activeBattle.player1.ready && activeBattle.player2.ready;

  slotsArray.forEach((card, idx) => {
    const slot = slotsElements[idx];
    slot.innerHTML = "";

    if (card) {
      // Si es el tablero enemigo y no han finalizado la fase, se muestra cubierto (Niebla de Guerra)
      if (!isPlayerBoard && !bothReady) {
        const coveredCard = document.createElement("div");
        coveredCard.className = `game-card rarity-common card-back-cyber`;
        coveredCard.innerHTML = `
          <div class="card-name" style="color:var(--neon-pink); font-size:0.75rem; margin-top:20px;">❓ OCULTO</div>
          <div class="card-illustration" style="font-size:1.8rem; margin:15px 0;">🛡️</div>
          <div style="font-size:0.55rem; color:var(--text-muted);">Carta posicionada</div>
        `;
        slot.appendChild(coveredCard);
      } else {
        // Revelado normal
        const cardDiv = document.createElement("div");
        cardDiv.className = `game-card rarity-${card.rarity}`;
        cardDiv.innerHTML = `
          <div class="card-cost">${card.cost}</div>
          <div class="card-name" style="color:#fff;">${card.name}</div>
          <div class="card-illustration">${card.isSupport ? "🛡️" : "⚔️"}</div>
          <div class="card-desc-tooltip">${card.description || "Carta crossover."}</div>
          <div class="card-stats">
            <div class="stat">⚔️ ${card.attack}</div>
            <div class="stat">❤️ ${card.health}</div>
          </div>
        `;
        slot.appendChild(cardDiv);
      }
    } else {
      slot.textContent = isPlayerBoard ? "COLOCAR" : "VACÍO";
    }
  });
}

function setupDragAndDrop() {
  const slots = document.querySelectorAll("#player-board .board-slot");

  slots.forEach(slot => {
    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      slot.classList.add("hovered");
    });

    slot.addEventListener("dragleave", () => {
      slot.classList.remove("hovered");
    });

    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("hovered");
      const instanceId = e.dataTransfer.getData("text/plain") || dragSelectedCardId;
      const slotIndex = parseInt(slot.getAttribute("data-slot"));

      if (instanceId) {
        playCardToSlot(instanceId, slotIndex);
      }
    });

    slot.addEventListener("click", () => {
      if (dragSelectedCardId) {
        const slotIndex = parseInt(slot.getAttribute("data-slot"));
        playCardToSlot(dragSelectedCardId, slotIndex);
        dragSelectedCardId = null;
      }
    });
  });
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
