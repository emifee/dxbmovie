/**
 * AI router: model configuration and the Groq circuit breaker.
 *
 * Regression: llama-3.3-70b-versatile was decommissioned. Every request then tried all
 * four configured Groq keys, failed each with model_not_found, and only then fell
 * through to OpenAI — latency on every reply plus a flooded error log.
 */

const groqCalls: Array<{ key: string; model: string }> = [];
const openaiCalls: number[] = [];
let groqError: Error | null = null;

jest.mock("groq-sdk", () => ({
  __esModule: true,
  default: class {
    key: string;
    constructor(opts: any) { this.key = opts.apiKey; }
    chat = {
      completions: {
        create: async (args: any) => {
          groqCalls.push({ key: this.key, model: args.model });
          if (groqError) throw groqError;
          return { choices: [{ message: { content: '{"ok":true}' } }] };
        },
      },
    };
  },
}));

jest.mock("openai", () => ({
  __esModule: true,
  default: class {
    chat = {
      completions: {
        create: async () => {
          openaiCalls.push(Date.now());
          return { choices: [{ message: { content: '{"from":"openai"}' } }] };
        },
      },
    };
  },
}));

describe("groq routing", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    groqCalls.length = 0;
    openaiCalls.length = 0;
    groqError = null;
    process.env = { ...OLD_ENV, GROQ_API_KEY: "k1,k2,k3,k4", OPENAI_API_KEY: "oai" };
  });

  afterAll(() => { process.env = OLD_ENV; });

  test("the decommissioned model is no longer the default", async () => {
    delete process.env.GROQ_MODEL;
    const { routeChat } = await import("@/lib/ai-router");
    await routeChat([{ role: "user", content: "hi" }]);
    expect(groqCalls[0].model).not.toBe("llama-3.3-70b-versatile");
    expect(groqCalls[0].model).toBe("openai/gpt-oss-120b");
  });

  test("the model is configurable without a code change", async () => {
    process.env.GROQ_MODEL = "some/other-model";
    const { routeChat } = await import("@/lib/ai-router");
    await routeChat([{ role: "user", content: "hi" }]);
    expect(groqCalls[0].model).toBe("some/other-model");
  });

  test("a dead model does NOT burn every configured key", async () => {
    groqError = new Error('404 {"error":{"code":"model_not_found","message":"The model does not exist"}}');
    const { routeChat } = await import("@/lib/ai-router");

    const res = await routeChat([{ role: "user", content: "hi" }]);

    expect(groqCalls).toHaveLength(1);        // was 4 — one per key
    expect(res.provider).toBe("openai");      // still answers
  });

  test("after a dead-model failure, later requests skip Groq entirely", async () => {
    groqError = new Error('model_not_found');
    const { routeChat } = await import("@/lib/ai-router");

    await routeChat([{ role: "user", content: "one" }]);
    await routeChat([{ role: "user", content: "two" }]);
    await routeChat([{ role: "user", content: "three" }]);

    expect(groqCalls).toHaveLength(1);   // circuit open: no repeat attempts
    expect(openaiCalls).toHaveLength(3); // every request still answered
  });

  test("a transient/key-specific failure still tries the other keys", async () => {
    groqError = new Error("429 rate limit exceeded");
    const { routeChat } = await import("@/lib/ai-router");

    const res = await routeChat([{ role: "user", content: "hi" }]);

    expect(groqCalls.map((c) => c.key)).toEqual(["k1", "k2", "k3", "k4"]);
    expect(res.provider).toBe("openai");
  });

  test("a healthy Groq answers on the first key and never reaches OpenAI", async () => {
    const { routeChat } = await import("@/lib/ai-router");
    const res = await routeChat([{ role: "user", content: "hi" }]);

    expect(res.provider).toBe("groq");
    expect(groqCalls).toHaveLength(1);
    expect(openaiCalls).toHaveLength(0);
  });
});
