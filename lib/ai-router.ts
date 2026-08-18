/**
 * AI Router — Groq (primary, free) → OpenAI GPT-4o-mini (fallback)
 *
 * - Tries Groq first with an 8-second timeout, then falls back to OpenAI.
 * - Logs which provider handled each request for monitoring.
 *
 * The Groq model is configurable because models get decommissioned:
 * llama-3.3-70b-versatile was retired and every single request then burned four
 * failed key attempts (one per configured key) before falling through to OpenAI,
 * adding latency to every reply and flooding the error log. When Groq reports the
 * model is gone, the router now stops trying it for a cooldown instead of retrying
 * it on each request — a dead model is not a per-key problem.
 */

import Groq from "groq-sdk";
import OpenAI from "openai";

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RouterResult {
  text: string;
  provider: "groq" | "openai";
}

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const OPENAI_MODEL = "gpt-4o-mini";
const GROQ_TIMEOUT_MS = 8_000;

/** How long to stop attempting Groq after it reports the model is unavailable. */
const GROQ_MODEL_COOLDOWN_MS = 30 * 60 * 1000;
let groqDisabledUntil = 0;

/** Distinguishes "this model no longer exists" from a transient/key-specific failure. */
function isModelUnavailable(message: string): boolean {
  return /model_not_found|does not exist|decommissioned|has been deprecated/i.test(message);
}

/** Exposed for tests. */
export function __resetGroqCircuitBreaker() {
  groqDisabledUntil = 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // The timer must be cleared once the race settles. Previously every successful Groq
  // call left an 8-second timer pending, keeping the event loop busy for no reason.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Groq timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function callGroq(key: string, messages: AIChatMessage[]): Promise<string> {
  const client = new Groq({ apiKey: key });
  const completion = await withTimeout(
    client.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 500,
      response_format: { type: "json_object" },
    }),
    GROQ_TIMEOUT_MS,
  );
  return completion.choices[0]?.message?.content ?? "";
}

async function callOpenAI(key: string, messages: AIChatMessage[]): Promise<string> {
  const client = new OpenAI({ apiKey: key });
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: 0.8,
    max_tokens: 500,
    response_format: { type: "json_object" },
  });
  return completion.choices[0]?.message?.content ?? "";
}

export async function routeChat(messages: AIChatMessage[]): Promise<RouterResult> {
  const rawGroqKeys = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // --- PRIMARY: Groq ---
  if (rawGroqKeys && Date.now() >= groqDisabledUntil) {
    const groqKeys = rawGroqKeys.split(",").map((k) => k.trim()).filter(Boolean);

    for (const groqKey of groqKeys) {
      try {
        const text = await callGroq(groqKey, messages);
        console.log("[ai-router] provider=groq model=" + GROQ_MODEL);
        return { text, provider: "groq" };
      } catch (err) {
        const message = (err as Error).message;

        if (isModelUnavailable(message)) {
          // Not a key problem — trying the remaining keys would fail identically.
          groqDisabledUntil = Date.now() + GROQ_MODEL_COOLDOWN_MS;
          console.error(
            `[ai-router] Groq model "${GROQ_MODEL}" is unavailable — skipping Groq for ${GROQ_MODEL_COOLDOWN_MS / 60000} minutes. ` +
              `Set GROQ_MODEL to a current model. Detail: ${message}`,
          );
          break;
        }

        console.warn("[ai-router] Groq key failed, trying next key or switching to OpenAI —", message);
      }
    }
  }

  // --- FALLBACK: OpenAI ---
  if (!openaiKey) {
    throw new Error("No AI providers configured (missing both GROQ_API_KEY and OPENAI_API_KEY)");
  }
  const text = await callOpenAI(openaiKey, messages);
  console.log("[ai-router] provider=openai model=" + OPENAI_MODEL);
  return { text, provider: "openai" };
}
