// Stable per-user colours for cursors and presence avatars.
const palette = ["#d9480f", "#2b8a3e", "#1971c2", "#9c36b5", "#c25e00", "#0c8599", "#c2255c", "#5f3dc4"];

export function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Near-black or white, whichever reads better on `hex`: for names and initials on a person's colour. */
export function readableOn(hex: string): string {
  if (!/^#?[0-9a-f]{3,8}$/i.test(hex)) return "#ffffff";
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onBlack > onWhite ? "#161412" : "#ffffff";
}
