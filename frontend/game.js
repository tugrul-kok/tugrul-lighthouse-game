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
  
  function appendLog(message, type = "system") {
    const line = document.createElement("div");
    line.className = `log-line ${type}`;
    line.innerHTML = message;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  
  function setLocation(roomId) {
    const room = rooms[roomId];
    if (!room) return;
  
    gameState.currentRoomId = roomId;
    locationNameEl.textContent = room.name;
    locationMetaEl.textContent = room.short;
  
    const firstTimeHereKey = `visited_${roomId}`;
    const firstTime = !gameState.flags[firstTimeHereKey];
  
    if (firstTime) {
      gameState.flags[firstTimeHereKey] = true;
      appendLog(`<span class="prompt">&gt;</span> ${room.description}`, "response");
    } else {
      appendLog(`<span class="prompt">&gt;</span> ${room.short}`, "response");
    }
  
    const itemNames = room.items || [];
    if (itemNames.length > 0) {
      const readable = itemNames
        .map((id) => (id === "lantern" ? "a lantern" : id === "smallKey" ? "a small key" : id))
        .join(", ");
      appendLog(`<span class="prompt">•</span> You notice: <strong>${readable}</strong>.`, "system");
    }
  
    const exits = Object.keys(room.exits || {});
    if (exits.length > 0) {
      appendLog(
        `<span class="prompt">•</span> Possible directions: <strong>${exits.join(", ")}</strong>.`,
        "system"
      );
    }
  }
  
  function describeCurrentRoom() {
    const room = rooms[gameState.currentRoomId];
    if (!room) return;
    appendLog(`<span class="prompt">&gt;</span> ${room.description}`, "response");
  
    const itemNames = room.items || [];
    if (itemNames.length > 0) {
      const readable = itemNames
        .map((id) => (id === "lantern" ? "a lantern" : id === "smallKey" ? "a small key" : id))
        .join(", ");
      appendLog(`<span class="prompt">•</span> You see: <strong>${readable}</strong>.`, "system");
    }
  }
  
  function showHelp() {
    appendLog(
      [
        "<span class='prompt'>•</span> Some commands you can use:",
        "- <code>look</code> : Look around in more detail.",
        "- <code>go north/south/east/west</code> or <code>go up/down</code>: Move between locations.",
        "- <code>take &lt;item&gt;</code> : Take an item (e.g. <code>take key</code>).",
        "- <code>inventory</code> : Check what you're carrying.",
        "- <code>examine &lt;item&gt;</code> : Inspect an item closely.",
        "- <code>use key</code> : Use an item (if it makes sense here).",
      ].join("<br/>"),
      "system"
    );
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
  
    appendLog(
      `<span class='prompt'>+</span> You take the <strong>${readableItemName(canonicalItem)}</strong>.`,
      "response"
    );
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
        appendLog(
          "<span class='prompt'>+</span> You turn the key. The iron door unlocks with a heavy click. You can now go inside (<code>go inside</code>).",
          "important"
        );
      }
      return;
    }
  
    if (canonicalItem === "lantern") {
      if (gameState.flags.lanternLit) {
        appendLog("<span class='prompt'>•</span> The lantern is already lit, casting a soft glow around you.", "system");
      } else {
        gameState.flags.lanternLit = true;
        appendLog(
          "<span class='prompt'>+</span> You light the lantern. Shapes in the fog become a little clearer.",
          "important"
        );
      }
      return;
    }
  
    appendLog("<span class='prompt'>•</span> Using that doesn't seem to do anything useful here.", "system");
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
  
  function initGame() {
    appendLog(
      "<span class='prompt'>•</span> A foggy night at Tugrul Bay. The lighthouse has been dark for a long time. Perhaps tonight, someone will light it again...",
      "system"
    );
    setLocation(gameState.currentRoomId);
    showHelp();
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
    inputEl.focus();
  });