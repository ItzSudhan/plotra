import type { Reads } from "./reads";
import { errorFromBody } from "./errors";
import { decode, encode } from "./read-codec";

/**
 * Calls a read from lib/reads.ts. Unlike a server action it doesn't queue
 * behind other actions, so polling and hover cards never block an edit.
 */
export async function read<K extends keyof Reads>(name: K, ...args: Parameters<Reads[K]>): Promise<Awaited<ReturnType<Reads[K]>>> {
  const res = await fetch(`/api/read?fn=${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: encode(args),
    cache: "no-store",
  });
  if (!res.ok) throw errorFromBody(await res.text(), `Request failed (${res.status}).`);
  return decode<Awaited<ReturnType<Reads[K]>>>(await res.text());
}
