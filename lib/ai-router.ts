/**
 * AI Router — Groq (primary, free) → OpenAI GPT-4o-mini (fallback)
 *
 * - Tries Groq llama-3.3-70b-versatile first with an 8-second timeout.
 * - On any failure (rate limit, timeout, unavailable) switches to OpenAI.
 * - Logs which provider handled each request for monitoring.
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

const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENAI_MODEL = "gpt-4o-mini";
const GROQ_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Groq timeout after ${ms}ms`)), ms),
    ),
  ]);
}

async function callGroq(key: string, messages: AIChatMessage[]): Promise<string> {
  const client = new Groq({ apiKey: key });
  const completion = await withTimeout(
    client.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 500,
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
  });
  return completion.choices[0]?.message?.content ?? "";
}

export async function routeChat(messages: AIChatMessage[]): Promise<RouterResult> {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // --- PRIMARY: Groq ---
  if (groqKey) {
    try {
      const text = await callGroq(groqKey, messages);
      console.log("[ai-router] provider=groq model=" + GROQ_MODEL);
      return { text, provider: "groq" };
    } catch (err) {
      console.warn(
        "[ai-router] Groq failed, switching to OpenAI —",
        (err as Error).message,
      );
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
