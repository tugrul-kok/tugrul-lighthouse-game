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
    // Use requestAnimationFrame to ensure smooth scrolling
    requestAnimationFrame(() => {
      logEl.scrollTop = logEl.scrollHeight;
    });
  }
  
  function updateDashboard() {
    const room = rooms[gameState.currentRoomId];
    if (!room) return;

    const isTurkish = gameState.language === "tr";

    // Direction translations
    const directionTranslations = {
      en: {
        north: "north",
        south: "south",
        east: "east",
        west: "west",
        up: "up",
        down: "down",
        inside: "inside",
      },
      tr: {
        north: "kuzey",
        south: "güney",
        east: "doğu",
        west: "batı",
        up: "yukarı",
        down: "aşağı",
        inside: "içeri",
      },
    };

    // Item translations
    const itemTranslations = {
      en: {
        lantern: "a lantern",
        smallKey: "a small key",
      },
      tr: {
        lantern: "bir fener",
        smallKey: "küçük bir anahtar",
      },
    };

    const translations = isTurkish ? directionTranslations.tr : directionTranslations.en;
    const itemTrans = isTurkish ? itemTranslations.tr : itemTranslations.en;

    // Update items dashboard
    const itemNames = room.items || [];
    if (itemNames.length > 0) {
      const readable = itemNames
        .map((id) => itemTrans[id] || id)
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
        .map(dir => `<div class="dashboard-direction">• ${translations[dir] || dir}</div>`)
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
    // Don't show help - LLM will guide naturally
    // This function is kept for compatibility but does nothing
  }
  
  function move(direction) {
    const room = rooms[gameState.currentRoomId];
    if (!room || !room.exits) {
      // Command failed - will be handled by LLM
      return false;
    }
  
    if (direction === "inside" || direction === "in") {
      direction = "inside";
    }
  
    const nextId = room.exits[direction];
    if (!nextId) {
      // Command failed - will be handled by LLM
      return false;
    }
  
    if (nextId === "lighthouseInterior" && !gameState.flags.lighthouseDoorUnlocked) {
      // Command failed - will be handled by LLM
      return false;
    }

    // Update puzzle progress for reaching top
    if (nextId === "lighthouseTop") {
      gameState.puzzleProgress.reachedTop = true;
    }

    setLocation(nextId);
    return true;
  }
  
  function take(itemWord) {
    const room = rooms[gameState.currentRoomId];
    if (!room) return false;
  
    const canonicalItem = normalizeItemName(itemWord);
    if (!canonicalItem) {
      // Don't show error - LLM will handle this naturally
      return false;
    }
  
    const idx = (room.items || []).indexOf(canonicalItem);
    if (idx === -1) {
      // Don't show error - LLM will handle this naturally
      return false;
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
    return true;
  }
  
  function inventory() {
    // Don't show inventory directly - LLM will handle this naturally in narration
    // Just return success so LLM knows to describe inventory
    return true;
  }
  
  function examine(itemWord) {
    const canonicalItem = normalizeItemName(itemWord);
    if (!canonicalItem) {
      // Don't show error - LLM will handle this naturally
      return false;
    }
  
    const hasIt = gameState.inventory.includes(canonicalItem);
    const inRoom = (rooms[gameState.currentRoomId].items || []).includes(canonicalItem);
  
    if (!hasIt && !inRoom) {
      // Don't show error - LLM will handle this naturally
      return false;
    }
  
    // Don't show description directly - LLM will handle this naturally in narration
    // Just return success so LLM knows to describe the item
    return true;
  }
  
  function useItem(itemWord) {
    const canonicalItem = normalizeItemName(itemWord);
    if (!canonicalItem) {
      // Don't show error - LLM will handle this naturally
      return false;
    }
  
    const hasIt = gameState.inventory.includes(canonicalItem);
    if (!hasIt) {
      // Don't show error - LLM will handle this naturally
      return false;
    }
  
    const roomId = gameState.currentRoomId;
  
    if (canonicalItem === "smallKey" && roomId === "lighthouseExterior") {
      if (gameState.flags.lighthouseDoorUnlocked) {
        // Already unlocked - LLM will handle this
        return true;
      } else {
        gameState.flags.lighthouseDoorUnlocked = true;
        gameState.puzzleProgress.unlockedDoor = true;
        // Success - LLM narration will describe this
        return true;
      }
    }

    if (canonicalItem === "lantern") {
      if (roomId === "lighthouseTop") {
        // Final puzzle: light the beacon
        if (gameState.puzzleProgress.litBeacon) {
          // Already lit - LLM will handle this
          return true;
        } else if (gameState.flags.lanternLit) {
          gameState.puzzleProgress.litBeacon = true;
          // Success - LLM narration will describe this
          checkGameCompletion();
          return true;
        } else {
          // Lantern not lit - LLM will handle this
          return false;
        }
      } else {
        if (gameState.flags.lanternLit) {
          // Already lit - LLM will handle this
          return true;
        } else {
          gameState.flags.lanternLit = true;
          gameState.puzzleProgress.litLantern = true;
          // Success - LLM narration will describe this
          return true;
        }
      }
    }

    // Item used but no specific action - LLM will handle this
    return true;
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
    const w = word.toLowerCase().trim();
    if (!w) return null;
    // English
    if (["key", "smallkey", "small key"].includes(w)) return "smallKey";
    if (["lantern"].includes(w)) return "lantern";
    // Turkish
    if (["anahtar", "küçük anahtar", "küçükanahtar"].includes(w)) return "smallKey";
    if (["fener", "lamba"].includes(w)) return "lantern";
    return null;
  }
  
  function readableItemName(id) {
    const isTurkish = gameState.language === "tr";
    if (id === "smallKey") return isTurkish ? "küçük anahtar" : "small key";
    if (id === "lantern") return isTurkish ? "fener" : "lantern";
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
    if (!input) return true;
  
    const lower = input.toLowerCase();
    const parts = lower.split(/\s+/);
    const verb = parts[0];
    const arg = parts.slice(1).join(" ");
  
    let commandSucceeded = true;
    switch (verb) {
      case "look":
      case "l":
        describeCurrentRoom();
        commandSucceeded = true;
        break;
      case "help":
        // Let LLM handle help requests naturally through conversation
        // Don't show static help text
        commandSucceeded = true;
        break;
      case "go":
        if (!arg) {
          // Don't show error - LLM will handle this naturally
          return false;
        } else {
          return move(arg);
        }
      case "north":
      case "south":
      case "east":
      case "west":
      case "up":
      case "down":
      case "inside":
        return move(verb);
      case "take":
      case "get":
        if (!arg) {
          commandSucceeded = false;
        } else {
          commandSucceeded = take(arg) !== false;
        }
        break;
      case "inventory":
      case "inv":
      case "i":
        inventory();
        commandSucceeded = true;
        break;
      case "examine":
      case "x":
        if (!arg) {
          commandSucceeded = false;
        } else {
          commandSucceeded = examine(arg) !== false;
        }
        break;
      case "use":
        if (!arg) {
          commandSucceeded = false;
        } else {
          commandSucceeded = useItem(arg) !== false;
        }
        break;
      default:
        // Unknown command - assume it succeeded (LLM will handle)
        commandSucceeded = true;
    }
    
    return commandSucceeded;
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

      // Execute engine command and check if it succeeded
      let commandSucceeded = true;
      if (engineCommand) {
        commandSucceeded = handleEngineCommand(engineCommand) !== false;
      }

      // If command failed, ask LLM to explain naturally
      if (!commandSucceeded && engineCommand) {
        const failedMessages = {
          en: `I tried to ${engineCommand} but it didn't work. Explain why naturally and suggest alternatives.`,
          tr: `${engineCommand} komutunu denedim ama işe yaramadı. Nedenini doğal bir şekilde açıkla ve alternatifler öner.`,
        };
        const failedInput = failedMessages[gameState.language] || failedMessages.en;
        
        const failedResponse = await fetch("/interpret", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: failedInput,
            state: getSerializableState(),
            language: gameState.language,
          }),
        });
        
        if (failedResponse.ok) {
          const failedData = await failedResponse.json();
          if (failedData.narration) {
            appendLog(`<span class="prompt">&gt;</span> ${failedData.narration}`, "response");
          }
        }
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

  // Make selectLanguage available globally
  window.selectLanguage = function(lang) {
    console.log("selectLanguage called with:", lang);
    gameState.language = lang;
    
    // Hide the language selector FIRST - try multiple methods
    const selector = document.getElementById("language-selector");
    console.log("Language selector element:", selector);
    if (selector) {
      // Try multiple methods to ensure it's hidden
      selector.style.display = "none";
      selector.style.visibility = "hidden";
      selector.style.opacity = "0";
      selector.classList.add("hidden");
      selector.setAttribute("hidden", "true");
      console.log("Language selector hidden with multiple methods");
    } else {
      console.error("Language selector element not found!");
    }
    
    // Update UI based on language
    const translations = {
      en: {
        placeholder: "Type what you want to do...",
        help: "You can explore, examine objects, move around, and interact with the environment naturally.",
        itemsTitle: "Items Here",
        directionsTitle: "Directions",
        welcome: "A foggy night at Tugrul Bay. The lighthouse has been dark for a long time. Perhaps tonight, someone will light it again...",
        intro: "You can explore this mysterious place naturally. Move in different directions to discover the bay, examine objects you find, take items that catch your interest, and use them to solve puzzles. Your curiosity will guide you through this adventure.",
      },
      tr: {
        placeholder: "Ne yapmak istediğinizi yazın...",
        help: "Etrafı keşfedebilir, nesneleri inceleyebilir, hareket edebilir ve çevreyle doğal bir şekilde etkileşime geçebilirsiniz.",
        itemsTitle: "Buradaki Eşyalar",
        directionsTitle: "Yönler",
        welcome: "Tugrul Koyu'nda sisli bir gece. Deniz feneri uzun zamandır karanlık. Belki bu gece, birisi onu tekrar yakacak...",
        intro: "Bu gizemli yeri doğal bir şekilde keşfedebilirsiniz. Körfezi keşfetmek için farklı yönlere gidebilir, bulduğunuz nesneleri inceleyebilir, ilginizi çeken eşyaları alabilir ve bulmacaları çözmek için kullanabilirsiniz. Merakınız sizi bu macerada yönlendirecek.",
      },
    };
    
    const t = translations[lang] || translations.en;
    
    // Safely update UI elements
    const inputEl = document.getElementById("cmd-input");
    const helpHintEl = document.getElementById("help-hint");
    
    if (inputEl) {
      inputEl.placeholder = t.placeholder;
    }
    if (helpHintEl) {
      helpHintEl.innerHTML = t.help;
    }
    
    const dashboardItemsTitle = document.querySelector("#dashboard-items")?.previousElementSibling;
    const dashboardDirectionsTitle = document.querySelector("#dashboard-directions")?.previousElementSibling;
    
    if (dashboardItemsTitle) {
      dashboardItemsTitle.textContent = t.itemsTitle;
    }
    if (dashboardDirectionsTitle) {
      dashboardDirectionsTitle.textContent = t.directionsTitle;
    }
    
    // Start the game - show welcome and natural intro
    appendLog(`<span class='prompt'>•</span> ${t.welcome}`, "system");
    appendLog(`<span class='prompt'>•</span> ${t.intro}`, "system");
    setLocation(gameState.currentRoomId);
    updateDashboard(); // Ensure dashboard is initialized
    
    if (inputEl) {
      inputEl.focus();
    }
  }

  function initGame() {
    console.log("initGame called");
    // Show language selector
    const langEnBtn = document.getElementById("lang-en");
    const langTrBtn = document.getElementById("lang-tr");
    
    console.log("Language buttons found:", { langEnBtn, langTrBtn });
    
    if (langEnBtn) {
      langEnBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("English button clicked");
        selectLanguage("en");
      });
    } else {
      console.error("English button not found!");
    }
    
    if (langTrBtn) {
      langTrBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Turkish button clicked");
        selectLanguage("tr");
      });
    } else {
      console.error("Turkish button not found!");
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