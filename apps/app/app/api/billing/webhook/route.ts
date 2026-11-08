import { billingEnabled, verifyWebhook } from "@/lib/billing/creem";
import { handleEvent, type CreemEvent } from "@/lib/billing/webhook";

// POST /api/billing/webhook: where Creem reports what happened to a
// subscription (plan.md 8). Set this URL and its secret in Creem's dashboard
// under Developers → Webhooks, and the secret here as CREEM_WEBHOOK_SECRET.
//
// Nobody is signed in on this request. What makes it trusted is the signature
// over the raw body, so the body is read as text and checked before it is
// parsed. Without billing configured the route doesn't exist.

const answer = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

// Creem's events are a few kilobytes. Nothing larger is read.
const MAX_BYTES = 256 * 1024;

export async function POST(request: Request) {
  if (!billingEnabled() || !process.env.CREEM_WEBHOOK_SECRET?.trim()) return answer(404, "Not found");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return answer(413, "Too large");
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return answer(413, "Too large");
  if (!verifyWebhook(raw, request.headers.get("creem-signature"))) return answer(401, "Bad signature");

  let event: CreemEvent;
  try {
    event = JSON.parse(raw) as CreemEvent;
  } catch {
    return answer(400, "Bad request");
  }
  try {
    return answer(200, await handleEvent(event));
  } catch (error) {
    // A 5xx makes Creem deliver it again later (five attempts over a few hours).
    console.error("[plotra] couldn't handle a billing webhook", error);
    return answer(500, "Try again");
  }
}
