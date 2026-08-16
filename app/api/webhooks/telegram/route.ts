import { NextRequest, NextResponse } from "next/server";
import { processAdminMessage } from "@/lib/commerce/admin-sonia";
import { sendTelegramNotification } from "@/lib/commerce/telegram";

export async function POST(req: NextRequest) {
  try {
    console.log("[webhook/telegram] webhook request received");

    const secretToken = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn("[webhook/telegram] Unauthorized Telegram webhook attempt (Invalid Secret Token)");
      return NextResponse.json({ ok: true }, { status: 401 });
    }
    
    console.log("[webhook/telegram] Telegram secret header validated");

    const body = await req.json();
    console.log("[webhook/telegram] update parsed");
    
    // Telegram webhook payload has `message` object
    const message = body.message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true }); // Ignore non-text messages
    }
    
    const chatId = message.chat.id.toString();
    console.log(`[webhook/telegram] chat.id received: ${chatId}`);
    
    const authorizedChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    
    if (chatId !== authorizedChatId) {
      console.warn(`[webhook/telegram] admin authorization failed from Chat ID: ${chatId}`);
      // Don't leak existence of bot to unauthorized users, just ignore
      return NextResponse.json({ ok: true });
    }
    
    console.log("[webhook/telegram] admin authorization passed");
    
    const text = message.text;
    
    // Acknowledge receipt immediately so user isn't left hanging
    await sendTelegramNotification("On it... processing your request.", false);
    
    // Process via Admin Sonia
    console.log("[webhook/telegram] processAdminMessage() called");
    const responseText = await processAdminMessage(chatId, text);
    console.log("[webhook/telegram] Admin Sonia response generated");
    
    // Send response back
    await sendTelegramNotification(responseText, false); // Don't enforce markdown to prevent parsing errors
    console.log("[webhook/telegram] sendMessage called");
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error processing Telegram webhook:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram to prevent retries
  }
}
