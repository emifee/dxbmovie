const messages = [
  { role: "user", content: "Can you respond to me with a record" }
];
fetch("http://localhost:3000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages })
}).then(r => r.json()).then(console.log);
