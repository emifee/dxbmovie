const Groq = require("groq-sdk");
const client = new Groq({ apiKey: process.env.GROQ_API_KEY.split(',')[0] });

async function run() {
  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: "You are DXBmovies... USER PROFILE: Name: Emife, Genres: romance. ALWAYS reply with JSON format: {\"message\": \"...\", \"recommendations\": []}" },
      { role: "user", content: "Can you respond to me with a record" }
    ],
    temperature: 0.8,
    response_format: { type: "json_object" }
  });
  console.log(completion.choices[0].message.content);
}
run();
