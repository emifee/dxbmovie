export async function sendTelegramNotification(message: string, markdown: boolean = true) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  
  if (!token || !chatId) {
    console.warn("Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not configured.");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text: message,
  };
  
  if (markdown) {
    body.parse_mode = "MarkdownV2";
  }
  
  console.log(`[telegram/sender] Sending to ${chatId}: ${message.substring(0, 100)}...`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      console.error("[telegram/sender] Telegram API response error:", await res.text());
    } else {
      console.log("[telegram/sender] Telegram API response success");
    }
  } catch (err) {
    console.error("Error pushing to Telegram:", err);
  }
}
