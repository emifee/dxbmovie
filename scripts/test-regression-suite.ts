/**
 * Guarded runner for the integration regression suite.
 *
 * SAFETY: the integration suite writes orders, products and conversations to MongoDB.
 * An earlier version of this file wrote test data straight into the PRODUCTION database
 * (11 stray "Test Digital Product" rows and 6 stuck orders are still there as a result),
 * so the guard below is unconditional and this runner is the only supported entry point.
 *
 *   mongod --port 27018 --dbpath /tmp/dxb-test-db &
 *   node scripts/test-regression-suite.ts
 *
 * Options:
 *   TEST_MONGODB_URI=...   target database (default mongodb://127.0.0.1:27018)
 *   RUN_LLM_TESTS=1        also run the conversational tests (real OpenAI calls, costs money)
 *
 * The fast hermetic tests in __tests__/commerce/ need none of this and run with `npx jest`.
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const DEFAULT_TEST_URI = "mongodb://127.0.0.1:27018";

function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^=#]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function hostOf(uri: string | undefined): string {
  if (!uri) return "";
  const m = uri.match(/@([^/?]+)/);
  return (m ? m[1] : uri).toLowerCase();
}

const fileEnv = loadEnvLocal();
const productionUri = process.env.MONGODB_URI || fileEnv.MONGODB_URI;
const testUri = process.env.TEST_MONGODB_URI || DEFAULT_TEST_URI;

if (productionUri) {
  if (testUri === productionUri || hostOf(testUri) === hostOf(productionUri)) {
    console.error(
      `\nREFUSING TO RUN: the test database resolves to the production host (${hostOf(productionUri)}).\n\n` +
        'The application hardcodes db("dxbmovies"), so a different database name on the same\n' +
        "cluster is not isolation. Point TEST_MONGODB_URI at a separate server.\n"
    );
    process.exit(2);
  }
}

console.log(`[suite] test database: ${hostOf(testUri)}`);
console.log(`[suite] production database: ${hostOf(productionUri) || "(not configured)"} — will NOT be touched`);
console.log(
  process.env.RUN_LLM_TESTS === "1"
    ? "[suite] conversational LLM tests: ENABLED (this makes real OpenAI calls)\n"
    : "[suite] conversational LLM tests: skipped (set RUN_LLM_TESTS=1 to include them)\n"
);

// Everything the application reads must point at the test database. lib/mongodb.ts
// resolves MONGODB_URI at import time, so it is overridden in the child environment
// rather than mutated after the fact.
const result = spawnSync(
  "npx",
  ["jest", "__tests__/integration", "--runInBand", "--forceExit", "--verbose"],
  {
    stdio: "inherit",
    env: {
      ...fileEnv,
      ...process.env,
      MONGODB_URI: testUri,
      TEST_MONGODB_URI: testUri,
      NODE_ENV: "test",
    },
  }
);

process.exit(result.status ?? 1);
