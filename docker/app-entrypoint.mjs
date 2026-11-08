// Starts the Plotra app server (see docker/app.Dockerfile).
//
// NEXT_PUBLIC_COLLAB_URL is compiled into the browser bundle. An image built
// for one server (docker compose up --build) has the real address in it, and
// this script leaves it alone. The published image (ghcr.io) is built with a
// placeholder instead, and this script writes the container's
// NEXT_PUBLIC_COLLAB_URL over it before the server starts. The address written
// last is kept in a stamp file, so a changed address replaces the old one on
// the next start.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PLACEHOLDER = "https://plotra-collab-url.invalid";
const root = new URL("./apps/app/.next/", `file://${process.cwd()}/`).pathname;
const stamp = join(root, "plotra-collab-url");
const TEXT = /\.(js|mjs|cjs|html|rsc|json|body|meta|txt)$/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (TEXT.test(entry.name)) yield path;
  }
}

async function main() {
  const wanted = (process.env.NEXT_PUBLIC_COLLAB_URL || "http://localhost:8787").replace(/\/+$/, "");
  const previous = await readFile(stamp, "utf8").then((s) => s.trim(), () => PLACEHOLDER);
  if (previous === wanted) return;
  let changed = 0;
  for await (const path of files(root)) {
    const text = await readFile(path, "utf8");
    if (!text.includes(previous)) continue;
    await writeFile(path, text.split(previous).join(wanted));
    changed++;
  }
  // A compose-built image never had the placeholder: nothing to write, and no stamp.
  if (changed === 0 && previous === PLACEHOLDER) return;
  await writeFile(stamp, wanted);
  console.log(`[plotra] collab server address set to ${wanted} (${changed} files)`);
}

await main();
await import(join(process.cwd(), "apps/app/server.js"));
