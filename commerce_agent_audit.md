# Sonia AI Architecture Audit

This document outlines the findings of an audit into the existing Sonia AI system within DXBmovies, specifically assessing its readiness to serve as the intelligence layer for Instagram Commerce.

## 1. AI Provider & Model
*   **Primary Provider:** Groq
*   **Primary Model:** `llama-3.3-70b-versatile`
*   **Settings:** Temperature 0.8, Max Tokens 500, Strict JSON object response format.
*   **Failover/Fallback:** If Groq fails or times out (8s limit), it automatically fails over to OpenAI using `gpt-4o-mini`. 
*   **Location:** `lib/ai-router.ts`

## 2. Current Architecture
*   **Coupling:** Sonia is currently **tightly coupled** to the website UI. The entirety of her intelligence, prompt, memory extraction, and TMDB tool calling lives directly inside the Next.js API route: `app/api/chat/route.ts`.
*   **Session Dependency:** She relies directly on `getServerSession(authOptions)` to identify the user and read their tastes from MongoDB. 
*   **Reusability:** There is currently no reusable service function. The code expects an HTTP `Request` with a specific JSON body from the web client and returns a Next.js `NextResponse`.

## 3. Current Capabilities
*   **Film Expertise:** Empathic, conversational, and highly knowledgeable about movies and TV.
*   **Tool Calling:** Has a custom pseudo-tool implementation where outputting `{"action": "search", "query": "..."}` pauses generation, triggers a real TMDB API fetch on the server, re-injects the factual data into the chat history, and forces a second-pass generation to answer the user.
*   **Commerce:** Currently has **zero** awareness of products, pricing, or orders.

## 4. Memory Handling
*   **Long-term Memory:** Extracts facts and stores them in MongoDB `userPreferences` (as `memories`, `genres`, `likedTitles`).
*   **IGSID Compatibility:** Yes. The MongoDB `userId` field is just a string. It can easily accept an Instagram-Scoped ID (IGSID) instead of a web session ID.
*   **Short-term Memory (Chat History):** **Missing for Instagram.** Currently, the website client stores the chat history and sends the entire array of messages in every request. Because Instagram only sends single messages via webhooks, we must build a server-side conversation history store (e.g., a `conversations` MongoDB collection) to allow multi-turn DM chats.

## 5. Instagram Reuse Feasibility
*   **Direct Call:** The Instagram handler *cannot* call `app/api/chat/route.ts` directly.
*   **Required Refactor:** The core logic inside the route must be extracted into a channel-agnostic service, such as `lib/ai/sonia.ts`.
*   **Signature Goal:** `generateSoniaResponse({ channel: 'web' | 'ig_dm' | 'ig_comment', userId, messageHistory, context })`
*   **Shared Intelligence:** Yes, the same underlying engine can easily support all channels by dynamically adjusting the system prompt based on the `channel` parameter.

## 6. Commerce Extension
*   Sonia's existing two-pass TMDB search architecture is a perfect blueprint for commerce. We can add capabilities like `{"action": "search_product"}` or `{"action": "check_order"}` to fetch real deterministic data from the database, preventing hallucinated prices or stock.

## 7. Comment Behavior
*   Comments require a radically different tone (short, concise, public, no follow-up questions). This can be achieved by injecting a specific "Comment Policy" block into the system prompt when `channel === 'ig_comment'`.

## 8. DM Behavior
*   DMs map perfectly to Sonia's current conversational nature. She can discuss movies naturally and, once equipped with commerce tools, transition smoothly into product recommendations.

## 9. Safety & Control
*   The current system already uses strict JSON formatting and server-side API fetches to prevent hallucinations of factual movie data. We will extend this exact pattern to commerce data to ensure pricing and availability are strictly factual.

---

## 10. Final Recommendation

**Recommendation: Refactor Sonia into a shared conversational engine.**

Do not build a separate Commerce Agent. Building a second AI would duplicate the complex LLM routing, JSON parsing, TMDB data fetching, and empathetic tone tuning already perfected in Sonia. Instead, refactoring `route.ts` into a standalone service will allow both the website and Instagram to share the exact same intelligence, merely wearing different "hats" depending on the channel.

### Proposed Architecture

```text
Instagram webhook
      ↓
Channel Adapter (Instagram Webhook Handler)
      ↓
Conversation Engine (Refactored Shared Sonia Service)
      ├── Loads Conversation History (from MongoDB)
      └── Injects Channel Policy (DM vs Comment)
      ↓
Tools / Data Layer
      ├── TMDB API (Movies/TV)
      └── Commerce DB (Products/Orders)
      ↓
Response Policy (Formats the JSON output safely)
      ↓
Instagram Send API
```
