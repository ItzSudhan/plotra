import { errorFromBody, statusText } from "@/lib/errors";

// Routes answer a failure with one plain sentence (lib/errors.ts
// `publicMessage`, lib/agent/model-errors.ts). Bodies that aren't one, such as
// "Bad request" or an HTML error page from a proxy, become words for the status.

const KEY_REJECTED = /didn't accept the key|invalid api key|incorrect api key/i;

/** The words to show for a failed response's body. Pure, so it can be tested. */
export function responseMessage(status: number, body: string, fallback: string): string {
  const text = body.trim();
  const plain = text.length > 0 && text.length <= 300 && !/[<>{}]/.test(text) && !/^(bad request|not found|unauthori[sz]ed|forbidden|internal server error)\.?$/i.test(text);
  if (plain) return text;
  return status > 400 ? statusText(status) : fallback;
}

/** An AI failure in plain words: a rejected key says where to fix it. */
export function aiMessage(status: number, body: string, fallback: string): string {
  if (KEY_REJECTED.test(body)) return "Your AI key was rejected. Check it in Settings → AI.";
  return responseMessage(status, body, fallback);
}

/** An error to throw for a response that wasn't ok. `ai` maps the provider's key errors too. */
export async function responseError(response: Response, fallback: string, options: { ai?: boolean } = {}): Promise<Error> {
  const body = await response.text().catch(() => "");
  return errorFromBody((options.ai ? aiMessage : responseMessage)(response.status, body, fallback), fallback);
}
