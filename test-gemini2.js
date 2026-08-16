const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const chat = model.startChat();
chat.sendMessage(`Function ${"test"} returned: ${JSON.stringify({ ok: true })}`).then(res => console.log(res.response.text())).catch(e => console.error(e));
