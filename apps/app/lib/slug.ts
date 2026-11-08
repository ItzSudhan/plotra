export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Only allow same-origin relative paths, so `?callbackURL=` can't redirect off-site. */
export function safeCallbackURL(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  // "//host" and "/\host" are protocol-relative URLs in browsers.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
