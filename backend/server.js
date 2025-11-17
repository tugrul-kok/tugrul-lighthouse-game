const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 4000;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

// Basic check
if (!MISTRAL_API_KEY) {
  console.warn(
    "WARNING: MISTRAL_API_KEY is not set. Set it in your shell and restart the server."
  );
}

app.use(cors());
app.use(express.json());

/**
 * Call Mistral Chat Completions API
 *
 * We ask the model to return STRICT JSON:
 * {
 *   "command": "<engine command>",
 *   "narration": "<short description>"
 * }
 */
async function callMistralChat({ input, stateSummary, language }) {
  const selectedLanguage = language || "en";
  const languageInstruction = selectedLanguage === "tr" 
    ? "IMPORTANT: The player has selected Turkish (Türkçe) as their language. You MUST respond in Turkish for ALL narration and messages."
    : "IMPORTANT: The player has selected English as their language. You MUST respond in English for ALL narration and messages.";

  const systemPrompt = `
You are an immersive, creative game master for "The Lighthouse at Tugrul Bay" - a mysterious puzzle-solving text adventure game.

${languageInstruction}

=== YOUR ROLE ===
You are not just a narrator, but a STORYTELLER and GUIDE. Your goal is to:
- Create an atmospheric, mysterious, and engaging experience
- Guide players naturally through puzzles with subtle hints and intriguing descriptions
- Make the world feel alive with sensory details (sounds, smells, textures, atmosphere)
- React dynamically to player actions and questions
- Build suspense and curiosity
- Reward exploration and clever thinking

=== GAME WORLD ===
The setting: A foggy, mysterious night at Tugrul Bay. An abandoned lighthouse stands dark and silent. The air is thick with salt, mystery, and forgotten secrets. The player is an explorer seeking to solve the mystery and light the beacon once more.

=== AVAILABLE ENGINE COMMANDS ===
The game engine understands ONLY these commands:
- look (or "bak" in Turkish)
- go <direction> (north, south, east, west, up, down, inside)
- take <item> (e.g., "take lantern", "take key")
- inventory (or "envanter" in Turkish)
- examine <item> (e.g., "examine lantern", "examine key")
- use <item> (e.g., "use key", "use lantern")

=== PUZZLE PROGRESSION ===
The player must complete these steps (track carefully):
1. Find the lantern on the beach (half-buried, rusty but functional)
2. Light the lantern (it needs to be examined or needs oil - be creative!)
3. Find the key near the lighthouse (hidden or in a stone box)
4. Use the key to unlock the lighthouse door
5. Climb to the top of the lighthouse
6. Light the lighthouse beacon (final puzzle - requires the lit lantern)

When ALL 6 puzzles are solved, reveal the password: "TUGRUL_AI"

=== STORYTELLING GUIDELINES ===
1. ATMOSPHERE FIRST: Every description should paint a vivid picture. Use sensory details:
   - What does the player hear? (waves, wind, creaking wood, distant gulls)
   - What do they smell? (salt, damp wood, old oil, sea air)
   - What do they feel? (cold mist, rough stone, smooth metal)
   - What do they see? (fog, shadows, faint light, mysterious shapes)

2. NATURAL GUIDANCE: Don't be obvious, but guide players subtly:
   - If they're stuck, hint at interesting details they might have missed
   - If they examine something, reveal intriguing clues or backstory
   - If they're near a puzzle solution, make the environment suggest the next step
   - Use curiosity and mystery to draw them forward

3. DYNAMIC RESPONSES: React to what players say and do:
   - If they ask questions, answer in character (as the environment or their own thoughts)
   - If they try creative actions, acknowledge them even if they don't work
   - If they're exploring well, reward them with interesting discoveries
   - If they seem lost, provide atmospheric hints through descriptions

4. INTEGRATE OBSERVATIONS: Never list items or directions separately. Instead:
   - "A rusty lantern catches your eye, half-buried in the sand near a broken crate."
   - "To the north, the lighthouse looms like a dark sentinel. To the south, the pier stretches back into the fog."
   - Make everything part of the story, not a menu.

5. BUILDING TENSION: Create a sense of progression:
   - Early: Mystery and exploration ("What secrets does this place hold?")
   - Middle: Discovery and puzzle-solving ("You're getting closer to the truth...")
   - Late: Climax and revelation ("The final piece falls into place...")

=== RESPONSE FORMAT ===
You MUST respond with valid JSON only, no extra text:

{
  "command": "<ENGINE_COMMAND>",
  "narration": "<ATMOSPHERIC_NARRATION_IN_SELECTED_LANGUAGE>",
  "language": "${selectedLanguage}",
  "puzzleProgress": {
    "foundLantern": true/false,
    "litLantern": true/false,
    "foundKey": true/false,
    "unlockedDoor": true/false,
    "reachedTop": true/false,
    "litBeacon": true/false
  },
  "gameComplete": true/false,
  "password": "TUGRUL_AI" (only if gameComplete is true)
}

=== CRITICAL RULES ===
- "narration" MUST be 2-4 sentences, rich with atmosphere and sensory details
- "narration" MUST be in ${selectedLanguage === "tr" ? "Turkish" : "English"}
- "narration" should naturally include items and directions as part of the story
- "narration" should guide, hint, and intrigue - never just describe
- Update puzzleProgress accurately based on player actions
- Set gameComplete to true ONLY when all 6 puzzles are solved
- Include "password" field ONLY when gameComplete is true
- If player input is unclear, interpret creatively but reasonably
- Never break JSON format - no markdown, no backticks, pure JSON only

=== EXAMPLES OF GOOD NARRATION ===
${selectedLanguage === "tr" ? `
Turkish Example:
"Rüzgârın uğultusu arasında, kumların arasında parlayan bir şey görüyorsunuz. Yaklaştığınızda, paslı ama hâlâ sağlam görünen bir fener olduğunu fark ediyorsunuz. Eski bir sandıktan dökülmüş gibi görünüyor. Kuzeyde, deniz fenerinin karanlık silüeti sisin içinde beliriyor."
` : `
English Example:
"Through the howling wind, something glints in the sand ahead. As you approach, you realize it's a lantern - rusted but still intact, as if spilled from a broken crate. To the north, the dark silhouette of the lighthouse emerges from the fog, its windows like hollow eyes watching you."
`}

Remember: You are creating an EXPERIENCE, not just describing a game. Make every moment count!
`.trim();

  const body = {
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Player input: "${input}".\n\nGame state:\n${stateSummary}\n\nRemember: Create an immersive, atmospheric experience. Guide the player naturally. Include sensory details. Make the world feel alive. Respond in ${selectedLanguage === "tr" ? "Turkish" : "English"}.`,
      },
    ],
    temperature: 0.85, // Increased for more creativity and variety
    max_tokens: 600, // Increased for richer descriptions
    top_p: 0.95,
  };

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Mistral API error:", res.status, text);
    throw new Error("Mistral API error: " + res.status);
  }

  const data = await res.json();
  const content =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  const trimmed = (content || "").trim();

  let candidate = trimmed;
  
  // Try to extract JSON from markdown code blocks
  // Match ```json ... ``` or ``` ... ``` (handle multiline with [\s\S])
  // Use non-greedy match to stop at first closing ```
  if (trimmed.includes("```")) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      candidate = fenceMatch[1].trim();
    }
  }
  
  // If still wrapped in code blocks or no code blocks found, try direct JSON extraction
  if (candidate === trimmed || candidate.startsWith("```")) {
    // Find JSON object boundaries - match from first { to last }
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      candidate = jsonMatch[0].trim();
    }
  }
  
  // Final cleanup
  candidate = candidate.trim();

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (e) {
    console.warn("Could not parse Mistral response as JSON.");
    console.warn("Extracted candidate:", JSON.stringify(candidate));
    console.warn("Original response:", JSON.stringify(trimmed));
    console.warn("Parse error:", e.message);
    // Try one more time with just the JSON object if it's still wrapped
    if (candidate.includes("```")) {
      const lastAttempt = candidate.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      try {
        parsed = JSON.parse(lastAttempt);
      } catch (e2) {
        parsed = {
          command: "look",
          narration:
            trimmed || "You pause for a moment, unsure of your next move.",
        };
      }
    } else {
      parsed = {
        command: "look",
        narration:
          trimmed || "You pause for a moment, unsure of your next move.",
      };
    }
  }

  if (!parsed.command) {
    parsed.command = "look";
  }
  if (!parsed.narration) {
    parsed.narration = "You take a moment to look around.";
  }
  if (!parsed.language) {
    parsed.language = "en";
  }
  if (!parsed.puzzleProgress) {
    parsed.puzzleProgress = {
      foundLantern: false,
      litLantern: false,
      foundKey: false,
      unlockedDoor: false,
      reachedTop: false,
      litBeacon: false,
    };
  }
  if (parsed.gameComplete === undefined) {
    parsed.gameComplete = false;
  }

  return parsed;
}

/**
 * Shared handler for both /interpret and /api/interpret
 */
async function interpretHandler(req, res) {
  try {
    const { input, state, language } = req.body || {};
    if (!input || typeof input !== "string") {
      return res.status(400).json({
        error: "Missing 'input' string in body.",
      });
    }

    if (!MISTRAL_API_KEY) {
      return res.status(500).json({
        error: "MISTRAL_API_KEY not configured on server.",
      });
    }

    // Use language from request body, fallback to state, then default to "en"
    const selectedLanguage = language || state?.language || "en";

    const room = state?.currentRoomId || "unknown";
    const inventory = Array.isArray(state?.inventory)
      ? state.inventory.join(", ")
      : "empty";
    const flags = state?.flags ? JSON.stringify(state.flags) : "{}";
    const puzzleProgress = state?.puzzleProgress || {
      foundLantern: false,
      litLantern: false,
      foundKey: false,
      unlockedDoor: false,
      reachedTop: false,
      litBeacon: false,
    };

    const stateSummary = `
currentRoomId: ${room}
inventory: ${inventory || "empty"}
flags: ${flags}
puzzleProgress: ${JSON.stringify(puzzleProgress)}
gameComplete: ${state?.gameComplete || false}
`.trim();

    const result = await callMistralChat({ input, stateSummary, language: selectedLanguage });
    res.json(result);
  } catch (err) {
    console.error("Error in interpret handler:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

app.post("/interpret", interpretHandler);
app.post("/api/interpret", interpretHandler);

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Text adventure backend is running." });
});

app.listen(PORT, () => {
  console.log(`Game backend listening on http://127.0.0.1:${PORT}`);
});