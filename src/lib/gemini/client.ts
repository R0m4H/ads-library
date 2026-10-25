const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Flash-Lite is the model tier covered by Gemini's actual free API quota —
// fine for occasional, user-triggered calls like this, not for anything
// run automatically on every sync. gemini-2.5-flash-lite was retired for
// new API keys; confirmed against this project's live ListModels response
// that gemini-3.5-flash-lite is the current replacement.
const MODEL = "gemini-3.5-flash-lite";

// Tried in order when the main model keeps failing (usually "overloaded"). Also lite-tier models; both
// answered a JSON-mode test call with this project's key (gemini-2.5-flash-lite no longer does).
const FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

/** Each single request gives up after this long, so one stuck call can't eat the whole budget. */
const ATTEMPT_TIMEOUT_MS = 20_000;
/** All attempts together stay under this by default, inside the route's 60 s limit. */
const TOTAL_BUDGET_MS = 50_000;
/** Pauses before the 2nd and 3rd try of the same model. */
const RETRY_DELAYS_MS = [1_000, 2_500];

/**
 * A Gemini failure with a message that is safe to show people. The raw response (which can be a
 * wall of JSON) is only logged on the server.
 */
export class GeminiError extends Error {
  /** True when trying again later is likely to work (busy, rate limited, timed out). */
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "GeminiError";
    this.retryable = retryable;
  }
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set. Get a free key at aistudio.google.com and add it to your environment.");
  return key;
}

/** Statuses where the same request may well work a moment later (or on another model). */
const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;

function friendlyMessage(status: number): string {
  if (status === 429) return "The AI service is rate-limiting requests right now. Wait a minute and try again.";
  if (status === 401 || status === 403) return "The AI service rejected our key. Check GEMINI_API_KEY.";
  if (status >= 500 || status === 408) return "The AI service is busy right now. Try again in a minute.";
  return "The AI service couldn't process this request.";
}

class AttemptError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(`Gemini ${status}: ${detail}`);
  }
}

async function callOnce<T>(model: string, prompt: string, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      // The key goes in a header, not the address, so it never ends up in logs or error text.
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // Timed out or the network dropped: treat like a busy service.
    throw new AttemptError(408, e instanceof Error ? e.message : "request failed");
  }

  if (!res.ok) throw new AttemptError(res.status, (await res.text()).slice(0, 500));

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("The AI returned no answer (it may have blocked the request). Try again.", true);
  try {
    return JSON.parse(text) as T;
  } catch {
    // Occasionally the model cuts its answer off; another try usually fixes it.
    throw new AttemptError(502, "response was not valid JSON");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends a prompt to Gemini and parses the response as JSON. Uses Gemini's
 * responseMimeType: "application/json" mode so the model returns strict
 * JSON directly, instead of prose we'd have to regex out of markdown.
 *
 * Busy/overloaded answers are retried a couple of times, then the next model is tried. If everything
 * fails it throws a `GeminiError` with a plain-language message.
 */
export async function generateJson<T>(prompt: string, opts: { budgetMs?: number } = {}): Promise<T> {
  const started = Date.now();
  const budget = opts.budgetMs ?? TOTAL_BUDGET_MS;
  const left = () => budget - (Date.now() - started);
  let last: AttemptError | null = null;

  for (const model of [MODEL, ...FALLBACK_MODELS]) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (left() < 3_000) break;
      try {
        return await callOnce<T>(model, prompt, Math.min(ATTEMPT_TIMEOUT_MS, left()));
      } catch (e) {
        if (e instanceof GeminiError) throw e;
        const err = e as AttemptError;
        last = err;
        console.error(`[gemini] ${model} attempt ${attempt + 1} failed:`, err.message);
        // A request the service will never accept (bad key, bad request): another try or model won't help.
        if (!isTransient(err.status) && err.status !== 502) {
          // Google answers a wrong or missing key with a plain 400, so look at the text too.
          const badKey = err.status === 401 || err.status === 403 || /api key/i.test(err.detail);
          throw new GeminiError(friendlyMessage(badKey ? 401 : err.status), false);
        }
        // A rate limit is per model: move to the next model instead of waiting on this one.
        if (err.status === 429) break;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined && left() > delay + 3_000) await sleep(delay);
        else break;
      }
    }
  }

  throw new GeminiError(friendlyMessage(last?.status ?? 503), true);
}
