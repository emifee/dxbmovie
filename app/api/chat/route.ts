import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { sendPushNotification, type PushSubscriptionData } from "@/lib/push";
import { getLanguage } from "@/lib/language";
import { generateSoniaResponse } from "@/lib/ai/sonia";

export async function POST(request: Request) {
  let body: { messages: { role: "system" | "user" | "assistant"; content: string }[]; movieContext?: string; attachedTitle?: string | null; anonId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages, movieContext, attachedTitle, anonId } = body;
  const lang = getLanguage();
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  // Guest limit: allow 3 messages without an account so they experience the AI value
  if (!userId) {
    const userMessageCount = messages.filter((m) => m.role === "user").length;
    if (userMessageCount > 3) {
      return NextResponse.json({
        content: "You've used your 3 free messages! Sign in to unlock unlimited AI chats, personalized picks, and your watchlist — it takes 2 seconds 🎬",
        recommendations: [],
      });
    }
  }

  try {
    const response = await generateSoniaResponse({
      channel: "web",
      userId,
      anonId,
      messageHistory: messages,
      movieContext,
      attachedTitle,
      lang,
    });

    // Send push notification if the user has push enabled and the app is backgrounded.
    // We check the X-App-Backgrounded header (client sets this when the user hides the page).
    const appBackgrounded = request.headers.get("X-App-Backgrounded") === "true";
    if (userId && appBackgrounded) {
      // Fire-and-forget — don't block the response
      clientPromise
        .then(async (client) => {
          const db = client.db("dxbmovies");
          const prefs = await db.collection("userPreferences").findOne({ userId });
          if (prefs?.pushEnabled && prefs?.pushSubscription) {
            const sub = prefs.pushSubscription as PushSubscriptionData;
            const previewBody = response.content.length > 100
              ? response.content.slice(0, 97) + "…"
              : response.content;
            const result = await sendPushNotification(sub, {
              title: "Sonia replied 🎬",
              body: previewBody,
              url: "/",
              type: "ai_response",
            });
            // Clean up expired subscriptions
            if (result.gone) {
              await db.collection("userPreferences").updateOne(
                { userId },
                { $set: { pushEnabled: false }, $unset: { pushSubscription: "" } },
              );
            }
          }
        })
        .catch((e) => console.error("[push] Chat notification failed:", e));
    }

    return NextResponse.json({ content: response.content, recommendations: response.recommendations, provider: response.provider });
  } catch (err) {
    console.error("[api/chat] generateSoniaResponse failed:", err);
    return NextResponse.json(
      { content: "Sorry, our AI is taking a quick break — please try again in a moment! 🎬", recommendations: [] },
      { status: 200 },
    );
  }
}
