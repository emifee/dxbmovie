const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const chat = model.startChat();
chat.sendMessage([{ functionResponse: { name: "test", response: { ok: true } } }]).catch(e => console.error(e));
