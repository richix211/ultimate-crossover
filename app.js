// ==========================================================================
// APP.JS - LÓGICA CORE DE ULTIMATE CROSSOVER (VERSIÓN CORREGIDA Y ROBUSTA)
// ==========================================================================

// --- ESTADO GLOBAL DE LA APP ---
let currentUser = null;
let customCards = []; 
let activeDeckIndex = 0; 

// --- INICIALIZACIÓN ---
document.addEventListener("DOMContentLoaded", () => {
  initLocalStorage();
  setupAuthEvents();
  setupLobbyEvents();
  setupCreatorEvents();
  setupDeckEvents();
  setupShopEvents();
  setupSocialSync();
  checkSession();
});

// --- INICIALIZAR LOCAL STORAGE ---
function initLocalStorage() {
  const existingUsers = localStorage.getItem("uc_users");
  
  if (!existingUsers) {
    const adminUser = {
      username: "admin",
      email: "admin@ultimatecrossover.com",
      password: "fef8villa",
      karm: 5000,
      packs: { base: 5 },
      collection: [], 
      decks: [
        { name: "Baraja Alfa", cards: ["base_soldado","base_soldado","base_espadachin","base_espadachin","base_golem","base_golem","base_arquero","base_arquero","base_dragon","base_avatar"], support: ["base_pocion_vida", "base_escudo_pesado"] }
      ],
      activeDeckIdx: 0,
      friendCode: "ADMIN#0001",
      friends: [],
      claimedDays: {}
    };
    localStorage.setItem("uc_users", JSON.stringify([adminUser]));
  } else {
    const users = JSON.parse(existingUsers);
    let updated = false;

    const adminExists = users.some(u => u.username === "admin");
    if (!adminExists) {
      users.push({
        username: "admin",
        email: "admin@ultimatecrossover.com",
        password: "fef8villa",
        karm: 5000,
        packs: { base: 5 },
        collection: [],
        decks: [{ name: "Baraja Alfa", cards: ["base_soldado","base_soldado","base_espadachin","base_espadachin","base_golem","base_golem","base_arquero","base_arquero","base_dragon","base_avatar"], support: ["base_pocion_vida", "base_escudo_pesado"] }],
        activeDeckIdx: 0,
        friendCode: "ADMIN#0001",
        friends: [],
        claimedDays: {}
      });
      updated = true;
    }

    users.forEach(u => {
      if (!u.packs || typeof u.packs === "number") {
        u.packs = { base: u.packs || 2 };
        updated = true;
      }
      if (!u.decks || u.decks.length === 0) {
        u.decks = [{ name: "Baraja Inicial", cards: [], support: [] }];
        u.activeDeckIdx = 0;
        updated = true;
      }
    });

    if (updated) {
      localStorage.setItem("uc_users", JSON.stringify(users));
    }
  }

  if (!localStorage.getItem("uc_custom_cards")) {
    localStorage.setItem("uc_custom_cards", JSON.stringify([]));
  }
  if (!localStorage.getItem("uc_duels")) {
    localStorage.setItem("uc_duels", JSON.stringify([]));
  }
}

// --- RECARGAR USUARIO DESDE STORAGE ---
function reloadCurrentUser() {
  if (!currentUser) return;
  const users = JSON.parse(localStorage.getItem("uc_users")) || [];
  const found = users.find(u => u.username === currentUser.username);
  if (found) {
    // Normalizar packs si se desconfigura
    if (!found.packs || typeof found.packs === "number") {
      found.packs = { base: found.packs || 0 };
    }
    currentUser = found;
    activeDeckIndex = currentUser.activeDeckIdx || 0;
  }
}

// --- CHEQUEAR SESIÓN ACTIVA ---
function checkSession() {
  const session = sessionStorage.getItem("uc_active_user");
  if (session) {
    loginUser(session);
  } else {
    showScreen("screen-auth");
  }
}

// --- MOSTRAR PANTALLA ---
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
  
  reloadCurrentUser();
  
  if (screenId === "screen-lobby") {
    updateLobbyUI();
  } else if (screenId === "screen-deck") {
    renderDeckBuilder();
  } else if (screenId === "screen-shop") {
    updateShopUI();
  } else if (screenId === "screen-admin") {
    renderAdminPanel();
  }
}

// --- AUTENTICACIÓN ---
function setupAuthEvents() {
  const loginForm = document.getElementById("form-login");
  const registerForm = document.getElementById("form-register");
  
  document.getElementById("go-to-register").onclick = () => {
    document.getElementById("auth-login-view").classList.add("hidden");
    document.getElementById("auth-register-view").classList.remove("hidden");
  };
  document.getElementById("go-to-login").onclick = () => {
    document.getElementById("auth-register-view").classList.add("hidden");
    document.getElementById("auth-login-view").classList.remove("hidden");
  };

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const userOrEmail = document.getElementById("login-username").value.trim();
    const pass = document.getElementById("login-password").value;

    const users = JSON.parse(localStorage.getItem("uc_users"));
    const found = users.find(u => (u.username === userOrEmail || u.email === userOrEmail) && u.password === pass);

    if (found) {
      sessionStorage.setItem("uc_active_user", found.username);
      loginUser(found.username);
    } else {
      alert("Credenciales incorrectas.");
    }
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    if (username.toLowerCase() === "admin") {
      alert("Nombre de usuario reservado.");
      return;
    }

    const users = JSON.parse(localStorage.getItem("uc_users"));
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase())) {
      alert("El usuario o correo ya está registrado.");
      return;
    }

    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const newUser = {
      username: username,
      email: email,
      password: password,
      karm: 1000, 
      packs: { base: 2 }, 
      collection: [], 
      decks: [
        { name: "Baraja Inicial", cards: [], support: [] }
      ],
      activeDeckIdx: 0,
      friendCode: `${username.toUpperCase()}#${randomCode}`,
      friends: [],
      claimedDays: {}
    };

    users.push(newUser);
    localStorage.setItem("uc_users", JSON.stringify(users));
    
    alert("¡Cuenta registrada con éxito!");
    registerForm.reset();
    document.getElementById("go-to-login").click();
  });
}

function loginUser(username) {
  const users = JSON.parse(localStorage.getItem("uc_users"));
  currentUser = users.find(u => u.username === username);

  if (!currentUser.packs || typeof currentUser.packs === "number") {
    currentUser.packs = { base: currentUser.packs || 2 };
  }
  if (!currentUser.decks || currentUser.decks.length === 0) {
    currentUser.decks = [{ name: "Baraja Principal", cards: [], support: [] }];
    currentUser.activeDeckIdx = 0;
  }
  
  // Ocultar Creador para usuarios normales
  const creatorBtn = document.getElementById("menu-btn-creator");
  const adminConsoleBtn = document.getElementById("btn-admin-console");

  if (currentUser.username === "admin") {
    adminConsoleBtn.classList.remove("hidden");
    creatorBtn.classList.remove("hidden");
  } else {
    adminConsoleBtn.classList.add("hidden");
    creatorBtn.classList.add("hidden"); 
  }

  customCards = JSON.parse(localStorage.getItem("uc_custom_cards")) || [];
  activeDeckIndex = currentUser.activeDeckIdx || 0;

  showScreen("screen-lobby");
}

// --- LOBBY EVENTOS ---
function setupLobbyEvents() {
  document.querySelectorAll(".btn-back-lobby").forEach(btn => {
    btn.onclick = () => showScreen("screen-lobby");
  });

  document.getElementById("menu-btn-creator").onclick = () => showScreen("screen-creator");
  document.getElementById("menu-btn-deck").onclick = () => showScreen("screen-deck");
  document.getElementById("menu-btn-shop").onclick = () => showScreen("screen-shop");
  document.getElementById("btn-admin-console").onclick = () => showScreen("screen-admin");
  
  document.getElementById("menu-btn-play").onclick = () => {
    showScreen("screen-game-modes");
  };

  document.getElementById("btn-claim-daily").onclick = claimDailyKarm;

  // Agregar Amigo
  document.getElementById("form-add-friend").addEventListener("submit", (e) => {
    e.preventDefault();
    const friendInput = document.getElementById("add-friend-input").value.trim();
    if (!friendInput) return;

    if (friendInput === currentUser.username || friendInput === currentUser.friendCode) {
      alert("No puedes agregarte a ti mismo.");
      return;
    }

    const users = JSON.parse(localStorage.getItem("uc_users"));
    const targetUser = users.find(u => u.username === friendInput || u.friendCode === friendInput);

    if (!targetUser) {
      alert("Usuario o Código no encontrado.");
      return;
    }

    const myDbUser = users.find(u => u.username === currentUser.username);

    if (myDbUser.friends.includes(targetUser.username)) {
      alert("Ya es tu amigo.");
      return;
    }

    myDbUser.friends.push(targetUser.username);
    if (!targetUser.friends.includes(myDbUser.username)) {
      targetUser.friends.push(myDbUser.username);
    }

    localStorage.setItem("uc_users", JSON.stringify(users));
    reloadCurrentUser();
    alert(`¡Has añadido a ${targetUser.username}!`);
    document.getElementById("add-friend-input").value = "";
    updateLobbyUI();
  });
}

// --- ACTUALIZAR LOBBY ---
function updateLobbyUI() {
  reloadCurrentUser();
  if (!currentUser) return;

  document.getElementById("lobby-display-name").textContent = currentUser.username;
  document.getElementById("lobby-display-code").textContent = `CÓDIGO: ${currentUser.friendCode}`;
  document.getElementById("lobby-karm-balance").textContent = currentUser.karm;
  
  const basePacks = currentUser.packs ? (currentUser.packs.base || 0) : 0;
  document.getElementById("lobby-pack-balance").textContent = basePacks;

  updateDailyRewardGrid();
  renderFriendsList();
  renderPendingDuels();
}

// --- CALENDARIO RECOMPENSAS DIARIAS ---
function getDayOfWeekIndex() {
  const day = new Date().getDay(); 
  return day === 0 ? 7 : day;
}

function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function updateDailyRewardGrid() {
  const currentDayIndex = getDayOfWeekIndex();
  const todayStr = getTodayDateString();
  const claimedToday = currentUser.claimedDays && currentUser.claimedDays[todayStr];

  document.querySelectorAll(".day-card").forEach(card => {
    card.className = "day-card";
    const cardDay = parseInt(card.getAttribute("data-day"));

    if (cardDay === currentDayIndex) {
      card.classList.add("current");
      if (claimedToday) card.classList.add("claimed");
    }
  });

  const claimBtn = document.getElementById("btn-claim-daily");
  if (claimedToday) {
    claimBtn.textContent = "Ya Reclamado Hoy";
    claimBtn.disabled = true;
  } else {
    claimBtn.textContent = "Reclamar Karm de Hoy";
    claimBtn.disabled = false;
  }
}

function claimDailyKarm() {
  const todayStr = getTodayDateString();
  reloadCurrentUser();
  
  if (currentUser.claimedDays && currentUser.claimedDays[todayStr]) {
    alert("Ya has reclamado tu recompensa de hoy.");
    return;
  }

  const dayIndex = getDayOfWeekIndex();
  const rewards = { 1: 100, 2: 150, 3: 200, 4: 250, 5: 300, 6: 400, 7: 500 };
  const amount = rewards[dayIndex] || 100;

  const users = JSON.parse(localStorage.getItem("uc_users"));
  const dbUser = users.find(u => u.username === currentUser.username);

  dbUser.karm = (dbUser.karm || 0) + amount;
  if (!dbUser.claimedDays) dbUser.claimedDays = {};
  dbUser.claimedDays[todayStr] = true;

  localStorage.setItem("uc_users", JSON.stringify(users));
  
  reloadCurrentUser();
  updateLobbyUI();
  
  alert(`¡Felicidades! Has reclamado tu recompensa diaria de +${amount} Karms.`);
}

// --- AMIGOS ---
function renderFriendsList() {
  const container = document.getElementById("friends-list");
  container.innerHTML = "";

  if (!currentUser.friends || currentUser.friends.length === 0) {
    container.innerHTML = `<p class="empty-text">No tienes amigos añadidos todavía.</p>`;
    return;
  }

  currentUser.friends.forEach(fName => {
    const item = document.createElement("div");
    item.className = "friend-item";
    item.innerHTML = `
      <div class="friend-info">
        <span class="friend-name" style="color: #fff;">${fName}</span>
        <span class="friend-status online">● En línea</span>
      </div>
      <button class="btn btn-accent btn-sm" onclick="sendDuelInvite('${fName}')">⚔️ Retar</button>
    `;
    container.appendChild(item);
  });
}

function sendDuelInvite(friendName) {
  const currentDeck = currentUser.decks[activeDeckIndex];
  if (!currentDeck || !currentDeck.cards || currentDeck.cards.length !== 10 || currentDeck.support.length !== 2) {
    alert("Primero debes ir a 'Álbum y Barajas' y armar una baraja completa (10 cartas de batalla y 2 de apoyo) para combatir.");
    showScreen("screen-deck");
    return;
  }

  const duels = JSON.parse(localStorage.getItem("uc_duels")) || [];
  const cleanDuels = duels.filter(d => d.from !== currentUser.username);
  
  const newDuel = {
    id: `duel_${Date.now()}`,
    from: currentUser.username,
    to: friendName,
    status: "pending",
    timestamp: Date.now()
  };
  
  cleanDuels.push(newDuel);
  localStorage.setItem("uc_duels", JSON.stringify(cleanDuels));
  alert(`¡Desafío enviado a ${friendName}! Esperando respuesta.`);
}

function renderPendingDuels() {
  const duels = JSON.parse(localStorage.getItem("uc_duels")) || [];
  const container = document.getElementById("pending-duels-container");
  container.innerHTML = "";

  const myInvites = duels.filter(d => d.to === currentUser.username && d.status === "pending");

  if (myInvites.length === 0) {
    container.innerHTML = `<p class="empty-text">Sin invitaciones de combate activas.</p>`;
    return;
  }

  myInvites.forEach(d => {
    const item = document.createElement("div");
    item.className = "duel-invite-card";
    item.innerHTML = `
      <div class="duel-invite-info" style="color:#fff;">
        Duelo de: <strong style="color: var(--neon-pink);">${d.from}</strong>
      </div>
      <div style="display: flex; gap: 5px;">
        <button class="btn btn-success btn-sm" onclick="acceptDuel('${d.id}')">Aceptar</button>
        <button class="btn btn-danger btn-sm" onclick="declineDuel('${d.id}')">X</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function acceptDuel(duelId) {
  const currentDeck = currentUser.decks[activeDeckIndex];
  if (!currentDeck || !currentDeck.cards || currentDeck.cards.length !== 10 || currentDeck.support.length !== 2) {
    alert("Necesitas tener guardada una baraja con exactamente 10 cartas principales y 2 de apoyo.");
    showScreen("screen-deck");
    return;
  }

  const duels = JSON.parse(localStorage.getItem("uc_duels"));
  const found = duels.find(d => d.id === duelId);
  if (found) {
    found.status = "accepted";
    localStorage.setItem("uc_duels", JSON.stringify(duels));
    initiateBattleRoom(found, "player2");
  }
}

function declineDuel(duelId) {
  const duels = JSON.parse(localStorage.getItem("uc_duels"));
  const filtered = duels.filter(d => d.id !== duelId);
  localStorage.setItem("uc_duels", JSON.stringify(filtered));
  updateLobbyUI();
}

function setupSocialSync() {
  window.addEventListener("storage", (e) => {
    if (e.key === "uc_duels" || e.key === "uc_users" || e.key === "uc_custom_cards") {
      reloadCurrentUser();
      customCards = JSON.parse(localStorage.getItem("uc_custom_cards")) || [];
      
      const activeScreen = document.querySelector(".screen.active");
      if (activeScreen) {
        showScreen(activeScreen.id);
      }

      if (e.key === "uc_duels") {
        const duels = JSON.parse(e.newValue) || [];
        const mySentAccepted = duels.find(d => d.from === currentUser.username && d.status === "accepted");
        if (mySentAccepted) {
          const clean = duels.filter(d => d.id !== mySentAccepted.id);
          localStorage.setItem("uc_duels", JSON.stringify(clean));
          initiateBattleRoom(mySentAccepted, "player1");
        }
      }
    }
  });
}

// --- CREADOR DE CARTAS (ADMIN ONLY) ---
function setupCreatorEvents() {
  const form = document.getElementById("form-create-card");
  const livePreview = document.getElementById("card-creator-live-preview");

  const nameInput = document.getElementById("card-create-name");
  const costInput = document.getElementById("card-create-cost");
  const rarityInput = document.getElementById("card-create-rarity");
  const patternInput = document.getElementById("card-create-pattern");
  const attackInput = document.getElementById("card-create-attack");
  const healthInput = document.getElementById("card-create-health");

  function updateLivePreview() {
    const rarity = rarityInput.value;
    livePreview.className = `game-card rarity-${rarity}`;
    livePreview.querySelector(".card-name").textContent = nameInput.value || "Personaje";
    livePreview.querySelector(".card-cost").textContent = costInput.value;
    document.getElementById("preview-attack-val").textContent = attackInput.value;
    document.getElementById("preview-health-val").textContent = healthInput.value;

    const rarityBadge = livePreview.querySelector(".card-rarity-badge");
    const rarityLabels = { common: "Común", rare: "Rara", epic: "Épica", legendary: "Legendaria" };
    rarityBadge.textContent = rarityLabels[rarity];

    const patternBadge = livePreview.querySelector(".pattern-badge");
    const patterns = {
      front: "FRENTE ⬆️",
      adjacent: "LADOS ↔️",
      right: "DER. ➡️",
      defense: "ESCUDO 🛡️"
    };
    patternBadge.textContent = patterns[patternInput.value];
  }

  [nameInput, costInput, rarityInput, patternInput, attackInput, healthInput].forEach(elem => {
    elem.addEventListener("input", updateLivePreview);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (currentUser.username !== "admin") {
      alert("Solo el Administrador puede crear cartas oficiales.");
      return;
    }

    const newCard = {
      id: `custom_${Date.now()}`,
      name: nameInput.value.trim(),
      cost: parseInt(costInput.value),
      attack: parseInt(attackInput.value),
      health: parseInt(healthInput.value),
      pattern: patternInput.value,
      rarity: rarityInput.value,
      description: document.getElementById("card-create-desc").value.trim() || "Carta oficial crossover.",
      creator: "admin",
      isSupport: false
    };

    const allCustom = JSON.parse(localStorage.getItem("uc_custom_cards")) || [];
    allCustom.push(newCard);
    localStorage.setItem("uc_custom_cards", JSON.stringify(allCustom));
    customCards = allCustom;

    const users = JSON.parse(localStorage.getItem("uc_users"));
    const adminDb = users.find(u => u.username === "admin");
    
    adminDb.collection.push({ cardId: newCard.id, qty: 1 });
    localStorage.setItem("uc_users", JSON.stringify(users));

    reloadCurrentUser();

    alert("¡Carta oficial creada! Ahora está disponible en la base de datos y saldrá en los sobres de todos los jugadores.");
    form.reset();
    updateLivePreview();
  });
}

// --- GESTIÓN DE BARAJAS ---
function setupDeckEvents() {
  const selectDropdown = document.getElementById("deck-select-dropdown");
  const createDeckBtn = document.getElementById("btn-create-new-deck");
  const deleteDeckBtn = document.getElementById("btn-delete-deck");
  const renameInput = document.getElementById("deck-name-input");

  selectDropdown.addEventListener("change", () => {
    activeDeckIndex = parseInt(selectDropdown.value);
    
    const users = JSON.parse(localStorage.getItem("uc_users"));
    users.find(u => u.username === currentUser.username).activeDeckIdx = activeDeckIndex;
    localStorage.setItem("uc_users", JSON.stringify(users));

    reloadCurrentUser();
    renderDeckBuilder();
  });

  createDeckBtn.onclick = () => {
    const users = JSON.parse(localStorage.getItem("uc_users"));
    const dbUser = users.find(u => u.username === currentUser.username);
    
    const newIndex = dbUser.decks.length;
    dbUser.decks.push({
      name: `Nueva Baraja ${newIndex + 1}`,
      cards: [],
      support: []
    });
    dbUser.activeDeckIdx = newIndex;
    activeDeckIndex = newIndex;

    localStorage.setItem("uc_users", JSON.stringify(users));
    reloadCurrentUser();
    renderDeckBuilder();
  };

  deleteDeckBtn.onclick = () => {
    if (currentUser.decks.length <= 1) {
      alert("Debes tener al menos una baraja creada.");
      return;
    }
    if (confirm(`¿Estás seguro de borrar la baraja "${currentUser.decks[activeDeckIndex].name}"?`)) {
      const users = JSON.parse(localStorage.getItem("uc_users"));
      const dbUser = users.find(u => u.username === currentUser.username);
      
      dbUser.decks.splice(activeDeckIndex, 1);
      dbUser.activeDeckIdx = 0;
      activeDeckIndex = 0;

      localStorage.setItem("uc_users", JSON.stringify(users));
      reloadCurrentUser();
      renderDeckBuilder();
    }
  };

  renameInput.addEventListener("change", () => {
    const newName = renameInput.value.trim();
    if (!newName) return;

    const users = JSON.parse(localStorage.getItem("uc_users"));
    const dbUser = users.find(u => u.username === currentUser.username);
    dbUser.decks[activeDeckIndex].name = newName;

    localStorage.setItem("uc_users", JSON.stringify(users));
    reloadCurrentUser();
    populateDeckDropdown();
  });

  document.getElementById("btn-save-deck").onclick = () => {
    const currentDeck = currentUser.decks[activeDeckIndex];
    if (currentDeck.cards.length !== 10) {
      alert("La baraja de batalla debe tener exactamente 10 cartas.");
      return;
    }
    if (currentDeck.support.length !== 2) {
      alert("Debes seleccionar exactamente 2 cartas de apoyo.");
      return;
    }

    const users = JSON.parse(localStorage.getItem("uc_users"));
    users.find(u => u.username === currentUser.username).decks = currentUser.decks;
    localStorage.setItem("uc_users", JSON.stringify(users));
    
    reloadCurrentUser();

    alert(`¡Baraja "${currentDeck.name}" guardada con éxito!`);
    showScreen("screen-lobby");
  };
}

function populateDeckDropdown() {
  const selectDropdown = document.getElementById("deck-select-dropdown");
  selectDropdown.innerHTML = "";

  currentUser.decks.forEach((deck, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = deck.name;
    if (idx === activeDeckIndex) opt.selected = true;
    selectDropdown.appendChild(opt);
  });

  document.getElementById("deck-name-input").value = currentUser.decks[activeDeckIndex].name;
}

function renderDeckBuilder() {
  populateDeckDropdown();

  const albumGrid = document.getElementById("album-cards-grid");
  albumGrid.innerHTML = "";

  const allCards = [...defaultCardsList, ...customCards];
  const collectionList = currentUser.collection || [];

  const availableMap = {};
  
  allCards.forEach(c => {
    if (c.rarity === "common" && c.id.startsWith("base_")) {
      availableMap[c.id] = 5;
    } else {
      availableMap[c.id] = 0;
    }
  });

  collectionList.forEach(item => {
    availableMap[item.cardId] = (availableMap[item.cardId] || 0) + item.qty;
  });

  allCards.forEach(card => {
    const qty = availableMap[card.id] || 0;
    if (qty <= 0) return;

    const cardDiv = document.createElement("div");
    cardDiv.className = `game-card rarity-${card.rarity}`;
    cardDiv.innerHTML = `
      <div class="card-cost">${card.cost}</div>
      <div class="card-rarity-badge">${getRarityStyle(card.rarity).text} (x${qty})</div>
      <div class="card-name" style="color:#fff;">${card.name}</div>
      <div class="card-illustration">${card.isSupport ? "🛡️" : "⚔️"}</div>
      <div class="card-stats">
        <div class="stat">⚔️ ${card.attack}</div>
        <div class="stat">❤️ ${card.health}</div>
      </div>
      <div class="card-footer-info">
        <span class="pattern-badge">${getPatternIcon(card.pattern)} ${card.pattern.toUpperCase()}</span>
      </div>
    `;

    cardDiv.onclick = () => {
      const activeDeck = currentUser.decks[activeDeckIndex];
      const countInDeck = activeDeck.cards.filter(id => id === card.id).length;
      const countInSupport = activeDeck.support.filter(id => id === card.id).length;
      const totalUsed = countInDeck + countInSupport;

      if (totalUsed >= qty) {
        alert("No tienes más copias disponibles de esta carta.");
        return;
      }

      if (card.isSupport) {
        if (activeDeck.support.length >= 2) {
          alert("Ya tienes 2 cartas de apoyo.");
          return;
        }
        activeDeck.support.push(card.id);
      } else {
        if (activeDeck.cards.length >= 10) {
          alert("Ya tienes 10 cartas principales.");
          return;
        }
        activeDeck.cards.push(card.id);
      }
      updateDeckBuilderLists();
    };

    albumGrid.appendChild(cardDiv);
  });

  updateDeckBuilderLists();
}

function updateDeckBuilderLists() {
  const deckListDiv = document.getElementById("current-deck-list");
  const supportListDiv = document.getElementById("current-support-list");
  
  deckListDiv.innerHTML = "";
  supportListDiv.innerHTML = "";

  const activeDeck = currentUser.decks[activeDeckIndex];
  document.getElementById("deck-size-val").textContent = activeDeck.cards.length;
  document.getElementById("support-size-val").textContent = activeDeck.support.length;

  const allCards = [...defaultCardsList, ...customCards];

  activeDeck.cards.forEach((cardId, index) => {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;

    const badge = document.createElement("div");
    badge.className = `deck-item-badge rarity-${card.rarity}-border`;
    badge.innerHTML = `🪙${card.cost} <strong>${card.name}</strong> ⚔️${card.attack}/❤️${card.health}`;
    badge.onclick = () => {
      activeDeck.cards.splice(index, 1);
      updateDeckBuilderLists();
    };
    deckListDiv.appendChild(badge);
  });

  activeDeck.support.forEach((cardId, index) => {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;

    const badge = document.createElement("div");
    badge.className = `deck-item-badge rarity-${card.rarity}-border`;
    badge.innerHTML = `🪙${card.cost} <strong>${card.name}</strong> (Apoyo)`;
    badge.onclick = () => {
      activeDeck.support.splice(index, 1);
      updateDeckBuilderLists();
    };
    supportListDiv.appendChild(badge);
  });
}

// --- TIENDA DE SOBRES ---
function setupShopEvents() {
  const buyBtn = document.getElementById("btn-buy-pack");
  const openBtn = document.getElementById("btn-trigger-open-pack");
  const overlay = document.getElementById("pack-opening-overlay");
  const packModel = document.getElementById("booster-pack-model");
  const revealedGrid = document.getElementById("revealed-cards-container");
  const finishBtn = document.getElementById("btn-finish-opening");

  buyBtn.onclick = () => {
    reloadCurrentUser();
    if (currentUser.karm < 500) {
      alert("No tienes suficientes Karms (necesitas 500).");
      return;
    }

    const users = JSON.parse(localStorage.getItem("uc_users"));
    const dbUser = users.find(u => u.username === currentUser.username);

    dbUser.karm -= 500;
    if (!dbUser.packs) dbUser.packs = { base: 0 };
    dbUser.packs.base = (dbUser.packs.base || 0) + 1;

    localStorage.setItem("uc_users", JSON.stringify(users));
    
    reloadCurrentUser();
    updateShopUI();
    alert("¡Sobre Base comprado!");
  };

  openBtn.onclick = () => {
    reloadCurrentUser();
    const basePacks = currentUser.packs ? (currentUser.packs.base || 0) : 0;
    if (basePacks <= 0) return;
    
    const users = JSON.parse(localStorage.getItem("uc_users"));
    const dbUser = users.find(u => u.username === currentUser.username);

    dbUser.packs.base--;
    localStorage.setItem("uc_users", JSON.stringify(users));
    
    reloadCurrentUser();
    updateShopUI();

    overlay.classList.remove("hidden");
    packModel.classList.remove("ripping");
    packModel.classList.remove("hidden");
    revealedGrid.classList.add("hidden");
    finishBtn.classList.add("hidden");
  };

  packModel.onclick = () => {
    packModel.classList.add("ripping");
    setTimeout(() => {
      packModel.classList.add("hidden");
      generateBoosterCards();
    }, 600);
  };

  finishBtn.onclick = () => {
    overlay.classList.add("hidden");
    updateLobbyUI();
  };
}

function updateShopUI() {
  reloadCurrentUser();
  if (!currentUser) return;

  document.getElementById("shop-karm-balance").textContent = currentUser.karm;
  
  const basePacks = currentUser.packs ? (currentUser.packs.base || 0) : 0;
  document.getElementById("shop-pack-count-base").textContent = basePacks;
  
  const openBtn = document.getElementById("btn-trigger-open-pack");
  openBtn.disabled = basePacks <= 0;
}

function generateBoosterCards() {
  const revealedGrid = document.getElementById("revealed-cards-container");
  const finishBtn = document.getElementById("btn-finish-opening");
  revealedGrid.innerHTML = "";
  revealedGrid.classList.remove("hidden");

  const cardsDrawn = [];
  const users = JSON.parse(localStorage.getItem("uc_users"));
  const dbUser = users.find(u => u.username === currentUser.username);

  // Pool de cartas (Base + Creadas por Admin)
  const pool = [...defaultCardsList, ...customCards];

  const commons = pool.filter(c => c.rarity === "common");
  const rares = pool.filter(c => c.rarity === "rare");
  const epics = pool.filter(c => c.rarity === "epic");
  const legendaries = pool.filter(c => c.rarity === "legendary");

  // Mapeador de seguridad local para evitar ReferenceErrors
  const localRarityLabels = {
    common: "Común",
    rare: "Rara",
    epic: "Épica",
    legendary: "Legendaria"
  };

  for (let i = 0; i < 5; i++) {
    const roll = Math.random() * 100;
    let subPool = commons;

    if (i === 4 && roll < 70) {
      const highRoll = Math.random() * 30;
      if (highRoll < 20 && rares.length > 0) {
        subPool = rares;
      } else if (highRoll < 28 && epics.length > 0) {
        subPool = epics;
      } else if (legendaries.length > 0) {
        subPool = legendaries;
      }
    } else {
      if (roll < 70) {
        subPool = commons;
      } else if (roll < 90 && rares.length > 0) {
        subPool = rares;
      } else if (roll < 98 && epics.length > 0) {
        subPool = epics;
      } else if (legendaries.length > 0) {
        subPool = legendaries;
      }
    }

    // Elegir carta al azar (con fallback de seguridad)
    const randomCard = subPool[Math.floor(Math.random() * subPool.length)] || commons[0];
    cardsDrawn.push(randomCard);

    const existing = dbUser.collection.find(item => item.cardId === randomCard.id);
    if (existing) {
      existing.qty++;
    } else {
      dbUser.collection.push({ cardId: randomCard.id, qty: 1 });
    }
  }

  localStorage.setItem("uc_users", JSON.stringify(users));
  reloadCurrentUser();

  cardsDrawn.forEach((card, index) => {
    const cardDiv = document.createElement("div");
    cardDiv.className = `game-card rarity-${card.rarity}`;
    cardDiv.style.opacity = "0";
    cardDiv.style.transform = "scale(0.5)";
    
    const label = localRarityLabels[card.rarity] || "Común";

    cardDiv.innerHTML = `
      <div class="card-cost">${card.cost}</div>
      <div class="card-rarity-badge">${label}</div>
      <div class="card-name" style="color:#fff;">${card.name}</div>
      <div class="card-illustration">${card.isSupport ? "🛡️" : "⚔️"}</div>
      <div class="card-stats">
        <div class="stat">⚔️ ${card.attack}</div>
        <div class="stat">❤️ ${card.health}</div>
      </div>
    `;

    revealedGrid.appendChild(cardDiv);

    setTimeout(() => {
      cardDiv.style.transition = "all 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28)";
      cardDiv.style.opacity = "1";
      cardDiv.style.transform = "scale(1)";
    }, index * 400);
  });



  setTimeout(() => {
    finishBtn.classList.remove("hidden");
  }, 5 * 400);
}

// --- CONSOLA DE ADMINISTRADOR ---
function renderAdminPanel() {
  const tbody = document.getElementById("admin-users-tbody");
  tbody.innerHTML = "";

  const users = JSON.parse(localStorage.getItem("uc_users"));
  
  users.forEach((u, index) => {
    const basePacks = u.packs ? (u.packs.base || 0) : 0;
    const cardsTotal = u.collection.reduce((acc, curr) => acc + curr.qty, 0) + 12;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${u.username}</strong><br><small>${u.email}</small></td>
      <td>${u.friendCode}</td>
      <td>🪙 ${u.karm}</td>
      <td>📦 ${basePacks} Sobres Base</td>
      <td>🎴 ${cardsTotal} Cartas</td>
      <td>
        <button class="btn btn-warning btn-sm" onclick="giftPackToUser(${index})">🎁 Regalar Sobre Base</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.giftPackToUser = function(index) {
  const users = JSON.parse(localStorage.getItem("uc_users"));
  
  if (!users[index].packs) users[index].packs = { base: 0 };
  users[index].packs.base = (users[index].packs.base || 0) + 1;
  
  localStorage.setItem("uc_users", JSON.stringify(users));
  
  if (users[index].username === currentUser.username) {
    currentUser = users[index];
  }
  
  alert(`Se ha enviado 1 sobre de regalo a ${users[index].username}.`);
  renderAdminPanel();
};
