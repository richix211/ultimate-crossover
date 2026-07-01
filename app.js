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
}

// Escuchador dinámico de invitaciones de duelos
function listenForDuelInvites() {
  db.ref(`duels`).on("value", (snapshot) => {
    renderPendingDuels();

    // Si fui yo quien envió un reto y fue aceptado, entrar a la partida
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const d = child.val();
        if (d.from === currentUser.username && d.status === "accepted") {
          // Limpiar duelo de invitaciones y entrar a la batalla (como Player 1)
          db.ref(`duels/${d.id}`).remove();
          initiateBattleRoom(d, "player1");
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

// --- TIENDA DE SOBRES ---
function setupShopEvents() {
  const buyBtn = document.getElementById("btn-buy-pack");
  const openBtn = document.getElementById("btn-trigger-open-pack");
  const overlay = document.getElementById("pack-opening-overlay");
  const packModel = document.getElementById("booster-pack-model");
  const revealedGrid = document.getElementById("revealed-cards-container");
  const finishBtn = document.getElementById("btn-finish-opening");

  buyBtn.onclick = () => {
    syncUserData(() => {
      if (currentUser.karm < 500) {
        alert("No tienes suficientes Karms (necesitas 500).");
        return;
      }

      currentUser.karm -= 500;
      if (!currentUser.packs) currentUser.packs = { base: 0 };
      currentUser.packs.base = (currentUser.packs.base || 0) + 1;

      db.ref(`users/${currentUser.username}/karm`).set(currentUser.karm);
      db.ref(`users/${currentUser.username}/packs/base`).set(currentUser.packs.base, () => {
        updateShopUI();
        alert("¡Sobre Base comprado!");
      });
    });
  };

  openBtn.onclick = () => {
    syncUserData(() => {
      const basePacks = currentUser.packs ? (currentUser.packs.base || 0) : 0;
      if (basePacks <= 0) return;
      
      currentUser.packs.base--;
      db.ref(`users/${currentUser.username}/packs/base`).set(currentUser.packs.base, () => {
        updateShopUI();
        
        overlay.classList.remove("hidden");
        packModel.classList.remove("ripping");
        packModel.classList.remove("hidden");
        revealedGrid.classList.add("hidden");
        finishBtn.classList.add("hidden");
      });
    });
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
  if (!currentUser) return;
  document.getElementById("shop-karm-balance").textContent = currentUser.karm;
  
  const basePacks = currentUser.packs ? (currentUser.packs.base || 0) : 0;
  document.getElementById("shop-pack-count-base").textContent = basePacks;
  
  const openBtn = document.getElementById("btn-trigger-open-pack");
  if (basePacks > 0) {
    openBtn.removeAttribute("disabled");
    openBtn.disabled = false;
  } else {
    openBtn.setAttribute("disabled", "true");
    openBtn.disabled = true;
  }
}

function generateBoosterCards() {
  const revealedGrid = document.getElementById("revealed-cards-container");
  const finishBtn = document.getElementById("btn-finish-opening");
  revealedGrid.innerHTML = "";
  revealedGrid.classList.remove("hidden");

  const cardsDrawn = [];
  const pool = [...defaultCardsList, ...customCards];

  const commons = pool.filter(c => c.rarity === "common");
  const rares = pool.filter(c => c.rarity === "rare");
  const epics = pool.filter(c => c.rarity === "epic");
  const legendaries = pool.filter(c => c.rarity === "legendary");

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

    const randomCard = subPool[Math.floor(Math.random() * subPool.length)] || commons[0];
    cardsDrawn.push(randomCard);

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

// --- CONSOLA DE ADMINISTRADOR (FIREBASE) ---
function renderAdminPanel() {
  const tbody = document.getElementById("admin-users-tbody");
  tbody.innerHTML = "";

  db.ref(`users`).once("value", (snapshot) => {
    if (snapshot.exists()) {
      let idx = 0;
      snapshot.forEach(child => {
        const u = child.val();
        const basePacks = u.packs ? (u.packs.base || 0) : 0;
        const cardsTotal = u.collection ? u.collection.reduce((acc, curr) => acc + curr.qty, 0) + 12 : 12;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${u.username}</strong><br><small>${u.email}</small></td>
          <td>${u.friendCode}</td>
          <td>🪙 ${u.karm}</td>
          <td>📦 ${basePacks} Sobres</td>
          <td>🎴 ${cardsTotal} Cartas</td>
          <td>
            <button class="btn btn-warning btn-sm" onclick="giftPackToUser('${u.username}')">🎁 Regalar Sobre</button>
          </td>
        `;
        tbody.appendChild(tr);
        idx++;
      });
    }
  });
}

window.giftPackToUser = function(targetUsername) {
  db.ref(`users/${targetUsername}/packs`).once("value", (snapshot) => {
    let currentPacks = { base: 0 };
    if (snapshot.exists()) {
      const snapVal = snapshot.val();
      if (typeof snapVal === "number") currentPacks.base = snapVal;
      else currentPacks = snapVal;
    }
    
    currentPacks.base = (currentPacks.base || 0) + 1;
    
    db.ref(`users/${targetUsername}/packs`).set(currentPacks, () => {
      alert(`¡Se ha regalado 1 sobre a ${targetUsername}!`);
      renderAdminPanel();
    });
  });
};
