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
async function callMistralChat({ input, stateSummary }) {
  const systemPrompt = `
You are the game engine brain for a text adventure game called "The Lighthouse at Tugrul Bay".

The underlying engine understands ONLY a small set of text commands:
- look
- go north, go south, go east, go west, go up, go down, go inside
- take <item>  (for example: "take key", "take lantern")
- inventory
- examine <item>  (e.g. "examine key", "examine lantern")
- use <item>     (e.g. "use key", "use lantern")

Your job:
1. Read the player's free-form English input.
2. Use the game state summary.
3. Decide what engine command should be executed next.
4. Write a short piece of atmospheric narration for what happens.

You MUST respond with valid JSON only, no extra text, in this shape:
{
  "command": "<ENGINE_COMMAND>",
  "narration": "<SHORT_NARRATION>"
}

Rules:
- "command" MUST be a single engine command string as described above.
- If you are unsure, fall back to "look" or "help" style behaviour.
- Narration should be 1–3 sentences.
- Never break JSON. Never include backticks or Markdown in the JSON.
`.trim();

  const body = {
    model: "mistral-medium-latest",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Player input: "${input}".\n\nGame state:\n${stateSummary}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 512,
    top_p: 1,
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

  return parsed;
}

/**
 * Shared handler for both /interpret and /api/interpret
 */
async function interpretHandler(req, res) {
  try {
    const { input, state } = req.body || {};
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

    const room = state?.currentRoomId || "unknown";
    const inventory = Array.isArray(state?.inventory)
      ? state.inventory.join(", ")
      : "empty";
    const flags = state?.flags ? JSON.stringify(state.flags) : "{}";

    const stateSummary = `
currentRoomId: ${room}
inventory: ${inventory || "empty"}
flags: ${flags}
`.trim();

    const result = await callMistralChat({ input, stateSummary });
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