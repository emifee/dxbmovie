import { NextResponse } from "next/server";

// ElevenLabs built-in premade voices — available on ALL plans including free.
// These are NOT "library" voices so they don't require a paid subscription.
const PREMADE_VOICES = {
  female: [
    "EXAVITQu4vr4xnSDxMaL", // Sarah
    "XB0fDUnXU5powFXDhCwa", // Charlotte
    "cgSgspJ2msm6clMCkdW9", // Jessica
  ],
  male: [
    "onwK4e9ZLuTAKqWW03F9", // Daniel
    "IKne3meq5aSn9XLyUdCD", // Charlie
    "JBFqnCBsd6RMkjVDRZzb", // George
  ],
};

async function tryTTS(apiKey: string, voiceId: string, text: string): Promise<Response | null> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 2500),
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  return res.ok ? res : null;
}

export async function POST(request: Request) {
  const rawKeys = process.env.ELEVENLABS_API_KEY;
  if (!rawKeys) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  // Support comma-separated API keys for automatic fallback
  const apiKeys = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  let body: { text: string; gender?: "female" | "male" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { text, gender = "female" } = body;
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const candidates = PREMADE_VOICES[gender] ?? PREMADE_VOICES.female;
  
  // Try each API key (fallback on quota limits)
  for (const apiKey of apiKeys) {
    // Try each premade voice in order
    for (const voiceId of candidates) {
      const res = await tryTTS(apiKey, voiceId, text);
      if (res) {
        return new Response(res.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      }
    }
  }

  console.error("[api/tts] All TTS attempts failed. Keys exhausted or rate limited.");
  return NextResponse.json({ error: "TTS failed" }, { status: 503 });
}
