export async function sendEmail({
  to,
  subject,
  htmlContent,
  senderName,
}: {
  to: string;
  subject: string;
  htmlContent: string;
  senderName?: string;
}) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    console.error("BREVO_API_KEY is not set");
    return;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: "hello@dxbmovie.online", name: senderName ?? "DXB Movies | Tv Shows" },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Failed to send email via Brevo:", text);
    } else {
      console.log(`Successfully sent email to ${to}`);
    }
  } catch (error) {
    console.error("Error sending email via Brevo:", error);
  }
}
