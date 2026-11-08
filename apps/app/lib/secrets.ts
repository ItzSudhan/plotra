import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Secrets the server keeps for a project (a GitHub token for lib/git-sync.ts),
// sealed with a key derived from the server's own secret (BETTER_AUTH_SECRET),
// so a copy of the database alone doesn't hold them. AES-256-GCM, with what
// the secret is for authenticated alongside it: a sealed value moved to
// another project doesn't open there. Changing BETTER_AUTH_SECRET makes every
// sealed value unreadable; whoever set one up enters it again.

const VERSION = "s1";

function keyFor(purpose: string): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 16) throw new Error("This server has no secret to keep tokens with (BETTER_AUTH_SECRET).");
  return Buffer.from(hkdfSync("sha256", secret, "", `plotra/${purpose}/v1`, 32));
}

const b64 = (bytes: Buffer) => bytes.toString("base64url");

/** Seals `plain` for one use: `purpose` names the kind of secret, `context` what it belongs to. */
export function seal(plain: string, purpose: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(body)].join(".");
}

/** Opens a sealed value; throws when it can't be, with no fallback. */
export function unseal(stored: string, purpose: string, context: string): string {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error("The saved token can't be read. Enter it again.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(purpose), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The saved token can't be read. Enter it again.");
  }
}
