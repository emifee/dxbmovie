/**
 * Instagram Messaging API client — server-only.
 *
 * All Meta Graph API interactions for Instagram messaging live here.
 * Never import this module on the client side.
 *
 * Environment variables consumed (must never be logged):
 *   INSTAGRAM_ACCESS_TOKEN
 */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstagramSendResult {
  success: boolean;
  recipientId?: string;
  messageId?: string;
  error?: {
    code: number;
    subcode?: number;
    message: string;
    type: string;
  };
}

export class InstagramApiError extends Error {
  code: number;
  subcode?: number;
  type: string;

  constructor(message: string, code: number, type: string, subcode?: number) {
    super(message);
    this.name = "InstagramApiError";
    this.code = code;
    this.type = type;
    this.subcode = subcode;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function getAccessToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new InstagramApiError(
      "INSTAGRAM_ACCESS_TOKEN is not configured.",
      0,
      "ConfigurationError",
    );
  }
  return token;
}

/**
 * Send a plain text message to an Instagram user via the Instagram Messaging API.
 *
 * Uses the Instagram-scoped user ID (IGSID) as the recipient.
 *
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api#send-messages
 */
export async function sendTextMessage(
  recipientId: string,
  text: string,
): Promise<InstagramSendResult> {
  const token = getAccessToken();

  const url = `${GRAPH_API_BASE}/me/messages`;

  const body = {
    recipient: { id: recipientId },
    message: { text },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const err = data.error || {};
      console.error(
        `[instagram/client] send_failed recipient=${recipientId} code=${err.code} type=${err.type} message=${err.message}`,
      );
      return {
        success: false,
        error: {
          code: err.code ?? res.status,
          subcode: err.error_subcode,
          message: err.message ?? "Unknown error",
          type: err.type ?? "UnknownError",
        },
      };
    }

    console.log(
      `[instagram/client] reply_success recipient=${recipientId} messageId=${data.message_id}`,
    );

    return {
      success: true,
      recipientId: data.recipient_id,
      messageId: data.message_id,
    };
  } catch (networkError: any) {
    console.error(
      `[instagram/client] network_error recipient=${recipientId} error=${networkError.message}`,
    );
    return {
      success: false,
      error: {
        code: 0,
        message: networkError.message ?? "Network error",
        type: "NetworkError",
      },
    };
  }
}

/**
 * Reply publicly to an Instagram comment.
 *
 * @see https://developers.facebook.com/docs/instagram-api/guides/mentions-and-comments#replying-to-a-comment
 */
export async function replyToComment(
  commentId: string,
  text: string,
): Promise<InstagramSendResult> {
  const token = getAccessToken();
  const url = `${GRAPH_API_BASE}/${commentId}/replies`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: text }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const err = data.error || {};
      console.error(
        `[instagram/client] reply_comment_failed commentId=${commentId} code=${err.code} type=${err.type} message=${err.message}`,
      );
      return {
        success: false,
        error: {
          code: err.code ?? res.status,
          subcode: err.error_subcode,
          message: err.message ?? "Unknown error",
          type: err.type ?? "UnknownError",
        },
      };
    }

    console.log(
      `[instagram/client] reply_comment_success commentId=${commentId} replyId=${data.id}`,
    );

    return {
      success: true,
      messageId: data.id,
    };
  } catch (networkError: any) {
    console.error(
      `[instagram/client] reply_comment_network_error commentId=${commentId} error=${networkError.message}`,
    );
    return {
      success: false,
      error: {
        code: 0,
        message: networkError.message ?? "Network error",
        type: "NetworkError",
      },
    };
  }
}

/**
 * Send a private DM reply to an Instagram comment.
 *
 * @see https://developers.facebook.com/docs/business-messaging/instagram-messaging/features/private-replies
 */
export async function sendPrivateReplyToComment(
  commentId: string,
  text: string,
): Promise<InstagramSendResult> {
  const token = getAccessToken();
  const url = `${GRAPH_API_BASE}/me/messages`;

  const body = {
    recipient: { comment_id: commentId },
    message: { text },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const err = data.error || {};
      console.error(
        `[instagram/client] private_reply_failed commentId=${commentId} code=${err.code} type=${err.type} message=${err.message}`,
      );
      return {
        success: false,
        error: {
          code: err.code ?? res.status,
          subcode: err.error_subcode,
          message: err.message ?? "Unknown error",
          type: err.type ?? "UnknownError",
        },
      };
    }

    console.log(
      `[instagram/client] private_reply_success commentId=${commentId} messageId=${data.message_id}`,
    );

    return {
      success: true,
      recipientId: data.recipient_id,
      messageId: data.message_id,
    };
  } catch (networkError: any) {
    console.error(
      `[instagram/client] private_reply_network_error commentId=${commentId} error=${networkError.message}`,
    );
    return {
      success: false,
      error: {
        code: 0,
        message: networkError.message ?? "Network error",
        type: "NetworkError",
      },
    };
  }
}
