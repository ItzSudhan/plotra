import "server-only";
import { loadAttachment } from "@/app/api/files/store";
import { fetchImage, IMAGE_TYPES } from "../clip";
import { blockTags, type BlockTags, type DocNode } from "../doc-index";
import { safeUrl } from "./html";

// Pictures packed into an export that has to stand on its own (an EPUB, the
// static wiki), instead of pointing back at the app or the web. A file
// attached in the project is read with the exporter's own access; a picture on
// the web is fetched under the clipper's rules (public addresses only). One
// that can't be had is left out, as before.

const MAX_IMAGES = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const AT_ONCE = 6;

const extension: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

/** A file attached in the app, as the editor puts it in a note: /api/files/<id>. */
const ATTACHMENT = /^\/api\/files\/([0-9a-f-]{36})(?:\?.*)?$/i;

export type PackedImage = { path: string; contentType: string; bytes: Uint8Array };

/** Every picture source in these documents, once each, leaving out blocks the export's filters hide. */
export function imageUrls(docs: Iterable<DocNode[]>, showBlock?: (tags: BlockTags | null) => boolean): string[] {
  const urls = new Set<string>();
  const walk = (nodes: DocNode[]) => {
    for (const n of nodes) {
      if (typeof n.text === "string") continue;
      if (showBlock && !showBlock(blockTags(n))) continue;
      if (n.type === "img" && typeof n.url === "string" && n.url.trim()) urls.add(n.url.trim());
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  for (const doc of docs) walk(doc);
  return [...urls];
}

/** A picture attached in the project, read with the exporter's own access: an EPUB's cover. Null when it can't be had. */
export const loadAttachedImage = (fileId: string) => load(`/api/files/${fileId}`);

async function load(url: string): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  const attached = ATTACHMENT.exec(url);
  if (attached) {
    const file = await loadAttachment(attached[1]).catch(() => null);
    return file && IMAGE_TYPES.includes(file.contentType) && file.bytes.byteLength <= MAX_IMAGE_BYTES ? file : null;
  }
  const remote = safeUrl(url);
  return remote ? fetchImage(remote, MAX_IMAGE_BYTES).catch(() => null) : null;
}

/**
 * Loads the pictures these documents show and names a file for each, as
 * `images/image-001.png` and so on. `src` maps a picture's URL to its file, or
 * to null for one that couldn't be packed.
 */
export async function packImages(
  docs: Iterable<DocNode[]>,
  showBlock?: (tags: BlockTags | null) => boolean,
): Promise<{ files: PackedImage[]; src: (url: unknown) => string | null }> {
  const urls = imageUrls(docs, showBlock).slice(0, MAX_IMAGES);
  const loaded: Array<{ contentType: string; bytes: Uint8Array } | null> = [];
  for (let i = 0; i < urls.length; i += AT_ONCE) loaded.push(...(await Promise.all(urls.slice(i, i + AT_ONCE).map(load))));

  const files: PackedImage[] = [];
  const paths = new Map<string, string>();
  let total = 0;
  urls.forEach((url, i) => {
    const image = loaded[i];
    if (!image || total + image.bytes.byteLength > MAX_TOTAL_BYTES) return;
    total += image.bytes.byteLength;
    const path = `images/image-${String(files.length + 1).padStart(3, "0")}.${extension[image.contentType]}`;
    files.push({ path, contentType: image.contentType, bytes: image.bytes });
    paths.set(url, path);
  });

  return { files, src: (url) => (typeof url === "string" ? (paths.get(url.trim()) ?? null) : null) };
}
