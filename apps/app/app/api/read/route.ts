import { unstable_rethrow } from "next/navigation";
import { publicMessage } from "@/lib/errors";
import { decode, encode } from "@/lib/read-codec";
import { reads } from "@/lib/reads";

// POST /api/read?fn=<name>, body = JSON array of arguments. See lib/reads.ts.
export async function POST(request: Request) {
  const name = new URL(request.url).searchParams.get("fn") ?? "";
  // JSON only, so a cross-site form can't post here without a CORS preflight.
  if (!Object.hasOwn(reads, name) || request.headers.get("content-type") !== "application/json") {
    return new Response("Not found", { status: 404 });
  }
  const args = decode<unknown[]>(await request.text());
  if (!Array.isArray(args)) return new Response("Bad request", { status: 400 });
  try {
    const fn = reads[name as keyof typeof reads] as (...args: unknown[]) => Promise<unknown>;
    return new Response(encode(await fn(...args)), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    // notFound() and redirect() (no access, signed out) become plain errors for the caller.
    try {
      unstable_rethrow(error);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    return new Response(publicMessage(error), { status: 400 });
  }
}
