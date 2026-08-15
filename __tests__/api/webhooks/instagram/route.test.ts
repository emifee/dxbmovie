import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/webhooks/instagram/route";
import { createHmac } from "crypto";
import { handleNormalizedEvent } from "@/lib/instagram/handlers";

// Mock MongoDB
const mockFindOne = jest.fn().mockResolvedValue(null);
const mockInsertOne = jest.fn().mockResolvedValue({});
const mockUpdateOne = jest.fn().mockResolvedValue({});

jest.mock("@/lib/mongodb", () => {
  return {
    __esModule: true,
    default: Promise.resolve({
      db: () => ({
        collection: () => ({
          findOne: mockFindOne,
          insertOne: mockInsertOne,
          updateOne: mockUpdateOne,
        })
      })
    })
  };
});

// Mock Handlers
jest.mock("@/lib/instagram/handlers", () => ({
  handleNormalizedEvent: jest.fn().mockResolvedValue(undefined)
}));

describe("Instagram Webhook Route", () => {
  beforeAll(() => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "testverify";
    process.env.META_APP_SECRET = "testsecret";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOne.mockResolvedValue(null); // default: not a duplicate
  });

  function createSignature(payload: string) {
    return "sha256=" + createHmac("sha256", "testsecret").update(payload).digest("hex");
  }

  describe("GET Verification", () => {
    it("should accept valid verification request", async () => {
      const req = new NextRequest("http://localhost/api?hub.mode=subscribe&hub.verify_token=testverify&hub.challenge=12345");
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("12345");
    });

    it("should reject invalid verification request", async () => {
      const req = new NextRequest("http://localhost/api?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345");
      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });

  describe("POST Event Processing", () => {
    const dmPayload = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "123",
          messaging: [
            {
              sender: { id: "456" },
              message: { mid: "m_123", text: "hello" }
            }
          ]
        }
      ]
    });

    const commentPayload = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "123",
          changes: [
            {
              field: "comments",
              value: {
                id: "c_123",
                text: "cool",
                from: { id: "456", username: "tester" }
              }
            }
          ]
        }
      ]
    });

    it("should reject if no signature is provided", async () => {
      const req = new NextRequest("http://localhost/api", {
        method: "POST",
        body: dmPayload
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("should reject if signature is invalid", async () => {
      const req = new NextRequest("http://localhost/api", {
        method: "POST",
        body: dmPayload,
        headers: { "x-hub-signature-256": "sha256=invalid" }
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("should reject malformed JSON", async () => {
      const badPayload = "not json";
      const sig = createSignature(badPayload);
      const req = new NextRequest("http://localhost/api", {
        method: "POST",
        body: badPayload,
        headers: { "x-hub-signature-256": sig }
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("should return 200 and process valid DM event", async () => {
      const sig = createSignature(dmPayload);
      const req = new NextRequest("http://localhost/api", {
        method: "POST",
        body: dmPayload,
        headers: { "x-hub-signature-256": sig }
      });
      
      const res = await POST(req);
      expect(res.status).toBe(200);

      // Wait a tick for async processing to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handleNormalizedEvent).toHaveBeenCalledWith(expect.objectContaining({
        event_type: "instagram.dm.received",
        event_id: "m_123",
        sender_id: "456"
      }));
      expect(mockInsertOne).toHaveBeenCalled();
    });

    it("should return 200 and process valid Comment event", async () => {
      const sig = createSignature(commentPayload);
      const req = new NextRequest("http://localhost/api", {
        method: "POST",
        body: commentPayload,
        headers: { "x-hub-signature-256": sig }
      });
      
      const res = await POST(req);
      expect(res.status).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handleNormalizedEvent).toHaveBeenCalledWith(expect.objectContaining({
        event_type: "instagram.comment.created",
        event_id: "c_123",
        sender_username: "tester"
      }));
    });

    it("should ignore duplicate events (idempotency)", async () => {
      mockFindOne.mockResolvedValueOnce({ _id: "exists" });

      const sig = createSignature(dmPayload);
      const req = new NextRequest("http://localhost/api", {
        method: "POST",
        body: dmPayload,
        headers: { "x-hub-signature-256": sig }
      });
      
      const res = await POST(req);
      expect(res.status).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not call handleNormalizedEvent if it's a duplicate
      expect(handleNormalizedEvent).not.toHaveBeenCalled();
      expect(mockInsertOne).not.toHaveBeenCalled();
    });
  });
});
