// ==========================================================================
// APP.JS - INTEGRACIÓN CORE ONLINE CON FIREBASE REALTIME DATABASE
// ==========================================================================

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyD-4ZFrmTlkXpoQfWPNTH9VSs1nHCivhmE",
  authDomain: "ultimate-crossover.firebaseapp.com",
  projectId: "ultimate-crossover",
  storageBucket: "ultimate-crossover.appspot.com",
  messagingSenderId: "292647096515",
  appId: "1:292647096515:web:7e8f6d67bb6608b9cf1276",
  measurementId: "G-CBSY5KTRWG",
  databaseURL: "https://ultimate-crossover-default-rtdb.firebaseio.com/" // Firebase Realtime Database URL
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- ESTADO GLOBAL DE LA APP ---
let currentUser = null;
let customCards = []; // Cartas oficiales creadas por el admin en la nube
let activeDeckIndex = 0; 
const defaultCardsList = DEFAULT_CARDS; // Cargado de cards_db.js

// --- INICIALIZACIÓN ---
document.addEventListener("DOMContentLoaded", () => {
  setupAuthEvents();
  setupLobbyEvents();
  setupCreatorEvents();
  setupDeckEvents();
  setupShopEvents();
  checkSession();
});

// --- SEGURIDAD / LOGOUT GLOBAL DIRECTO DESDE HTML ---
window.logoutUserDirectly = function() {
  // Desactivar escuchadores de duelos antes de salir
  if (currentUser) {
    db.ref(`duels`).off();
  }
  sessionStorage.removeItem("uc_active_user");
  currentUser = null;
  showScreen("screen-auth");
};

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
  
  if (screenId === "screen-lobby") {
    battleEntering = false; // Reset para la próxima batalla
    syncUserData(() => {
      updateLobbyUI();
      listenForDuelInvites(); // Escuchador de duelos entrantes
    });
  } else if (screenId === "screen-deck") {
    syncUserData(renderDeckBuilder);
  } else if (screenId === "screen-shop") {
    syncUserData(updateShopUI);
  } else if (screenId === "screen-admin") {
    renderAdminPanel();
  }
}

// --- SINCRONIZAR USUARIO DESDE FIREBASE ---
function syncUserData(callback) {
  if (!currentUser) return;
  db.ref(`users/${currentUser.username}`).once("value", (snapshot) => {
    if (snapshot.exists()) {
      currentUser = snapshot.val();
      
      // Normalizar campos si faltan
      if (!currentUser.packs) currentUser.packs = { base: 2 };
      if (!currentUser.decks) {
        currentUser.decks = [{ name: "Baraja Inicial", cards: [], support: [] }];
        currentUser.activeDeckIdx = 0;
      }
      activeDeckIndex = currentUser.activeDeckIdx || 0;
    }
    if (callback) callback();
  });
}

// --- AUTENTICACIÓN ONLINE (FIREBASE) ---
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

  // Login
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim().toLowerCase();
    const pass = document.getElementById("login-password").value;

    db.ref(`users/${username}`).once("value", (snapshot) => {
      if (snapshot.exists()) {
        const userVal = snapshot.val();
        if (userVal.password === pass) {
          sessionStorage.setItem("uc_active_user", userVal.username);
          loginUser(userVal.username);
        } else {
          alert("Contraseña incorrecta.");
        }
      } else {
        alert("Usuario no registrado.");
      }
    });
  });

  // Registro
  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("register-username").value.trim().toLowerCase();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    if (username.length < 3 || username.includes(" ")) {
      alert("Nombre de usuario inválido (mínimo 3 caracteres, sin espacios).");
      return;
    }

    db.ref(`users/${username}`).once("value", (snapshot) => {
      if (snapshot.exists()) {
        alert("El nombre de usuario ya está registrado.");
        return;
      }

      const randomCode = Math.floor(1000 + Math.random() * 9000);
      const newUser = {
        username: username,
        email: email,
        password: password,
        karm: 1000, 
        packs: { base: 2 }, 
        collection: [], // Inicialmente vacía
        decks: [
          { name: "Baraja Inicial", cards: [], support: [] }
        ],
        activeDeckIdx: 0,
        friendCode: `${username.toUpperCase()}#${randomCode}`,
        friends: [],
        claimedDays: {}
      };

      // Guardar en la nube
      db.ref(`users/${username}`).set(newUser, (err) => {
        if (err) {
          alert("Error al registrarse en Firebase.");
        } else {
          alert("¡Cuenta registrada con éxito!");
          registerForm.reset();
          document.getElementById("go-to-login").click();
        }
      });
    });
  });
}

function loginUser(username) {
  db.ref(`users/${username}`).once("value", (snapshot) => {
    if (snapshot.exists()) {
      currentUser = snapshot.val();

      // Configuración de vista Admin
      const creatorBtn = document.getElementById("menu-btn-creator");
      const adminConsoleBtn = document.getElementById("btn-admin-console");

      if (currentUser.username === "admin") {
        adminConsoleBtn.classList.remove("hidden");
        creatorBtn.classList.remove("hidden");
      } else {
        adminConsoleBtn.classList.add("hidden");
        creatorBtn.classList.add("hidden"); 
      }

      // Sincronizar base de cartas custom oficiales desde Firebase
      db.ref(`custom_cards`).on("value", (snap) => {
        customCards = [];
        if (snap.exists()) {
          snap.forEach(child => {
            customCards.push(child.val());
          });
        }
      });

      activeDeckIndex = currentUser.activeDeckIdx || 0;
      showScreen("screen-lobby");
    }
  });
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

  // Agregar Amigo Online
  document.getElementById("form-add-friend").addEventListener("submit", (e) => {
    e.preventDefault();
    const friendInput = document.getElementById("add-friend-input").value.trim();
    if (!friendInput) return;

    if (friendInput.toLowerCase() === currentUser.username || friendInput.toUpperCase() === currentUser.friendCode) {
      alert("No puedes agregarte a ti mismo.");
      return;
    }

    // Buscar en Firebase
    db.ref(`users`).once("value", (snapshot) => {
      let targetUser = null;
      snapshot.forEach(child => {
        const u = child.val();
        if (u.username === friendInput.toLowerCase() || u.friendCode === friendInput.toUpperCase()) {
          targetUser = u;
        }
      });

      if (!targetUser) {
        alert("Usuario o Código de amigo no encontrado en la base de datos.");
        return;
      }

      // Añadir amigo de forma mutua
      if (!currentUser.friends) currentUser.friends = [];
      if (currentUser.friends.includes(targetUser.username)) {
        alert("Ya tienes agregado a este amigo.");
        return;
      }

      currentUser.friends.push(targetUser.username);
      if (!targetUser.friends) targetUser.friends = [];
      if (!targetUser.friends.includes(currentUser.username)) {
        targetUser.friends.push(currentUser.username);
      }

      // Guardar en la nube
      db.ref(`users/${currentUser.username}/friends`).set(currentUser.friends);
      db.ref(`users/${targetUser.username}/friends`).set(targetUser.friends);

      alert(`¡Has agregado a ${targetUser.username} como amigo!`);
      document.getElementById("add-friend-input").value = "";
      updateLobbyUI();
    });
  });

  // Configuración de Modos de Juego
  document.getElementById("btn-mode-friendly").onclick = () => {
    showScreen("screen-lobby");
    alert("Selecciona un amigo en línea de tu lista para enviarle una invitación.");
  };

  document.getElementById("btn-mode-matchmaking").onclick = startMatchmaking;
  document.getElementById("btn-cancel-matchmaking").onclick = cancelMatchmaking;
}


// --- ACTUALIZAR LOBBY ---
function updateLobbyUI() {
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
  if (currentUser.claimedDays && currentUser.claimedDays[todayStr]) {
    alert("Ya has reclamado tu recompensa de hoy.");
    return;
  }

  const dayIndex = getDayOfWeekIndex();
  const rewards = { 1: 100, 2: 150, 3: 200, 4: 250, 5: 300, 6: 400, 7: 500 };
  const amount = rewards[dayIndex] || 100;

  currentUser.karm = (currentUser.karm || 0) + amount;
  if (!currentUser.claimedDays) currentUser.claimedDays = {};
  currentUser.claimedDays[todayStr] = true;

  db.ref(`users/${currentUser.username}/karm`).set(currentUser.karm);
  db.ref(`users/${currentUser.username}/claimedDays`).set(currentUser.claimedDays);

  updateLobbyUI();
  alert(`¡Has reclamado ${amount} Karms!`);
}

// --- AMIGOS ONLINE ---
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
    alert("Primero debes armar y guardar una baraja completa de 10 cartas y 2 de apoyo.");
    showScreen("screen-deck");
    return;
  }

  // Comprobar si ya existe un reto pendiente enviado a este jugador
  db.ref(`duels`).once("value", (snapshot) => {
    let alreadyExists = false;
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const d = child.val();
        if (d.from === currentUser.username && d.to === friendName && d.status === "pending") {
          alreadyExists = true;
        }
      });
    }

    if (alreadyExists) {
      alert(`Ya le has enviado una invitación de combate a ${friendName}. Espera a que responda.`);
      return;
    }

    // Generar ID de duelo y guardarlo en Firebase
    const duelId = `duel_${Date.now()}`;
    const newDuel = {
      id: duelId,
      from: currentUser.username,
      to: friendName,
      status: "pending",
      timestamp: Date.now()
    };

    db.ref(`duels/${duelId}`).set(newDuel, (err) => {
      if (!err) {
        alert(`¡Reto enviado a ${friendName}! Esperando que acepte...`);
      }
    });
  });
}

// Escuchador dinámico de invitaciones de duelos
let battleEntering = false; // Evitar entrada doble a combate
function listenForDuelInvites() {
  db.ref(`duels`).on("value", (snapshot) => {
    renderPendingDuels();

    // Si fui yo quien envió un reto y fue aceptado, entrar a la partida
    if (!battleEntering && snapshot.exists()) {
      snapshot.forEach(child => {
        const d = child.val();
        if (d.from === currentUser.username && d.status === "accepted" && !battleEntering) {
          battleEntering = true;
          // Limpiar duelo de invitaciones y entrar a la batalla (como Player 1)
          db.ref(`duels/${d.id}`).remove(() => {
            initiateBattleRoom(d, "player1");
          });
        }
      });
    }
  });
}

function renderPendingDuels() {
  db.ref(`duels`).once("value", (snapshot) => {
    const container = document.getElementById("pending-duels-container");
    container.innerHTML = "";
    let count = 0;

    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const d = child.val();
        if (d.to === currentUser.username && d.status === "pending") {
          count++;
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
        }
      });
    }

    if (count === 0) {
      container.innerHTML = `<p class="empty-text">Sin invitaciones de combate activas.</p>`;
    }
  });
}

function acceptDuel(duelId) {
  const currentDeck = currentUser.decks[activeDeckIndex];
  if (!currentDeck || !currentDeck.cards || currentDeck.cards.length !== 10 || currentDeck.support.length !== 2) {
    alert("Necesitas tener guardada una baraja con exactamente 10 cartas principales y 2 de apoyo.");
    showScreen("screen-deck");
    return;
  }

  db.ref(`duels/${duelId}`).once("value", (snapshot) => {
    if (snapshot.exists()) {
      const d = snapshot.val();
      d.status = "accepted";
      
      // Actualizar estado en la base de datos
      db.ref(`duels/${duelId}`).set(d, () => {
        initiateBattleRoom(d, "player2");
      });
    }
  });
}

function declineDuel(duelId) {
  db.ref(`duels/${duelId}`).remove(() => {
    renderPendingDuels();
  });
}

// Sincronización entre clientes a través de Firebase
function setupSocialSync() {
  db.ref(`users`).on("value", () => {
    if (currentUser) {
      syncUserData(updateLobbyUI);
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

    const cardId = `custom_${Date.now()}`;
    const newCard = {
      id: cardId,
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

    // Subir a Firebase global
    db.ref(`custom_cards/${cardId}`).set(newCard, (err) => {
      if (!err) {
        // Otorgar copia al admin
        if (!currentUser.collection) currentUser.collection = [];
        currentUser.collection.push({ cardId: cardId, qty: 1 });
        db.ref(`users/admin/collection`).set(currentUser.collection);

        alert("¡Carta oficial creada en la nube con éxito!");
        form.reset();
        updateLivePreview();
      }
    });
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
    currentUser.activeDeckIdx = activeDeckIndex;
    db.ref(`users/${currentUser.username}/activeDeckIdx`).set(activeDeckIndex);
    renderDeckBuilder();
  });

  createDeckBtn.onclick = () => {
    const newIndex = currentUser.decks.length;
    currentUser.decks.push({
      name: `Nueva Baraja ${newIndex + 1}`,
      cards: [],
      support: []
    });
    currentUser.activeDeckIdx = newIndex;
    activeDeckIndex = newIndex;

    db.ref(`users/${currentUser.username}/decks`).set(currentUser.decks);
    db.ref(`users/${currentUser.username}/activeDeckIdx`).set(activeDeckIndex);
    renderDeckBuilder();
  };

  deleteDeckBtn.onclick = () => {
    if (currentUser.decks.length <= 1) {
      alert("Debes tener al menos una baraja.");
      return;
    }
    if (confirm(`¿Borrar la baraja "${currentUser.decks[activeDeckIndex].name}"?`)) {
      currentUser.decks.splice(activeDeckIndex, 1);
      currentUser.activeDeckIdx = 0;
      activeDeckIndex = 0;

      db.ref(`users/${currentUser.username}/decks`).set(currentUser.decks);
      db.ref(`users/${currentUser.username}/activeDeckIdx`).set(0);
      renderDeckBuilder();
    }
  };

  renameInput.addEventListener("change", () => {
    const newName = renameInput.value.trim();
    if (!newName) return;

    currentUser.decks[activeDeckIndex].name = newName;
    db.ref(`users/${currentUser.username}/decks`).set(currentUser.decks);
    populateDeckDropdown();
  });

  document.getElementById("btn-save-deck").onclick = () => {
    const currentDeck = currentUser.decks[activeDeckIndex];
    if (currentDeck.cards.length !== 10) {
      alert("La baraja principal debe tener exactamente 10 cartas.");
      return;
    }
    if (currentDeck.support.length !== 2) {
      alert("La baraja de apoyo debe tener exactamente 2 cartas.");
      return;
    }

    db.ref(`users/${currentUser.username}/decks`).set(currentUser.decks, (err) => {
      if (!err) {
        alert(`¡Baraja "${currentDeck.name}" guardada con éxito!`);
        showScreen("screen-lobby");
      }
    });
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
      <div class="card-desc-tooltip">${card.description || "Carta crossover."}</div>
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
      const countInDeck = activeDeck.cards ? activeDeck.cards.filter(id => id === card.id).length : 0;
      const countInSupport = activeDeck.support ? activeDeck.support.filter(id => id === card.id).length : 0;
      const totalUsed = countInDeck + countInSupport;

      if (totalUsed >= qty) {
        alert("No tienes más copias disponibles de esta carta.");
        return;
      }

      if (card.isSupport) {
        if (!activeDeck.support) activeDeck.support = [];
        if (activeDeck.support.length >= 2) {
          alert("Ya tienes 2 cartas de apoyo.");
          return;
        }
        activeDeck.support.push(card.id);
      } else {
        if (!activeDeck.cards) activeDeck.cards = [];
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
  if (!activeDeck.cards) activeDeck.cards = [];
  if (!activeDeck.support) activeDeck.support = [];

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

// --- TIENDA DE SOBRES (SISTEMA MULTI-EXPANSIÓN) ---

// Definición de tipos de sobres — añade aquí nuevas expansiones en el futuro
const PACK_TYPES = [
  {
    id: "base",
    name: "Sobre Expansión \"Galaxy\"",
    emoji: "🌌",
    image: "sobre_galaxy.png",
    description: "Contiene 5 cartas aleatorias oficiales y crossover de la expansión Galaxy. ¡Garantiza al menos una Rara o superior!",
    price: 500,
    color: "var(--neon-cyan)",
    gradient: "linear-gradient(135deg, #1f2336 0%, #0d0f17 100%)",
    rates: { common: 70, rare: 20, epic: 8, legendary: 2 },
    cardsPerPack: 5,
    cardFilter: (card) => true
  }
];

function setupShopEvents() {
  // Los botones se generan dinámicamente en updateShopUI
  // Solo configurar el overlay de apertura
  document.getElementById("booster-pack-model").onclick = () => {
    const packModel = document.getElementById("booster-pack-model");
    packModel.classList.add("ripping");
    setTimeout(() => {
      packModel.classList.add("hidden");
      generateBoosterCards(currentOpeningPackId);
    }, 600);
  };

  document.getElementById("btn-finish-opening").onclick = () => {
    document.getElementById("pack-opening-overlay").classList.add("hidden");
    updateShopUI();
    updateLobbyUI();
  };
}

let currentOpeningPackId = "base"; // El tipo de sobre que se está abriendo

function updateShopUI() {
  if (!currentUser) return;

  const karmEl = document.getElementById("shop-karm-balance");
  if (karmEl) karmEl.textContent = currentUser.karm;

  const packs = currentUser.packs || {};

  // === Catálogo de sobres para comprar ===
  const catalog = document.getElementById("shop-packs-catalog");
  if (!catalog) return;
  catalog.innerHTML = "";

  PACK_TYPES.forEach(pack => {
    const card = document.createElement("div");
    card.className = "glass-card shop-buy-card";

    // Crear elementos individualmente para evitar problemas con caracteres especiales
    const visual = document.createElement("div");
    visual.className = "shop-pack-visual";
    if (pack.image) {
      visual.textContent = "";
      visual.style.backgroundImage = `url('${pack.image}')`;
      visual.style.backgroundSize = "cover";
      visual.style.backgroundPosition = "center";
      visual.style.borderRadius = "8px";
      visual.style.border = "none";
    } else {
      visual.textContent = pack.emoji;
    }

    const title = document.createElement("h2");
    title.textContent = pack.name;

    const desc = document.createElement("p");
    desc.style.cssText = "font-size:0.85rem; color:var(--text-muted); text-align:center;";
    desc.textContent = pack.description;

    const rates = document.createElement("div");
    rates.className = "rarity-rates";
    rates.innerHTML = `<span>Común: ${pack.rates.common}%</span> | <span>Rara: ${pack.rates.rare}%</span> | <span>Épica: ${pack.rates.epic}%</span> | <span>Legendaria: ${pack.rates.legendary}%</span>`;

    const price = document.createElement("div");
    price.className = "price-tag";
    price.textContent = `${pack.price} Karms`;

    const buyBtn = document.createElement("button");
    buyBtn.className = "btn btn-primary btn-glow";
    buyBtn.textContent = "Comprar Sobre";
    buyBtn.onclick = () => buyPack(pack.id);

    card.appendChild(visual);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(rates);
    card.appendChild(price);
    card.appendChild(buyBtn);
    catalog.appendChild(card);
  });


  // === Inventario del jugador ===
  const inventoryList = document.getElementById("shop-packs-inventory-list");
  if (inventoryList) {
    inventoryList.innerHTML = "";
    PACK_TYPES.forEach(pack => {
      const qty = packs[pack.id] || 0;
      const row = document.createElement("div");
      row.style.cssText = "justify-content:space-between; display:flex; width:100%; align-items:center; padding: 6px 0;";

      const label = document.createElement("span");
      label.textContent = `${pack.emoji} ${pack.name}`;

      const count = document.createElement("strong");
      count.textContent = qty;
      count.style.color = qty > 0 ? "#00f2fe" : "var(--text-muted)";
      count.style.fontSize = "1.1rem";

      row.appendChild(label);
      row.appendChild(count);
      inventoryList.appendChild(row);
    });
  }

  // === Botones de apertura ===
  const openButtons = document.getElementById("shop-open-buttons");
  if (openButtons) {
    openButtons.innerHTML = "";
    PACK_TYPES.forEach(pack => {
      const qty = packs[pack.id] || 0;
      const btn = document.createElement("button");
      btn.className = "btn btn-accent btn-glow";
      btn.textContent = `✨ Abrir ${pack.name}`;
      btn.disabled = qty <= 0;
      btn.style.opacity = qty <= 0 ? "0.4" : "1";
      btn.onclick = () => openPack(pack.id);
      openButtons.appendChild(btn);
    });
  }
}

window.buyPack = function(packId) {
  const pack = PACK_TYPES.find(p => p.id === packId);
  if (!pack) return;

  syncUserData(() => {
    if (currentUser.karm < pack.price) {
      alert(`No tienes suficientes Karms. Necesitas ${pack.price}, tienes ${currentUser.karm}.`);
      return;
    }
    currentUser.karm -= pack.price;
    if (!currentUser.packs) currentUser.packs = {};
    currentUser.packs[packId] = (currentUser.packs[packId] || 0) + 1;

    db.ref(`users/${currentUser.username}/karm`).set(currentUser.karm);
    db.ref(`users/${currentUser.username}/packs/${packId}`).set(currentUser.packs[packId], () => {
      updateShopUI();
      alert(`¡${pack.emoji} Sobre "${pack.name}" comprado!`);
    });
  });
};

function openPack(packId) {
  const pack = PACK_TYPES.find(p => p.id === packId);
  if (!pack) return;

  syncUserData(() => {
    const qty = currentUser.packs ? (currentUser.packs[packId] || 0) : 0;
    if (qty <= 0) {
      alert(`No tienes sobres de este tipo.`);
      return;
    }

    currentUser.packs[packId]--;
    db.ref(`users/${currentUser.username}/packs/${packId}`).set(currentUser.packs[packId], () => {
      updateShopUI();

      // Mostrar overlay con datos del sobre
      currentOpeningPackId = packId;
      const overlay = document.getElementById("pack-opening-overlay");
      const packModel = document.getElementById("booster-pack-model");

      document.getElementById("pack-opening-title").textContent = `Abriendo: ${pack.name}`;
      
      // Personalizar el modelo de sobre con su imagen
      if (pack.image) {
        packModel.style.backgroundImage = `url('${pack.image}')`;
        packModel.style.backgroundSize = "cover";
        packModel.style.backgroundPosition = "center";
        // Ocultar textos por defecto si hay imagen
        document.getElementById("pack-brand-text").style.display = "none";
        document.getElementById("pack-logo-text").style.display = "none";
        document.getElementById("pack-expansion-label").style.display = "none";
      } else {
        packModel.style.backgroundImage = "none";
        document.getElementById("pack-brand-text").style.display = "block";
        document.getElementById("pack-logo-text").style.display = "block";
        document.getElementById("pack-expansion-label").style.display = "block";
        document.getElementById("pack-brand-text").textContent = "ULTIMATE";
        document.getElementById("pack-logo-text").textContent = "CROSSOVER";
        document.getElementById("pack-expansion-label").textContent = packId.toUpperCase();
      }

      packModel.style.borderColor = pack.color;
      packModel.style.boxShadow = `0 0 30px ${pack.color}`;

      packModel.classList.remove("ripping", "hidden");
      document.getElementById("revealed-cards-container").classList.add("hidden");
      document.getElementById("revealed-cards-container").innerHTML = "";
      document.getElementById("btn-finish-opening").classList.add("hidden");
      overlay.classList.remove("hidden");
    });
  });
}


function generateBoosterCards(packId) {
  const packDef = PACK_TYPES.find(p => p.id === (packId || "base")) || PACK_TYPES[0];
  const revealedGrid = document.getElementById("revealed-cards-container");
  const finishBtn = document.getElementById("btn-finish-opening");
  revealedGrid.innerHTML = "";
  revealedGrid.classList.remove("hidden");

  const cardsDrawn = [];
  const fullPool = [...defaultCardsList, ...customCards];
  // Filtrar según la definición del pack
  const pool = fullPool.filter(packDef.cardFilter);

  const commons     = pool.filter(c => c.rarity === "common");
  const rares       = pool.filter(c => c.rarity === "rare");
  const epics       = pool.filter(c => c.rarity === "epic");
  const legendaries = pool.filter(c => c.rarity === "legendary");

  // Fallback si algún pool está vacío
  const safeCommons = commons.length > 0 ? commons : fullPool;

  const rarityLabels = { common: "Común", rare: "Rara", epic: "Épica", legendary: "Legendaria" };
  const rates = packDef.rates;

  const totalCards = packDef.cardsPerPack || 5;

  for (let i = 0; i < totalCards; i++) {
    const roll = Math.random() * 100;

    // Última carta garantiza rareza alta si sale común
    let subPool;
    if (i === totalCards - 1 && roll < rates.common) {
      // Garantía: la carta final es al menos Rara
      const highRoll = Math.random() * (rates.rare + rates.epic + rates.legendary);
      if (highRoll < rates.rare && rares.length > 0) subPool = rares;
      else if (highRoll < rates.rare + rates.epic && epics.length > 0) subPool = epics;
      else if (legendaries.length > 0) subPool = legendaries;
      else subPool = rares.length > 0 ? rares : safeCommons;
    } else {
      if (roll < rates.common)                                                         subPool = safeCommons;
      else if (roll < rates.common + rates.rare && rares.length > 0)                   subPool = rares;
      else if (roll < rates.common + rates.rare + rates.epic && epics.length > 0)      subPool = epics;
      else if (legendaries.length > 0)                                                  subPool = legendaries;
      else subPool = safeCommons;
    }

    const randomCard = subPool[Math.floor(Math.random() * subPool.length)];
    if (!randomCard) continue;
    cardsDrawn.push(randomCard);

    // Actualizar colección del jugador
    if (!currentUser.collection) currentUser.collection = [];
    const existing = currentUser.collection.find(item => item.cardId === randomCard.id);
    if (existing) {
      existing.qty++;
    } else {
      currentUser.collection.push({ cardId: randomCard.id, qty: 1 });
    }
  }

  // Guardar colección actualizada en Firebase
  db.ref(`users/${currentUser.username}/collection`).set(currentUser.collection);

  // Revelar cartas una a una con animación
  cardsDrawn.forEach((card, index) => {
    const cardDiv = document.createElement("div");
    cardDiv.className = `game-card rarity-${card.rarity}`;
    cardDiv.style.opacity = "0";
    cardDiv.style.transform = "scale(0.5) rotateY(90deg)";

    const label = rarityLabels[card.rarity] || "Común";
    const patternMap = { front: "⬆️ FRENTE", adjacent: "↔️ LADOS", right: "➡️ DERECHA", defense: "🛡️ DEFENSA" };

    cardDiv.innerHTML = `
      <div class="card-cost">${card.cost}</div>
      <div class="card-rarity-badge">${label}</div>
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

    revealedGrid.appendChild(cardDiv);

    setTimeout(() => {
      cardDiv.style.transition = "all 0.55s cubic-bezier(0.18, 0.89, 0.32, 1.28)";
      cardDiv.style.opacity = "1";
      cardDiv.style.transform = "scale(1) rotateY(0deg)";
    }, index * 450);
  });

  setTimeout(() => {
    finishBtn.classList.remove("hidden");
  }, totalCards * 450 + 200);
}

// --- CONSOLA DE ADMINISTRADOR (FIREBASE) ---
let adminPanelInitialized = false;

function renderAdminPanel() {
  const tbody = document.getElementById("admin-users-tbody");
  tbody.innerHTML = "";

  const userSelect = document.getElementById("admin-gift-user-select");
  const packSelect = document.getElementById("admin-gift-pack-id");
  const cardSelect = document.getElementById("admin-gift-card-id");

  userSelect.innerHTML = "";
  packSelect.innerHTML = "";
  cardSelect.innerHTML = "";

  // Llenar tipo de sobres
  PACK_TYPES.forEach(pt => {
    const opt = document.createElement("option");
    opt.value = pt.id;
    opt.textContent = `${pt.emoji} ${pt.name}`;
    packSelect.appendChild(opt);
  });

  // Llenar cartas del pool completo
  const allCards = [...DEFAULT_CARDS, ...customCards];
  allCards.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    const label = c.isSupport ? "Apoyo" : "Guerrero";
    opt.textContent = `[${label}] ${c.name} (Coste: ${c.cost} | ⚔️${c.attack} ❤️${c.health})`;
    cardSelect.appendChild(opt);
  });

  // Cargar usuarios y llenar desplegable
  db.ref(`users`).once("value", (snapshot) => {
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const u = child.val();
        
        // Agregar al select de usuarios
        const opt = document.createElement("option");
        opt.value = u.username;
        opt.textContent = `${u.username} (${u.friendCode})`;
        userSelect.appendChild(opt);

        // Renderizar fila de la tabla
        const packsText = PACK_TYPES.map(pt => {
          const qty = u.packs ? (u.packs[pt.id] || 0) : 0;
          return `${pt.emoji} ${qty}`;
        }).join(" | ");
        const cardsTotal = u.collection ? u.collection.reduce((acc, curr) => acc + curr.qty, 0) + 12 : 12;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${u.username}</strong><br><small>${u.email}</small></td>
          <td>${u.friendCode}</td>
          <td>🪙 ${u.karm}</td>
          <td>${packsText}</td>
          <td>🎴 ${cardsTotal} Cartas</td>
          <td>
            <button class="btn btn-warning btn-sm" onclick="quickGiftPack('${u.username}')">🎁 +1 Sobre</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  });

  // Inicializar eventos del panel solo una vez
  if (!adminPanelInitialized) {
    adminPanelInitialized = true;

    const giftTypeSelect = document.getElementById("admin-gift-type");
    const packContainer = document.getElementById("admin-gift-pack-select-container");
    const cardContainer = document.getElementById("admin-gift-card-select-container");

    giftTypeSelect.onchange = () => {
      const type = giftTypeSelect.value;
      if (type === "packs") {
        packContainer.classList.remove("hidden");
        cardContainer.classList.add("hidden");
      } else if (type === "card") {
        packContainer.classList.add("hidden");
        cardContainer.classList.remove("hidden");
      } else {
        packContainer.classList.add("hidden");
        cardContainer.classList.add("hidden");
      }
    };

    document.getElementById("btn-admin-submit-gift").onclick = () => {
      const targetUser = userSelect.value;
      const giftType = giftTypeSelect.value;
      const qty = parseInt(document.getElementById("admin-gift-qty").value) || 1;

      if (qty < 1) {
        alert("La cantidad debe ser al menos 1.");
        return;
      }

      if (giftType === "packs") {
        const packId = packSelect.value;
        giftResources(targetUser, "packs", packId, qty);
      } else if (giftType === "card") {
        const cardId = cardSelect.value;
        giftResources(targetUser, "card", cardId, qty);
      } else if (giftType === "karm") {
        giftResources(targetUser, "karm", null, qty);
      }
    };
  }
}

function giftResources(targetUsername, type, itemId, qty) {
  const ref = db.ref(`users/${targetUsername}`);
  ref.once("value", (snapshot) => {
    if (!snapshot.exists()) {
      alert("Usuario no encontrado.");
      return;
    }
    const u = snapshot.val();

    if (type === "packs") {
      if (!u.packs) u.packs = {};
      // Compatibilidad con formatos antiguos de un solo número
      if (typeof u.packs === "number") {
        u.packs = { base: u.packs };
      }
      u.packs[itemId] = (u.packs[itemId] || 0) + qty;
      ref.child("packs").set(u.packs, () => {
        alert(`🎁 Se han regalado ${qty} sobre(s) a ${targetUsername}.`);
        renderAdminPanel();
      });
    } else if (type === "card") {
      if (!u.collection) u.collection = [];
      const idx = u.collection.findIndex(item => item.cardId === itemId);
      if (idx !== -1) {
        u.collection[idx].qty += qty;
      } else {
        u.collection.push({ cardId: itemId, qty: qty });
      }
      ref.child("collection").set(u.collection, () => {
        alert(`🎴 Se han regalado ${qty} copia(s) de la carta seleccionada a ${targetUsername}.`);
        renderAdminPanel();
      });
    } else if (type === "karm") {
      u.karm = (u.karm || 0) + qty;
      ref.child("karm").set(u.karm, () => {
        alert(`🪙 Se han regalado ${qty} Karms a ${targetUsername}.`);
        renderAdminPanel();
      });
    }
  });
}

window.quickGiftPack = function(targetUsername) {
  giftResources(targetUsername, "packs", "base", 1);
};


// --- SISTEMA DE EMPAREJAMIENTO RÁPIDO (MATCHMAKING) ---
let matchmakingListener = null;

function startMatchmaking() {
  const currentDeck = currentUser.decks[activeDeckIndex];
  if (!currentDeck || !currentDeck.cards || currentDeck.cards.length !== 10 || currentDeck.support.length !== 2) {
    alert("Primero debes armar y guardar una baraja completa de 10 cartas y 2 de apoyo.");
    showScreen("screen-deck");
    return;
  }

  const overlay = document.getElementById("matchmaking-overlay");
  overlay.classList.remove("hidden");

  // Transacción atómica en Firebase para cola de emparejamiento
  const queueRef = db.ref("matchmaking_queue");
  queueRef.transaction((currentQueue) => {
    // Si no hay cola, la creamos
    if (!currentQueue) {
      currentQueue = {};
    }
    
    // Buscar si hay alguien más esperando
    let waitingPlayerKey = null;
    Object.keys(currentQueue).forEach(key => {
      if (currentQueue[key].username !== currentUser.username && currentQueue[key].status === "waiting") {
        waitingPlayerKey = key;
      }
    });

    if (waitingPlayerKey) {
      // Emparejar: sacar al otro jugador de la cola y poner estado matched
      const opp = currentQueue[waitingPlayerKey];
      const battleId = `battle_rand_${Date.now()}`;
      
      opp.status = "matched";
      opp.battleId = battleId;
      opp.opponent = currentUser.username;
      
      // Crear registro temporal local de este emparejamiento
      currentQueue[currentUser.username] = {
        username: currentUser.username,
        status: "matched",
        battleId: battleId,
        opponent: opp.username,
        role: "player2" // El emparejador será Player 2
      };
      
      // Actualizar el ticket del oponente
      currentQueue[waitingPlayerKey] = opp;
    } else {
      // No hay nadie, nos ponemos en espera
      currentQueue[currentUser.username] = {
        username: currentUser.username,
        status: "waiting",
        timestamp: Date.now(),
        role: "player1" // El que espera iniciará la sala al ser retado
      };
    }
    return currentQueue;
  }, (error, committed, snapshot) => {
    if (error) {
      alert("Error al entrar a la cola de emparejamiento.");
      overlay.classList.add("hidden");
      return;
    }
    
    // Escuchar cambios en mi ticket de cola
    listenToMyQueueTicket();
  });
}

function listenToMyQueueTicket() {
  const myQueueRef = db.ref(`matchmaking_queue/${currentUser.username}`);
  if (matchmakingListener) matchmakingListener.off();

  matchmakingListener = myQueueRef;
  myQueueRef.on("value", (snap) => {
    if (!snap.exists()) return;
    const ticket = snap.val();

    if (ticket.status === "matched") {
      // Remover listener de la cola y entrar al juego
      myQueueRef.off();
      document.getElementById("matchmaking-overlay").classList.add("hidden");

      // El Player 1 inicia la sala en Firebase, el Player 2 espera y se suscribe
      const duelSim = {
        id: ticket.battleId,
        from: ticket.role === "player1" ? currentUser.username : ticket.opponent,
        to: ticket.role === "player1" ? ticket.opponent : currentUser.username,
        status: "accepted"
      };

      // Limpiar mi ticket de la cola
      db.ref(`matchmaking_queue/${currentUser.username}`).remove();

      battleEntering = true;
      if (ticket.role === "player1") {
        // Inicializar sala de batalla
        initiateBattleRoom(duelSim, "player1");
      } else {
        // Conectarse a sala de batalla existente
        initiateBattleRoom(duelSim, "player2");
      }
    }
  });
}

function cancelMatchmaking() {
  const overlay = document.getElementById("matchmaking-overlay");
  overlay.classList.add("hidden");
  
  if (matchmakingListener) {
    matchmakingListener.off();
  }
  
  db.ref(`matchmaking_queue/${currentUser.username}`).remove(() => {
    alert("Búsqueda de oponente cancelada.");
  });
}

