import { NextResponse } from "next/server";
import {
  sendTextMessage,
  sendImageMessage,
  sendMediaShare,
  sendQuickReplies,
  sendButtonTemplate,
  sendGenericTemplate,
} from "@/lib/instagram/client";

export async function POST(req: Request) {
  // Admin protection
  const authHeader = req.headers.get("Authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipientId = body.recipientId;
  if (!recipientId) {
    return NextResponse.json({ error: "Missing recipientId" }, { status: 400 });
  }

  const testId = body.test;
  if (!testId) {
    return NextResponse.json({ 
      instructions: "Provide a 'test' property (1..9) in JSON body.",
      tests: [
        "1: Plain text",
        "2: Standalone poster image URL",
        "3: Image using uploaded attachment ID (requires attachmentId)",
        "4: Owned Instagram post/media share (requires mediaId)",
        "5: Quick replies",
        "6: Button template",
        "7: Generic image card",
        "8: Generic image card with web_url button",
        "9: Postback button",
      ]
    });
  }

  const results: any = {};
  const tId = parseInt(testId, 10);
  
  const logTest = (name: string, res: any) => {
    results[name] = {
      timestamp: new Date().toISOString(),
      recipientId,
      success: res.success,
      messageId: res.messageId,
      error: res.error,
    };
  };

  const sampleImageUrl = "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg"; // Deadpool

  switch (tId) {
    case 1: {
      const res = await sendTextMessage(recipientId, "TEST 1: This is a plain text message.");
      logTest("TEST_1_PLAIN_TEXT", res);
      break;
    }
    case 2: {
      const res = await sendImageMessage(recipientId, sampleImageUrl, false);
      logTest("TEST_2_IMAGE_URL", res);
      break;
    }
    case 3: {
      const attachmentId = body.attachmentId;
      if (!attachmentId) {
        logTest("TEST_3_ATTACHMENT_ID", { success: false, error: { message: "fixture_missing: Missing attachmentId" } });
        break;
      }
      const res = await sendImageMessage(recipientId, attachmentId, true);
      logTest("TEST_3_ATTACHMENT_ID", res);
      break;
    }
    case 4: {
      const mediaId = body.mediaId;
      if (!mediaId) {
        logTest("TEST_4_MEDIA_SHARE", { success: false, error: { message: "fixture_missing: Missing mediaId" } });
        break;
      }
      const res = await sendMediaShare(recipientId, mediaId);
      logTest("TEST_4_MEDIA_SHARE", res);
      break;
    }
    case 5: {
      const res = await sendQuickReplies(recipientId, "TEST 5: Quick replies. Choose an option:", [
        { content_type: "text", title: "More Action", payload: "TEST_ACTION" },
        { content_type: "text", title: "Comedy", payload: "TEST_COMEDY" },
        { content_type: "user_phone_number" }
      ]);
      logTest("TEST_5_QUICK_REPLIES", res);
      break;
    }
    case 6: {
      const res = await sendButtonTemplate(recipientId, "TEST 6: Button Template", [
        { type: "postback", title: "Action 1", payload: "BTN_1" },
        { type: "postback", title: "Action 2", payload: "BTN_2" }
      ]);
      logTest("TEST_6_BUTTON_TEMPLATE", res);
      break;
    }
    case 7: {
      const res = await sendGenericTemplate(recipientId, [
        {
          title: "The Accountant",
          subtitle: "2016 • Action/Thriller",
          image_url: sampleImageUrl
        }
      ]);
      logTest("TEST_7_GENERIC_CARD", res);
      break;
    }
    case 8: {
      const res = await sendGenericTemplate(recipientId, [
        {
          title: "Samsung 34' Odyssey G5",
          subtitle: "Total: $540 | Availability verified",
          image_url: "https://m.media-amazon.com/images/I/71it2biogSS._AC_SL1500_.jpg",
          buttons: [
            { type: "web_url", title: "Pay securely", url: "https://dxbmovie.online" }
          ]
        }
      ]);
      logTest("TEST_8_CARD_WEB_URL", res);
      break;
    }
    case 9: {
      const res = await sendGenericTemplate(recipientId, [
        {
          title: "Postback Test",
          subtitle: "Click the button below to test webhook receipt.",
          buttons: [
            { type: "postback", title: "Trigger Webhook", payload: "TEST_POSTBACK_PAYLOAD" }
          ]
        }
      ]);
      logTest("TEST_9_POSTBACK", res);
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });
  }

  return NextResponse.json({ 
    info: "Test executed. Check your Instagram DMs and verify rendering.",
    results 
  });
}
