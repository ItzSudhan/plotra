import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// A person's own provider key at rest (plan.md 2.11 "Whose model"). AES-256-GCM
// with a key derived from AI_KEY_SECRET, so a copy of the database alone
// doesn't hold anyone's key. The plain key exists only on the server, for that
// person's own runs: it is never sent to the browser and never logged.
//
// The user id is authenticated with the ciphertext, so a row copied onto
// another account doesn't decrypt there.

const VERSION = "v1";
const INFO = "plotra/ai-key/v1";

/** Whether this server can store keys at all: bring-your-own-key is off without the secret. */
export function keysConfigured(): boolean {
  return (process.env.AI_KEY_SECRET ?? "").length >= 16;
}

function derivedKey(): Buffer {
  const secret = process.env.AI_KEY_SECRET ?? "";
  // A short secret is a mistake (a placeholder left in .env), not something to encrypt with.
  if (secret.length < 16) throw new Error("This server isn't set up to store AI keys.");
  return Buffer.from(hkdfSync("sha256", secret, "", INFO, 32));
}

const b64 = (bytes: Buffer) => bytes.toString("base64url");

/** Encrypts a provider key for one user. */
export function encryptKey(plain: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(body)].join(".");
}

/**
 * Decrypts a stored key. Throws when the secret has changed, the value was
 * tampered with or it belongs to someone else: there is no fallback, a key
 * that can't be verified is not used.
 */
export function decryptKey(stored: string, userId: string): string {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error("The saved key can't be read. Enter it again.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The saved key can't be read. Enter it again.");
  }
}

/** All the browser is ever shown of a key. */
export const lastFour = (key: string) => (key.length > 8 ? key.slice(-4) : "");
