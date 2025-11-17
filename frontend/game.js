/**
 * Simple text adventure engine + Mistral integration
 * - State is kept in the browser
 * - Engine commands: look, go <direction>, take <item>, inventory, examine <item>, use <item>
 * - handleUserInput() calls the backend, which calls Mistral and returns { command, narration }.
 * - Then we run the engine command locally.
 */

const gameState = {
    currentRoomId: "pier",
    inventory: [],
    flags: {
      lighthouseDoorUnlocked: false,
      lanternLit: false,
      firstLook: true,
    },
    puzzleProgress: {
      foundLantern: false,
      litLantern: false,
      foundKey: false,
      unlockedDoor: false,
      reachedTop: false,
      litBeacon: false,
    },
    gameComplete: false,
    password: null,
    language: "en",
  };
  
  const rooms = {
    pier: {
      id: "pier",
      name: "Old Pier",
      short: "You stand on a rotten wooden pier in the middle of a foggy night.",
      description:
        "The fog is thick, waves crash somewhere in the dark. Behind you, the pier leads back to the shore; ahead, a faint light marks the outline of a distant lighthouse.",
      exits: {
        north: "beach",
      },
      items: [],
    },
    beach: {
      id: "beach",
      name: "Beach",
      short: "Cold sand stretches around you at the start of a narrow path to the lighthouse.",
      description:
        "Broken planks from an old crate, seaweed tangled in the wind, and a half-buried rusty lantern lie on the beach. To the north: the lighthouse. To the south: the pier.",
      exits: {
        south: "pier",
        north: "lighthouseExterior",
      },
      items: ["lantern"],
    },
    lighthouseExterior: {
      id: "lighthouseExterior",
      name: "Lighthouse Entrance",
      short: "You stand at the foot of a tall lighthouse.",
      description:
        "The tower rises above you, disappearing into the fog. A heavy iron door looks firmly locked. Next to it, a small stone box juts out from the wall.",
      exits: {
        south: "beach",
        inside: "lighthouseInterior",
      },
      items: ["smallKey"],
    },
    lighthouseInterior: {
      id: "lighthouseInterior",
      name: "Lighthouse Base",
      short: "You are inside the base of the lighthouse.",
      description:
        "Stone walls close in around you. A narrow spiral staircase climbs upwards. You can feel a faint draft and see a sliver of light far above.",
      exits: {
        down: "lighthouseExterior",
        up: "lighthouseTop",
      },
      items: [],
    },
    lighthouseTop: {
      id: "lighthouseTop",
      name: "Lamp Room",
      short: "You have reached the top of the lighthouse.",
      description:
        "Old lenses and rusted machinery surround you. The lamp has long been extinguished. Maybe it can be lit again.",
      exits: {
        down: "lighthouseInterior",
      },
      items: [],
    },
  };
  
  const itemDescriptions = {
    lantern: "A rusty but functional lantern. It still smells faintly of oil.",
    smallKey: "A small key, corroded by salt. The letters 'L.F.' are scratched into the metal.",
  };
  
  const logEl = document.getElementById("log");
  const locationNameEl = document.getElementById("location-name");
  const locationMetaEl = document.getElementById("location-meta");
  const inputEl = document.getElementById("cmd-input");
  const sendBtn = document.getElementById("cmd-send");
  const dashboardItemsEl = document.getElementById("dashboard-items");
  const dashboardDirectionsEl = document.getElementById("dashboard-directions");
  const languageSelectorEl = document.getElementById("language-selector");
  const helpHintEl = document.getElementById("help-hint");
  
  function appendLog(message, type = "system") {
    const line = document.createElement("div");
    line.className = `log-line ${type}`;
    line.innerHTML = message;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  
  function updateDashboard() {
    const room = rooms[gameState.currentRoomId];
    if (!room) return;

    // Update items dashboard
    const itemNames = room.items || [];
    if (itemNames.length > 0) {
      const readable = itemNames
        .map((id) => (id === "lantern" ? "a lantern" : id === "smallKey" ? "a small key" : id))
        .map(item => `<div class="dashboard-item">• ${item}</div>`)
        .join("");
      dashboardItemsEl.innerHTML = readable;
    } else {
      dashboardItemsEl.innerHTML = '<span style="color: #6b7280;">-</span>';
    }

    // Update directions dashboard
    const exits = Object.keys(room.exits || {});
    if (exits.length > 0) {
      const directions = exits
        .map(dir => `<div class="dashboard-direction">• ${dir}</div>`)
        .join("");
      dashboardDirectionsEl.innerHTML = directions;
    } else {
      dashboardDirectionsEl.innerHTML = '<span style="color: #6b7280;">-</span>';
    }
  }

  function setLocation(roomId) {
    const room = rooms[roomId];
    if (!room) return;
  
    gameState.currentRoomId = roomId;
    locationNameEl.textContent = room.name;
    locationMetaEl.textContent = room.short;
  
    // Update dashboard instead of logging items/directions
    updateDashboard();
  
    const firstTimeHereKey = `visited_${roomId}`;
    const firstTime = !gameState.flags[firstTimeHereKey];
  
    if (firstTime) {
      gameState.flags[firstTimeHereKey] = true;
      // Don't log description here - let Mistral handle it in narration
    }
  }
  
  function describeCurrentRoom() {
    // Don't log description here - let Mistral handle it in narration
    // Just update dashboard
    updateDashboard();
  }
  
  function showHelp() {
    const helpTexts = {
      en: [
        "<span class='prompt'>•</span> Some commands you can use:",
        "- <code>look</code> : Look around in more detail.",
        "- <code>go north/south/east/west</code> or <code>go up/down</code>: Move between locations.",
        "- <code>take &lt;item&gt;</code> : Take an item (e.g. <code>take key</code>).",
        "- <code>inventory</code> : Check what you're carrying.",
        "- <code>examine &lt;item&gt;</code> : Inspect an item closely.",
        "- <code>use &lt;item&gt;</code> : Use an item (if it makes sense here).",
      ],
      tr: [
        "<span class='prompt'>•</span> Kullanabileceğiniz bazı komutlar:",
        "- <code>bak</code> : Etrafı daha detaylı incele.",
        "- <code>kuzeye/güneye/doğuya/batıya git</code> veya <code>yukarı/aşağı git</code>: Konumlar arasında hareket et.",
        "- <code>&lt;eşya&gt; al</code> : Bir eşya al (örn. <code>anahtar al</code>).",
        "- <code>envanter</code> : Taşıdığın eşyaları kontrol et.",
        "- <code>&lt;eşya&gt; incele</code> : Bir eşyayı yakından incele.",
        "- <code>&lt;eşya&gt; kullan</code> : Bir eşya kullan (eğer burada mantıklıysa).",
      ],
    };
    const help = helpTexts[gameState.language] || helpTexts.en;
    appendLog(help.join("<br/>"), "system");
  }
  
  function move(direction) {
    const room = rooms[gameState.currentRoomId];
    if (!room || !room.exits) {
      appendLog("<span class='prompt'>!</span> You can't go anywhere from here.", "important");
      return;
    }
  
    if (direction === "inside" || direction === "in") {
      direction = "inside";
    }
  
    const nextId = room.exits[direction];
    if (!nextId) {
      appendLog(
        `<span class='prompt'>!</span> You can't go that way (<strong>${direction}</strong>).`,
        "important"
      );
      return;
    }
  
    if (nextId === "lighthouseInterior" && !gameState.flags.lighthouseDoorUnlocked) {
      appendLog(
        "<span class='prompt'>!</span> The iron door is locked. Maybe there's a key nearby?",
        "important"
      );
      return;
    }

    // Update puzzle progress for reaching top
    if (nextId === "lighthouseTop") {
      gameState.puzzleProgress.reachedTop = true;
    }

    setLocation(nextId);
  }
  
  function take(itemWord) {
    const room = rooms[gameState.currentRoomId];
    if (!room) return;
  
    const canonicalItem = normalizeItemName(itemWord);
    if (!canonicalItem) {
      appendLog("<span class='prompt'>!</span> I'm not sure what you're trying to take.", "important");
      return;
    }
  
    const idx = (room.items || []).indexOf(canonicalItem);
    if (idx === -1) {
      appendLog("<span class='prompt'>!</span> You don't see anything like that here.", "important");
      return;
    }
  
    room.items.splice(idx, 1);
    gameState.inventory.push(canonicalItem);

    // Update puzzle progress
    if (canonicalItem === "lantern") {
      gameState.puzzleProgress.foundLantern = true;
    }
    if (canonicalItem === "smallKey") {
      gameState.puzzleProgress.foundKey = true;
    }

    // Update dashboard after taking item
    updateDashboard();
  }
  
  function inventory() {
    if (gameState.inventory.length === 0) {
      appendLog("<span class='prompt'>•</span> You are not carrying anything.", "system");
      return;
    }
    const items = gameState.inventory.map(readableItemName).join(", ");
    appendLog(`<span class='prompt'>•</span> You are carrying: <strong>${items}</strong>.`, "system");
  }
  
  function examine(itemWord) {
    const canonicalItem = normalizeItemName(itemWord);
    if (!canonicalItem) {
      appendLog("<span class='prompt'>!</span> I'm not sure what you want to examine.", "important");
      return;
    }
  
    const hasIt = gameState.inventory.includes(canonicalItem);
    const inRoom = (rooms[gameState.currentRoomId].items || []).includes(canonicalItem);
  
    if (!hasIt && !inRoom) {
      appendLog("<span class='prompt'>!</span> There's nothing like that to examine.", "important");
      return;
    }
  
    const desc = itemDescriptions[canonicalItem];
    if (desc) {
      appendLog(`<span class='prompt'>•</span> ${desc}`, "response");
    } else {
      appendLog("<span class='prompt'>•</span> It looks fairly ordinary.", "system");
    }
  }
  
  function useItem(itemWord) {
    const canonicalItem = normalizeItemName(itemWord);
    if (!canonicalItem) {
      appendLog("<span class='prompt'>!</span> I'm not sure what you want to use.", "important");
      return;
    }
  
    const hasIt = gameState.inventory.includes(canonicalItem);
    if (!hasIt) {
      appendLog("<span class='prompt'>!</span> You're not carrying that.", "important");
      return;
    }
  
    const roomId = gameState.currentRoomId;
  
    if (canonicalItem === "smallKey" && roomId === "lighthouseExterior") {
      if (gameState.flags.lighthouseDoorUnlocked) {
        appendLog("<span class='prompt'>•</span> The door is already unlocked.", "system");
      } else {
        gameState.flags.lighthouseDoorUnlocked = true;
        gameState.puzzleProgress.unlockedDoor = true;
        appendLog(
          "<span class='prompt'>+</span> You turn the key. The iron door unlocks with a heavy click. You can now go inside (<code>go inside</code>).",
          "important"
        );
      }
      return;
    }

    if (canonicalItem === "lantern") {
      if (roomId === "lighthouseTop") {
        // Final puzzle: light the beacon
        if (gameState.puzzleProgress.litBeacon) {
          appendLog("<span class='prompt'>•</span> The lighthouse beacon is already lit, casting its light across the bay.", "system");
        } else if (gameState.flags.lanternLit) {
          gameState.puzzleProgress.litBeacon = true;
          appendLog(
            "<span class='prompt'>+</span> You use the lit lantern to ignite the lighthouse beacon. A brilliant light pierces through the fog, illuminating Tugrul Bay!",
            "important"
          );
          // Check if all puzzles are complete
          checkGameCompletion();
        } else {
          appendLog("<span class='prompt'>!</span> The lantern needs to be lit first before you can use it to light the beacon.", "important");
        }
        return;
      } else {
        if (gameState.flags.lanternLit) {
          appendLog("<span class='prompt'>•</span> The lantern is already lit, casting a soft glow around you.", "system");
        } else {
          gameState.flags.lanternLit = true;
          gameState.puzzleProgress.litLantern = true;
          appendLog(
            "<span class='prompt'>+</span> You light the lantern. Shapes in the fog become a little clearer.",
            "important"
          );
        }
        return;
      }
    }

    appendLog("<span class='prompt'>•</span> Using that doesn't seem to do anything useful here.", "system");
  }

  function checkGameCompletion() {
    const progress = gameState.puzzleProgress;
    const allComplete = 
      progress.foundLantern &&
      progress.litLantern &&
      progress.foundKey &&
      progress.unlockedDoor &&
      progress.reachedTop &&
      progress.litBeacon;

    if (allComplete && !gameState.gameComplete) {
      // The backend should handle this, but we can also check locally
      // The password will be revealed by the backend response
    }
  }
  
  function normalizeItemName(word = "") {
    const w = word.toLowerCase();
    if (!w) return null;
    if (["key"].includes(w)) return "smallKey";
    if (["lantern"].includes(w)) return "lantern";
    return null;
  }
  
  function readableItemName(id) {
    if (id === "smallKey") return "small key";
    if (id === "lantern") return "lantern";
    return id;
  }
  
  // ---- NEW: helper to serialize game state for backend ----
  function getSerializableState() {
    return {
      currentRoomId: gameState.currentRoomId,
      inventory: [...gameState.inventory],
      flags: { ...gameState.flags },
      puzzleProgress: { ...gameState.puzzleProgress },
      gameComplete: gameState.gameComplete,
      language: gameState.language,
    };
  }
  
  // ---- Engine command executor (no logging of raw input here) ----
  function handleEngineCommand(engineCommand) {
    const input = engineCommand.trim();
    if (!input) return;
  
    const lower = input.toLowerCase();
    const parts = lower.split(/\s+/);
    const verb = parts[0];
    const arg = parts.slice(1).join(" ");
  
    switch (verb) {
      case "look":
      case "l":
        describeCurrentRoom();
        break;
      case "help":
        showHelp();
        break;
      case "go":
        if (!arg) {
          appendLog("<span class='prompt'>!</span> You should specify a direction.", "important");
        } else {
          move(arg);
        }
        break;
      case "north":
      case "south":
      case "east":
      case "west":
      case "up":
      case "down":
      case "inside":
        move(verb);
        break;
      case "take":
      case "get":
        if (!arg) {
          appendLog("<span class='prompt'>!</span> What do you want to take?", "important");
        } else {
          take(arg);
        }
        break;
      case "inventory":
      case "inv":
      case "i":
        inventory();
        break;
      case "examine":
      case "x":
        if (!arg) {
          appendLog("<span class='prompt'>!</span> What do you want to examine?", "important");
        } else {
          examine(arg);
        }
        break;
      case "use":
        if (!arg) {
          appendLog("<span class='prompt'>!</span> What do you want to use?", "important");
        } else {
          useItem(arg);
        }
        break;
      default:
        appendLog(
          "<span class='prompt'>?</span> The engine does not understand that command. Type <code>help</code> for options.",
          "important"
        );
    }
  }
  
  // ---- NEW: LLM-powered user input handler ----
  async function handleUserInput(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;
  
    // show what the player typed
    appendLog(`<span class="prompt">$</span> ${trimmed}`, "command");
  
    try {
  const response = await fetch("/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: trimmed,
      state: getSerializableState(),
      language: gameState.language, // Send selected language to backend
    }),
  });
  
  
      if (!response.ok) {
        appendLog(
          "<span class='prompt'>!</span> The wind howls oddly — something went wrong talking to the oracle.",
          "important"
        );
        console.error("Backend error", await response.text());
        return;
      }
  
      const data = await response.json();
      const engineCommand = (data.command || "").trim();
      const narration = (data.narration || "").trim();

      // Don't update language - use the selected language consistently
      // The backend should respect the selected language

      // Update puzzle progress
      if (data.puzzleProgress) {
        gameState.puzzleProgress = { ...gameState.puzzleProgress, ...data.puzzleProgress };
      }

      // Check for game completion
      if (data.gameComplete && !gameState.gameComplete) {
        gameState.gameComplete = true;
        if (data.password) {
          gameState.password = data.password;
          showGameComplete(data.password, data.language || "en");
        }
      }

      if (narration) {
        appendLog(`<span class="prompt">&gt;</span> ${narration}`, "response");
      }

      if (engineCommand) {
        handleEngineCommand(engineCommand);
      }
    } catch (err) {
      console.error("Error calling /api/interpret:", err);
      appendLog(
        "<span class='prompt'>!</span> The connection to the lighthouse spirits is lost for a moment.",
        "important"
      );
    }
  }
  
  function showGameComplete(password, language) {
    const isTurkish = language === "tr";
    const messages = {
      en: {
        title: "🎉 CONGRATULATIONS! 🎉",
        message: "You have solved all the puzzles and unlocked the secret!",
        passwordLabel: "The secret password is:",
      },
      tr: {
        title: "🎉 TEBRİKLER! 🎉",
        message: "Tüm bulmacaları çözdünüz ve sırrı açtınız!",
        passwordLabel: "Gizli şifre:",
      },
    };
    const msg = messages[language] || messages.en;

    appendLog("", "system");
    appendLog(`<span class='prompt'>★</span> <strong style="color: #fbbf24; font-size: 16px;">${msg.title}</strong>`, "important");
    appendLog(`<span class='prompt'>★</span> ${msg.message}`, "important");
    appendLog(`<span class='prompt'>★</span> ${msg.passwordLabel}`, "important");
    appendLog(`<span class='prompt'>★</span> <strong style="color: #22c55e; font-size: 18px; letter-spacing: 2px;">${password}</strong>`, "important");
    appendLog("", "system");
  }

  function selectLanguage(lang) {
    gameState.language = lang;
    const selector = document.getElementById("language-selector");
    if (selector) {
      selector.style.display = "none";
      selector.classList.add("hidden");
    }
    
    // Update UI based on language
    const translations = {
      en: {
        placeholder: "Type a command (e.g. look, go north, take key)...",
        help: "Example commands: <code>look</code>, <code>go north</code>, <code>take key</code>, <code>inventory</code>, <code>help</code>.",
        itemsTitle: "Items Here",
        directionsTitle: "Directions",
        welcome: "A foggy night at Tugrul Bay. The lighthouse has been dark for a long time. Perhaps tonight, someone will light it again...",
      },
      tr: {
        placeholder: "Bir komut yazın (örn. bak, kuzeye git, anahtar al)...",
        help: "Örnek komutlar: <code>bak</code>, <code>kuzeye git</code>, <code>anahtar al</code>, <code>envanter</code>, <code>yardım</code>.",
        itemsTitle: "Buradaki Eşyalar",
        directionsTitle: "Yönler",
        welcome: "Tugrul Koyu'nda sisli bir gece. Deniz feneri uzun zamandır karanlık. Belki bu gece, birisi onu tekrar yakacak...",
      },
    };
    
    const t = translations[lang] || translations.en;
    inputEl.placeholder = t.placeholder;
    helpHintEl.innerHTML = t.help;
    document.querySelector("#dashboard-items").previousElementSibling.textContent = t.itemsTitle;
    document.querySelector("#dashboard-directions").previousElementSibling.textContent = t.directionsTitle;
    
    // Start the game
    appendLog(`<span class='prompt'>•</span> ${t.welcome}`, "system");
    setLocation(gameState.currentRoomId);
    updateDashboard(); // Ensure dashboard is initialized
    showHelp();
    inputEl.focus();
  }

  function initGame() {
    // Show language selector
    const langEnBtn = document.getElementById("lang-en");
    const langTrBtn = document.getElementById("lang-tr");
    
    if (langEnBtn) {
      langEnBtn.addEventListener("click", () => {
        selectLanguage("en");
      });
    }
    
    if (langTrBtn) {
      langTrBtn.addEventListener("click", () => {
        selectLanguage("tr");
      });
    }
  }
  
  // Wire UI
  sendBtn.addEventListener("click", () => {
    const value = inputEl.value;
    inputEl.value = "";
    handleUserInput(value);
    inputEl.focus();
  });
  
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = inputEl.value;
      inputEl.value = "";
      handleUserInput(value);
    }
  });
  
  window.addEventListener("load", () => {
    initGame();
  });