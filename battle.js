// ==========================================================================
// BATTLE.JS - LÓGICA DE COMBATE Y SINCRONIZACIÓN MULTIJUGADOR REAL (CROSS-TAB)
// ==========================================================================

let activeBattle = null;
let localRole = null; // "player1" o "player2"
let dragSelectedCardId = null;

// --- INICIAR SALA DE BATALLA ---
function initiateBattleRoom(duelData, role) {
  localRole = role;
  
  // Si soy el Player 1 (Creador/Retador), inicializo el estado del combate
  if (role === "player1") {
    const users = JSON.parse(localStorage.getItem("uc_users"));
    const p1User = users.find(u => u.username === duelData.from);
    const p2User = users.find(u => u.username === duelData.to);

    // Unir todas las cartas personalizadas y base para buscar datos
    const allCards = [...DEFAULT_CARDS, ...(JSON.parse(localStorage.getItem("uc_custom_cards")) || [])];

    // Baraja inicial de 10 cartas (permitiendo duplicados)
    const p1Deck = p1User.deck.map(id => ({ ...allCards.find(c => c.id === id), instanceId: `p1_${id}_${Math.random()}` }));
    const p2Deck = p2User.deck.map(id => ({ ...allCards.find(c => c.id === id), instanceId: `p2_${id}_${Math.random()}` }));

    // Baraja de apoyo compartida (2 de cada uno = 4 cartas)
    const supportPool = [
      ...p1User.support.map(id => ({ ...allCards.find(c => c.id === id), instanceId: `supp_p1_${id}_${Math.random()}` })),
      ...p2User.support.map(id => ({ ...allCards.find(c => c.id === id), instanceId: `supp_p2_${id}_${Math.random()}` }))
    ];

    // Mezclar mazos iniciales
    shuffle(p1Deck);
    shuffle(p2Deck);

    activeBattle = {
      id: duelData.id,
      player1: {
        username: p1User.username,
        hp: 100,
        energy: 1, // Monedas Ronda 1
        deck: p1Deck,
        hand: [],
        board: [null, null, null, null, null], // 5 slots
        ready: false, // Indica si finalizó colocación en la ronda
        hasDrawn: false // Indica si ya robó en la ronda
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

    // Ambos roban 3 cartas iniciales de su baraja
    for (let i = 0; i < 3; i++) {
      if (activeBattle.player1.deck.length > 0) activeBattle.player1.hand.push(activeBattle.player1.deck.shift());
      if (activeBattle.player2.deck.length > 0) activeBattle.player2.hand.push(activeBattle.player2.deck.shift());
    }

    // Guardar estado inicial en localStorage
    localStorage.setItem("uc_active_battle", JSON.stringify(activeBattle));
  } else {
    // Player 2 espera un segundo a que se cree el objeto de combate
    setTimeout(() => {
      activeBattle = JSON.parse(localStorage.getItem("uc_active_battle"));
      renderBattleScreen();
    }, 200);
  }

  showScreen("screen-battle");
  setupBattleSync();
  renderBattleScreen();
}

// --- SINCRONIZAR EVENTOS DE COMBATE EN TIEMPO REAL ---
function setupBattleSync() {
  window.addEventListener("storage", (e) => {
    if (e.key === "uc_active_battle" && e.newValue) {
      activeBattle = JSON.parse(e.newValue);
      renderBattleScreen();

      // Si ambos jugadores están listos (ready), el Player 1 procesa el combate
      if (localRole === "player1" && activeBattle.player1.ready && activeBattle.player2.ready && !activeBattle.gameEnded) {
        setTimeout(processCombatPhase, 1000);
      }
    }
  });

  // Eventos de arrastrar y soltar (Drag and Drop)
  setupDragAndDrop();

  // Botones de Robo
  document.getElementById("btn-draw-deck").onclick = () => drawCard("deck");
  document.getElementById("btn-draw-support").onclick = () => drawCard("support");

  // Botón Finalizar Turno/Fase
  document.getElementById("btn-end-turn").onclick = endPlacementPhase;

  // Botón Rendirse
  document.getElementById("btn-concede").onclick = concedeGame;
}

// --- ACCIONES DE ROBO DE CARTAS ---
function drawCard(type) {
  const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;
  
  if (me.hasDrawn) {
    alert("Ya has robado una carta en esta ronda.");
    return;
  }

  if (type === "deck") {
    if (me.deck.length > 0) {
      me.hand.push(me.deck.shift());
    } else {
      alert("No te quedan cartas en tu baraja inicial.");
      return;
    }
  } else if (type === "support") {
    if (activeBattle.supportPool.length > 0) {
      // Robar una aleatoria de las 4 compartidas
      const idx = Math.floor(Math.random() * activeBattle.supportPool.length);
      // Clonamos para evitar problemas de referencia
      const drawn = { ...activeBattle.supportPool[idx], instanceId: `supp_drawn_${Math.random()}` };
      me.hand.push(drawn);
    } else {
      alert("No quedan cartas de apoyo.");
      return;
    }
  }

  // Bono automático cada 2 rondas (Ronda 3, 5, 7...) se procesa aquí
  if (activeBattle.round > 1 && activeBattle.round % 2 === 1 && type === "deck") {
    // Si robó de deck principal, le regalamos la de apoyo correspondiente al bono automático
    if (activeBattle.supportPool.length > 0) {
      const idx = Math.floor(Math.random() * activeBattle.supportPool.length);
      const autoDrawn = { ...activeBattle.supportPool[idx], instanceId: `supp_auto_${Math.random()}` };
      me.hand.push(autoDrawn);
      activeBattle.combatLog = `¡Bono de apoyo! ${me.username} recibe una carta de apoyo adicional.`;
    }
  }

  me.hasDrawn = true;
  updateBattleState();
}

// --- COLOCACIÓN DE CARTA ---
function playCardToSlot(cardInstanceId, slotIndex) {
  const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;

  // Buscar carta en mano
  const cardIdx = me.hand.findIndex(c => c.instanceId === cardInstanceId);
  if (cardIdx === -1) return;
  const card = me.hand[cardIdx];

  // Validar Costo de Monedas
  if (me.energy < card.cost) {
    alert("No tienes suficientes monedas para jugar esta carta.");
    return;
  }

  // Validar espacio del tablero vacío
  if (me.board[slotIndex] !== null) {
    alert("Este carril ya está ocupado.");
    return;
  }

  // Descontar coste y posicionar
  me.energy -= card.cost;
  me.hand.splice(cardIdx, 1);
  me.board[slotIndex] = card;

  activeBattle.combatLog = `${me.username} colocó a [${card.name}] en el carril ${slotIndex + 1}.`;
  updateBattleState();
}

// --- FINALIZAR FASE DE COLOCACIÓN ---
function endPlacementPhase() {
  const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;

  if (!me.hasDrawn) {
    alert("Primero debes robar una carta.");
    return;
  }

  me.ready = true;
  activeBattle.combatLog = `¡${me.username} está listo para el combate! Esperando al oponente...`;
  
  updateBattleState();
}

// --- ACTUALIZAR Y GUARDAR ESTADO DE BATALLA ---
function updateBattleState() {
  localStorage.setItem("uc_active_battle", JSON.stringify(activeBattle));
  renderBattleScreen();

  // Si somos Player 1 y ambos listos, procesar el combate directamente
  if (localRole === "player1" && activeBattle.player1.ready && activeBattle.player2.ready && !activeBattle.gameEnded) {
    setTimeout(processCombatPhase, 1000);
  }
}

// --- RENDICIÓN ---
function concedeGame() {
  if (confirm("¿Estás seguro de que quieres rendirte?")) {
    const me = localRole === "player1" ? activeBattle.player1 : activeBattle.player2;
    const opponent = localRole === "player1" ? activeBattle.player2 : activeBattle.player1;

    activeBattle.gameEnded = true;
    activeBattle.winner = opponent.username;
    activeBattle.combatLog = `¡${me.username} se ha rendido! Victoria para ${opponent.username}.`;
    updateBattleState();
  }
}

// --- PROCESAR FASE DE COMBATE (SOLO EJECUTADO POR PLAYER 1) ---
function processCombatPhase() {
  let log = `Ronda ${activeBattle.round} - ¡Fase de Combate! \n`;

  const p1 = activeBattle.player1;
  const p2 = activeBattle.player2;

  // Recorrer los 5 carriles
  for (let i = 0; i < 5; i++) {
    const cardP1 = p1.board[i];
    const cardP2 = p2.board[i];

    // --- ACCIÓN JUGADOR 1 EN CAR RIL i ---
    if (cardP1 && cardP1.attack > 0 && cardP1.pattern !== "defense") {
      executeCardAttack(cardP1, i, p1, p2, 1);
    }

    // --- ACCIÓN JUGADOR 2 EN CAR RIL i ---
    if (cardP2 && cardP2.attack > 0 && cardP2.pattern !== "defense") {
      executeCardAttack(cardP2, i, p2, p1, 2);
    }
  }

  // Limpiar cartas eliminadas (Vida <= 0)
  for (let i = 0; i < 5; i++) {
    if (p1.board[i] && p1.board[i].health <= 0) {
      log += `[P1] [${p1.board[i].name}] ha sido derrotado. `;
      p1.board[i] = null;
    }
    if (p2.board[i] && p2.board[i].health <= 0) {
      log += `[P2] [${p2.board[i].name}] ha sido derrotado. `;
      p2.board[i] = null;
    }
  }

  // Verificar condiciones de victoria
  if (p1.hp <= 0 && p2.hp <= 0) {
    activeBattle.gameEnded = true;
    activeBattle.winner = "Empate";
    activeBattle.combatLog = "¡Ambos luchadores cayeron al mismo tiempo! ¡Es un Empate!";
  } else if (p1.hp <= 0) {
    activeBattle.gameEnded = true;
    activeBattle.winner = p2.username;
    activeBattle.combatLog = `¡Victoria para ${p2.username}! La salud de ${p1.username} llegó a 0.`;
  } else if (p2.hp <= 0) {
    activeBattle.gameEnded = true;
    activeBattle.winner = p1.username;
    activeBattle.combatLog = `¡Victoria para ${p1.username}! La salud de ${p2.username} llegó a 0.`;
  } else {
    // Siguiente Ronda
    activeBattle.round++;
    
    // Asignar nuevas monedas no acumulables (Ronda 1 = 1, Ronda 2 = 2, Ronda 3 = 3...)
    p1.energy = activeBattle.round;
    p2.energy = activeBattle.round;

    // Resetear estados para la fase de colocación/robo
    p1.ready = false;
    p2.ready = false;
    p1.hasDrawn = false;
    p2.hasDrawn = false;

    activeBattle.combatLog = `Fin de Combate. Iniciando Ronda ${activeBattle.round}. Monedas actualizadas a ${activeBattle.round}.`;
  }

  updateBattleState();
}

// --- EJECUTAR ATAQUE DE CARTA SEGÚN PATRÓN ---
function executeCardAttack(card, slotIdx, attacker, defender, playerNum) {
  const dmg = card.attack;

  if (card.pattern === "front") {
    // Ataca directo al frente (mismo slotIdx)
    const target = defender.board[slotIdx];
    if (target) {
      target.health -= dmg;
    } else {
      defender.hp = Math.max(0, defender.hp - dmg);
    }
  } else if (card.pattern === "adjacent") {
    // Ataca al frente y a los adyacentes del frente (slotIdx - 1, slotIdx, slotIdx + 1)
    const targets = [slotIdx - 1, slotIdx, slotIdx + 1];
    let damagedOpponent = false;

    targets.forEach(tIdx => {
      if (tIdx >= 0 && tIdx < 5) {
        const target = defender.board[tIdx];
        if (target) {
          target.health -= dmg;
          damagedOpponent = true;
        }
      }
    });

    // Si no golpeó a ningún luchador, el daño del carril principal va directo al rival
    if (!defender.board[slotIdx]) {
      defender.hp = Math.max(0, defender.hp - dmg);
    }
  } else if (card.pattern === "right") {
    // Ataca únicamente al carril de la derecha del oponente frontal (slotIdx + 1)
    const targetIdx = slotIdx + 1;
    if (targetIdx < 5) {
      const target = defender.board[targetIdx];
      if (target) {
        target.health -= dmg;
      } else {
        defender.hp = Math.max(0, defender.hp - dmg);
      }
    } else {
      // Si no existe carril a la derecha, el ataque falla o va al frente
      const target = defender.board[slotIdx];
      if (target) target.health -= dmg;
      else defender.hp = Math.max(0, defender.hp - dmg);
    }
  }
}

// --- RENDERIZAR TABLERO DE BATALLA ---
function renderBattleScreen() {
  if (!activeBattle) return;

  const isP1 = localRole === "player1";
  const myData = isP1 ? activeBattle.player1 : activeBattle.player2;
  const oppData = isP1 ? activeBattle.player2 : activeBattle.player1;

  // Nombres de jugadores
  document.getElementById("player-name-display").textContent = `${myData.username} (Tú)`;
  document.getElementById("enemy-name-display").textContent = oppData.username;

  // Barras de Vida
  document.getElementById("player-health-text").textContent = `${myData.hp}/100`;
  document.getElementById("player-health-bar").style.width = `${myData.hp}%`;
  
  document.getElementById("enemy-health-text").textContent = `${oppData.hp}/100`;
  document.getElementById("enemy-health-bar").style.width = `${oppData.hp}%`;

  // Monedas
  document.getElementById("player-energy-text").textContent = `${myData.energy}/${activeBattle.round}`;
  document.getElementById("enemy-energy-text").textContent = `${oppData.energy}/${activeBattle.round}`;

  // Log de combate
  document.getElementById("combat-status-log").textContent = activeBattle.combatLog;

  // Habilitar/Deshabilitar botones de robo
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

  // Habilitar botón de listo
  const endBtn = document.getElementById("btn-end-turn");
  if (myData.ready) {
    endBtn.disabled = true;
    endBtn.textContent = "Esperando al rival...";
  } else {
    endBtn.disabled = !myData.hasDrawn;
    endBtn.textContent = "Finalizar Fase de Colocación";
  }

  // Renderizar mano del jugador
  renderPlayerHand(myData.hand);

  // Renderizar tableros (Fila oponente arriba, fila jugador abajo)
  renderBoard(document.getElementById("player-board"), myData.board, true);
  renderBoard(document.getElementById("enemy-board"), oppData.board, false);

  // Validar fin del juego
  if (activeBattle.gameEnded) {
    alert(`¡FIN DEL JUEGO! Ganador: ${activeBattle.winner}.`);
    // Limpiar batalla de localStorage y regresar al Lobby
    localStorage.removeItem("uc_active_battle");
    showScreen("screen-lobby");
  }
}

// --- RENDERIZAR MANO ---
function renderPlayerHand(hand) {
  const container = document.getElementById("player-hand");
  container.innerHTML = "";

  hand.forEach(card => {
    const cardDiv = document.createElement("div");
    cardDiv.className = `game-card rarity-${card.rarity}`;
    cardDiv.draggable = true;
    cardDiv.dataset.instanceId = card.instanceId;
    cardDiv.innerHTML = `
      <div class="card-cost">${card.cost}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-illustration">${card.isSupport ? "🛡️" : "⚔️"}</div>
      <div class="card-stats">
        <div class="stat">⚔️ ${card.attack}</div>
        <div class="stat">❤️ ${card.health}</div>
      </div>
    `;

    // Interactividad al hacer clic para jugar (alternativa táctil a drag and drop)
    cardDiv.addEventListener("click", () => {
      document.querySelectorAll("#player-hand .game-card").forEach(c => c.classList.remove("selected-for-play"));
      cardDiv.classList.add("selected-for-play");
      dragSelectedCardId = card.instanceId;
    });

    // Drag start
    cardDiv.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.instanceId);
      dragSelectedCardId = card.instanceId;
    });

    container.appendChild(cardDiv);
  });
}

// --- RENDERIZAR TABLERO RIVAL Y JUGADOR ---
function renderBoard(boardContainer, slotsArray, isPlayerBoard) {
  const slotsElements = boardContainer.querySelectorAll(".board-slot");

  slotsArray.forEach((card, idx) => {
    const slot = slotsElements[idx];
    slot.innerHTML = "";

    if (card) {
      const cardDiv = document.createElement("div");
      cardDiv.className = `game-card rarity-${card.rarity}`;
      cardDiv.innerHTML = `
        <div class="card-cost">${card.cost}</div>
        <div class="card-name">${card.name}</div>
        <div class="card-illustration">${card.isSupport ? "🛡️" : "⚔️"}</div>
        <div class="card-stats">
          <div class="stat">⚔️ ${card.attack}</div>
          <div class="stat">❤️ ${card.health}</div>
        </div>
      `;
      slot.appendChild(cardDiv);
    } else {
      slot.textContent = isPlayerBoard ? "COLOCAR" : "VACÍO";
    }
  });
}

// --- SOPORTE DRAG & DROP Y SELECCIÓN MÓVIL ---
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

    // Clic en slot como alternativa táctil para colocar la carta seleccionada
    slot.addEventListener("click", () => {
      if (dragSelectedCardId) {
        const slotIndex = parseInt(slot.getAttribute("data-slot"));
        playCardToSlot(dragSelectedCardId, slotIndex);
        dragSelectedCardId = null;
      }
    });
  });
}

// --- UTILERÍAS ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
