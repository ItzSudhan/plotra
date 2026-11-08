/** A pasted link as an image address, or an error to show. Pure. */
export function checkImageLink(input: string): { url: string } | { error: string } {
  const text = input.trim();
  if (!text) return { error: "Paste a link to a picture first." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "That doesn't look like a web link. It should start with https://" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Only web links (starting with https://) can be used for pictures." };
  if (text.length > 2000) return { error: "That link is too long. Try a shorter one." };
  return { url: url.toString() };
}
