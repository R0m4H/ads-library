const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Flash-Lite is the model tier covered by Gemini's actual free API quota —
// fine for occasional, user-triggered calls like this, not for anything
// run automatically on every sync.
const MODEL = "gemini-2.5-flash-lite";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set. Get a free key at aistudio.google.com and add it to your environment.");
  return key;
}

/**
 * Sends a prompt to Gemini and parses the response as JSON. Uses Gemini's
 * responseMimeType: "application/json" mode so the model returns strict
 * JSON directly, instead of prose we'd have to regex out of markdown.
 */
export async function generateJson<T>(prompt: string): Promise<T> {
  const res = await fetch(`${GEMINI_API_BASE}/models/${MODEL}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content — it may have blocked the prompt.");

  return JSON.parse(text) as T;
}
