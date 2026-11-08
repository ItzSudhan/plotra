import { isLocalMode } from "@/lib/local-mode";
import { db } from "@plotra/db";
import { sql } from "drizzle-orm";
import { monitoringEnabled, OBJECT_STORE_WARNING, objectStoreMissing } from "@/lib/monitoring";
import { r2Enabled } from "@/lib/r2";

// GET /api/health: for an uptime check (.github/workflows/uptime.yml) and for
// whoever just deployed. No sign-in. Answers 200 when the app can reach its
// database and 503 when it can't.
//
// `services` says which optional services are configured, as true or false and
// never a value. `?db=0` skips the database query: a check that runs every few
// minutes would otherwise keep a scale-to-zero database (Neon's free tier)
// awake around the clock and spend its monthly compute.

const DB_TIMEOUT_MS = 5000;

const has = (...names: string[]) => names.every((name) => Boolean(process.env[name]?.trim()));

async function databaseUp(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), DB_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (error) {
    // The reason goes to the server log, not to whoever asked.
    console.error("[plotra] health: database check failed:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const skipDatabase = new URL(request.url).searchParams.get("db") === "0";
  const database = skipDatabase ? "skipped" : (await databaseUp()) ? "ok" : "down";
  const ok = database !== "down";
  const body = {
    ok,
    database,
    services: {
      objectStore: r2Enabled(),
      email: has("SMTP_URL"),
      googleSignIn: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      // Local mode saves through the app itself (lib/collab/local-hub.ts).
      collab: isLocalMode || has("COLLAB_SECRET", "NEXT_PUBLIC_COLLAB_URL"),
      errorTracking: monitoringEnabled(),
    },
    warnings: objectStoreMissing() ? [OBJECT_STORE_WARNING] : [],
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
  return Response.json(body, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
