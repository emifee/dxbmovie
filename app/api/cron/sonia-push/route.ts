import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { sendPushNotification, type PushSubscriptionData } from "@/lib/push";
import Groq from "groq-sdk";
import OpenAI from "openai";

const SONIA_SYSTEM = `You are Sonia, a friendly AI movie companion for DXBmovies.
Generate a single short, enthusiastic push notification recommending a movie or show.

Rules:
- Max 80 characters for the body
- Sound like a friend texting, not a robot  
- Reference one of the user's favourite genres if provided
- Must be a real, currently popular title available in MENA
- Include the streaming platform
- Vary the message style each time (question, exclamation, casual, hype)
- Do NOT use quotes around the movie title

Response format (JSON only, nothing else):
{"title":"Sonia has a pick for you 🎬","body":"your message here max 80 chars","movieTitle":"exact movie name","platform":"Netflix"}`;

async function generateSoniaMessage(genres: string[]): Promise<{ title: string; body: string } | null> {
  const userGenreLine = genres.length > 0 ? `User's favourite genres: ${genres.join(", ")}` : "";
  const userPrompt = `${userGenreLine}\n\nGenerate a push notification recommendation now.`;

  const rawGroqKeys = process.env.GROQ_API_KEY;
  if (rawGroqKeys) {
    const groqKeys = rawGroqKeys.split(",").map((k) => k.trim()).filter(Boolean);
    for (const groqKey of groqKeys) {
      try {
        const groq = new Groq({ apiKey: groqKey });
        const res = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: SONIA_SYSTEM },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 150,
          temperature: 1.0,
        });
        const raw = res.choices[0]?.message?.content ?? "";
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          const parsed = JSON.parse(raw.slice(start, end + 1));
          return { title: parsed.title, body: parsed.body };
        }
      } catch (err) {
        console.error("[cron/sonia-push] Groq key failed:", err);
      }
    }
  }

  // Fallback: OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SONIA_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 1.0,
      });
      const raw = res.choices[0]?.message?.content ?? "";
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        return { title: parsed.title, body: parsed.body };
      }
    } catch (err) {
      console.error("[cron/sonia-push] OpenAI failed:", err);
    }
  }

  return null;
}

export async function GET(request: Request) {
  // Secure this endpoint — only callable with the correct cron secret
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS);

  try {
    const client = await clientPromise;
    const db = client.db("dxbmovies");

    // Find all users with push enabled who haven't been notified in 24h
    const users = await db
      .collection("userPreferences")
      .find({
        pushEnabled: true,
        pushSubscription: { $exists: true },
        $or: [
          { lastProactiveNotification: { $lt: cutoff } },
          { lastProactiveNotification: { $exists: false } },
        ],
      })
      .limit(100) // Safety cap per run
      .toArray();

    console.log(`[cron/sonia-push] Processing ${users.length} users`);

    let sent = 0;
    let failed = 0;
    let cleaned = 0;

    for (const user of users) {
      const genres: string[] = user.genres ?? [];
      const sub = user.pushSubscription as PushSubscriptionData;

      // Generate personalised message
      const msg = await generateSoniaMessage(genres);
      if (!msg) {
        failed++;
        continue;
      }

      const result = await sendPushNotification(sub, {
        title: msg.title,
        body: msg.body,
        url: "/",
        type: "ai_proactive",
      });

      if (result.success) {
        sent++;
        await db.collection("userPreferences").updateOne(
          { _id: user._id },
          { $set: { lastProactiveNotification: new Date() } },
        );
      } else if (result.gone) {
        // Expired subscription — clean up
        cleaned++;
        await db.collection("userPreferences").updateOne(
          { _id: user._id },
          { $set: { pushEnabled: false }, $unset: { pushSubscription: "" } },
        );
      } else {
        failed++;
      }

      // Small delay between users to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`[cron/sonia-push] Done: sent=${sent} failed=${failed} cleaned=${cleaned}`);
    return NextResponse.json({ success: true, sent, failed, cleaned, total: users.length });
  } catch (err) {
    console.error("[cron/sonia-push] Fatal error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
