import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness + build identity.
 *
 * Production used to be an anonymous `.next` snapshot: there was no way to tell which
 * code was actually running, which is how a partially-deployed mid-edit build went
 * unnoticed. These values are inlined at build time by next.config.js.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      commit: process.env.BUILD_COMMIT ?? "unknown",
      tag: process.env.BUILD_TAG ?? "unknown",
      dirty: process.env.BUILD_DIRTY === "true",
      builtAt: process.env.BUILD_TIME ?? "unknown",
      appBuildId: process.env.APP_BUILD_ID ?? "unset",
    },
    { status: 200 }
  );
}
