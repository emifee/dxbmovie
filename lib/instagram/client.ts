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
 * Send typing indicators
 */
export async function setTyping(recipientId: string, isTyping: boolean): Promise<boolean> {
  const token = getAccessToken();
  const url = `${GRAPH_API_BASE}/me/messages`;
  const body = {
    recipient: { id: recipientId },
    sender_action: isTyping ? "typing_on" : "typing_off",
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
    if (!res.ok) {
      console.warn(`[instagram/client] typing_failed recipient=${recipientId}`);
    }
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch Instagram Media Caption via Graph API
 */
export async function fetchMediaCaption(mediaId: string): Promise<string | null> {
  const token = getAccessToken();
  const url = `${GRAPH_API_BASE}/${mediaId}?fields=caption&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[instagram/client] fetch_caption_failed mediaId=${mediaId}`);
      return null;
    }
    const data = await res.json();
    return data.caption || null;
  } catch {
    return null;
  }
}

/**
 * Fetch Instagram Comment via Graph API
 */
export async function fetchComment(commentId: string): Promise<any | null> {
  const token = getAccessToken();
  const url = `${GRAPH_API_BASE}/${commentId}?fields=id,text,timestamp,username&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[instagram/client] fetch_comment_failed commentId=${commentId}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch Instagram Message by MID via Graph API
 */
export async function fetchMessage(mid: string): Promise<any | null> {
  const token = getAccessToken();
  const url = `${GRAPH_API_BASE}/${mid}?fields=id,created_time,from,to,message,attachments&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[instagram/client] fetch_message_failed mid=${mid}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch {
    return null;
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

// --------------- CAPABILITY HELPERS ---------------

async function sendBasePayload(recipientId: string, messagePayload: any): Promise<InstagramSendResult> {
  const token = getAccessToken();
  const url = `${GRAPH_API_BASE}/me/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: messagePayload,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const err = data.error || {};
      console.error(`[instagram/client] send_failed recipient=${recipientId} type=${err.type} msg=${err.message}`);
      return {
        success: false,
        error: { code: err.code ?? res.status, message: err.message ?? "Unknown error", type: err.type ?? "UnknownError" }
      };
    }
    return { success: true, recipientId: data.recipient_id, messageId: data.message_id };
  } catch (networkError: any) {
    return { success: false, error: { code: 0, message: networkError.message, type: "NetworkError" } };
  }
}

export async function sendImageMessage(recipientId: string, urlOrAttachmentId: string, isAttachmentId = false): Promise<InstagramSendResult> {
  const payload: any = { attachment: { type: "image", payload: {} } };
  if (isAttachmentId) {
    payload.attachment.payload.attachment_id = urlOrAttachmentId;
  } else {
    payload.attachment.payload.url = urlOrAttachmentId;
  }
  return sendBasePayload(recipientId, payload);
}

export async function sendMediaShare(recipientId: string, mediaId: string): Promise<InstagramSendResult> {
  return sendBasePayload(recipientId, {
    attachment: {
      type: "template",
      payload: {
        template_type: "media",
        elements: [{ media_type: "image", media_id: mediaId }]
      }
    }
  });
}

export async function sendQuickReplies(recipientId: string, text: string, replies: any[]): Promise<InstagramSendResult> {
  return sendBasePayload(recipientId, {
    text,
    quick_replies: replies
  });
}

export async function sendButtonTemplate(recipientId: string, text: string, buttons: any[]): Promise<InstagramSendResult> {
  return sendBasePayload(recipientId, {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons
      }
    }
  });
}

export async function sendGenericTemplate(recipientId: string, elements: any[]): Promise<InstagramSendResult> {
  return sendBasePayload(recipientId, {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements
      }
    }
  });
}
