import { timingSafeEqual } from "node:crypto";
import { sweepGitSyncs } from "@/lib/git-sync";
import { sendDigests } from "@/lib/notify";

// GET or POST /api/cron/digest: sends the daily notification digest (plan.md
// 2.6, Phase 10), and brings GitHub syncs with changes still waiting up to
// date (lib/git-sync.ts). Called once a day by .github/workflows/digest.yml, because
// Vercel's Hobby plan runs cron jobs only once a day and at no fixed minute,
// and a self-hosted instance has no Vercel at all. Vercel Cron works too: it
// sends the same `Authorization: Bearer $CRON_SECRET` header on a GET.
//
// Without CRON_SECRET the route doesn't exist: nobody should be able to make
// the server send email by asking.

function allowed(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: Request) {
  const ok = allowed(request);
  if (ok === null) return new Response("Not found", { status: 404 });
  if (!ok) return new Response("Unauthorized", { status: 401 });
  // Counts only: who was emailed is nobody's business but theirs.
  const digests = await sendDigests();
  // The day's sweep of GitHub syncs with changes still waiting (lib/git-sync.ts).
  const git = await sweepGitSyncs().catch(() => ({ synced: 0, failed: 0 }));
  return Response.json({ ok: true, ...digests, gitSynced: git.synced, gitFailed: git.failed }, { headers: { "cache-control": "no-store" } });
}

export const GET = run;
export const POST = run;
