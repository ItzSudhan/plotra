import { describe, expect, test } from "bun:test";

// A `.plotra` file sent straight to object storage before it's imported
// (lib/io/plotra-upload.ts): how large it may be, whose token imports it, and
// that the temporary object is deleted whatever happens. Object storage is a
// stand-in here; nothing touches a bucket or a database.

process.env.BETTER_AUTH_SECRET ??= "a-test-secret-long-enough-to-sign";

const MB = 1024 * 1024;
const { plotraUploadCap, readPlotraUploadToken, takePlotraUpload, discardPlotraUpload, HOSTED_PLOTRA_BYTES } = await import("@/lib/io/plotra-upload");
const { MAX_PLOTRA_BYTES } = await import("@/lib/io/plotra-file");
const { signToken } = await import("@/lib/signed-token");
const { readUploadToken } = await import("@/app/api/files/store");

/** Object storage with one object in it, remembering what was deleted. */
function fakeStore(objects: Record<string, Uint8Array>) {
  const deleted: string[] = [];
  return {
    deleted,
    store: {
      size: async (key: string) => objects[key]?.length ?? null,
      get: async (key: string) => objects[key],
      delete: async (keys: string[]) => void deleted.push(...keys),
    },
  };
}

const exp = () => Math.floor(Date.now() / 1000) + 600;

describe("how large a project file may be", () => {
  test("a self-hosted server takes up to the format's limit", () => {
    expect(plotraUploadCap({ storageBytes: null, hosted: false })).toBe(MAX_PLOTRA_BYTES);
  });
  test("the hosted app stops at what a function can hold", () => {
    expect(plotraUploadCap({ storageBytes: null, hosted: true })).toBe(HOSTED_PLOTRA_BYTES);
    expect(plotraUploadCap({ storageBytes: 50 * 1024 * MB, hosted: true })).toBe(HOSTED_PLOTRA_BYTES);
  });
  test("a small plan's storage, with room for text, caps it below that", () => {
    expect(plotraUploadCap({ storageBytes: 50 * MB, hosted: true })).toBe(66 * MB);
  });
});

describe("whose upload it is", () => {
  // Signing a URL needs a configured store; the token is what's checked, so it's made here as beginPlotraUpload makes it.
  const claims = { userId: "u1", workspace: "ws", size: 10, key: "imports/u1/a.plotra", exp: exp() };
  const token = signToken("plotra-import", claims);

  test("the uploader, in the workspace they named, gets it back", () => {
    expect(readPlotraUploadToken(token, "u1", "ws")).toEqual(claims);
  });
  test("anyone else, or another workspace, doesn't", () => {
    expect(readPlotraUploadToken(token, "u2", "ws")).toBeNull();
    expect(readPlotraUploadToken(token, "u1", "other")).toBeNull();
  });
  test("a changed, expired or foreign token doesn't count", () => {
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, userId: "u2", key: "imports/u2/a.plotra" })).toString("base64url");
    expect(readPlotraUploadToken(`${forged}.${mac}`, "u2", "ws")).toBeNull();
    expect(readPlotraUploadToken(`${body}.${mac}x`, "u1", "ws")).toBeNull();
    expect(readPlotraUploadToken(signToken("plotra-import", { ...claims, exp: Math.floor(Date.now() / 1000) - 120 }), "u1", "ws")).toBeNull();
    // An attachment's token isn't an import's, and the other way round.
    expect(readPlotraUploadToken(signToken("upload", claims), "u1", "ws")).toBeNull();
    expect(readUploadToken(token)).toBeNull();
  });
  test("a key outside the uploader's own prefix is refused", () => {
    expect(readPlotraUploadToken(signToken("plotra-import", { ...claims, key: "attachments/p/x" }), "u1", "ws")).toBeNull();
  });
});

describe("the temporary object", () => {
  const claims = { userId: "u1", workspace: "ws", size: 3, key: "imports/u1/b.plotra", exp: exp() };

  test("is read, imported and deleted", async () => {
    const { store, deleted } = fakeStore({ [claims.key]: new Uint8Array([1, 2, 3]) });
    const got = await takePlotraUpload(claims, async (bytes) => bytes.length, store);
    expect(got).toBe(3);
    expect(deleted).toEqual([claims.key]);
  });
  test("is deleted when the import fails", async () => {
    const { store, deleted } = fakeStore({ [claims.key]: new Uint8Array([1, 2, 3]) });
    await expect(takePlotraUpload(claims, async () => Promise.reject(new Error("broken file")), store)).rejects.toThrow("broken file");
    expect(deleted).toEqual([claims.key]);
  });
  test("is deleted, unread, when it isn't the size announced", async () => {
    const { store, deleted } = fakeStore({ [claims.key]: new Uint8Array([1, 2, 3, 4]) });
    let ran = false;
    await expect(takePlotraUpload(claims, async () => (ran = true), store)).rejects.toThrow("isn't the one that was announced");
    expect(ran).toBe(false);
    expect(deleted).toEqual([claims.key]);
  });
  test("that never arrived is reported", async () => {
    const { store } = fakeStore({});
    await expect(takePlotraUpload(claims, async () => 0, store)).rejects.toThrow("didn't arrive");
  });
  test("is deleted when the import is refused before it starts", async () => {
    const { store, deleted } = fakeStore({ [claims.key]: new Uint8Array([1, 2, 3]) });
    await discardPlotraUpload(claims, store);
    expect(deleted).toEqual([claims.key]);
  });
});
