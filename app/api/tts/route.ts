import { NextResponse } from "next/server";

// Sonia's voice configuration — ElevenLabs premade voices (all plans including free).
// Primary: Charlotte — warm, sophisticated, cinematic female storytelling narrator.
// Backup:  Sarah — natural, engaging, conversational. Used if Charlotte fails.
const PRIMARY_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte (storytelling)
const BACKUP_VOICE_ID  = "EXAVITQu4vr4xnSDxMaL"; // Sarah (backup)

async function tryTTS(apiKey: string, voiceId: string, text: string): Promise<Response | null> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 2500),
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.80,
          style: 0.35,         // adds expressive storytelling flair
          use_speaker_boost: true,
        },
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

  // Support comma-separated API keys for automatic fallback on quota limits
  const apiKeys = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  let body: { text: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { text } = body;
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  // Always try Primary (George) first, then Backup (Daniel), across all API keys
  const voicesToTry = [PRIMARY_VOICE_ID, BACKUP_VOICE_ID];

  for (const apiKey of apiKeys) {
    for (const voiceId of voicesToTry) {
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
