import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type IconName, iconSvg } from "@plotra/icons";
import type { NodeKind } from "@plotra/db/schema";
import { ImageResponse } from "next/og";

// The cards a read-only link unfurls into in Discord, Slack, iMessage and the
// rest: one for the project's front page and one for each note. They are drawn
// per request (a link can be switched off at any time) in the marketing site's
// faces and colours, each kind of note in a colour of its own.

export const cardSize = { width: 1200, height: 630 };
export const cardType = "image/png";

const ink = "#161412";
const muted = "#5e5a54";
const paper = "#fbf8f3";
const ember = "#e2602a";

/** Each kind's colour on its card. */
const accents: Record<NodeKind | "project", string> = {
  project: ember,
  folder: "#8a6a3c",
  chapter: "#6d4bd8",
  scene: ember,
  note: "#0f8a7e",
  character: "#d4366f",
  location: "#16884f",
  research: "#b7791f",
  canvas: "#2f6fe0",
  timeline: "#4b52d6",
  entity: "#0b87a8",
  dialogue: "#9a3fd6",
};

const plural: Record<NodeKind, [string, string]> = {
  folder: ["folder", "folders"],
  chapter: ["chapter", "chapters"],
  scene: ["scene", "scenes"],
  note: ["note", "notes"],
  character: ["character", "characters"],
  location: ["location", "locations"],
  research: ["source", "sources"],
  canvas: ["board", "boards"],
  timeline: ["timeline", "timelines"],
  entity: ["world entry", "world entries"],
  dialogue: ["dialogue", "dialogues"],
};

export const countLabel = (kind: NodeKind, n: number) => plural[kind][n === 1 ? 0 : 1];

const rgba = (hex: string, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const svgSrc = (name: IconName, color: string) => {
  const svg = iconSvg(name, color);
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
};

// Read once per server, not once per card.
let assets: Promise<{ youngSerif: Buffer; inter: Buffer; logo: string }> | null = null;
const loadAssets = () =>
  (assets ??= Promise.all([
    readFile(join(process.cwd(), "assets/og/YoungSerif-Regular.ttf")),
    readFile(join(process.cwd(), "assets/og/Inter-Regular.ttf")),
    readFile(join(process.cwd(), "public/logo.png")),
  ]).then(([youngSerif, inter, logo]) => ({ youngSerif, inter, logo: `data:image/png;base64,${logo.toString("base64")}` })));

/** Bigger for a short title, smaller as it grows, so any title fits in three lines. */
function titleSize(title: string, narrow: boolean) {
  const n = title.length * (narrow ? 1.35 : 1);
  return n <= 16 ? 104 : n <= 26 ? 88 : n <= 44 ? 72 : n <= 70 ? 58 : 48;
}

export type CardInput = {
  kind: NodeKind | "project";
  /** "Scene", "Character", or a custom world-bible type's name. */
  kindLabel: string;
  icon: IconName;
  title: string;
  /** Where the note sits: the project, then the folders it's in. */
  trail: string[];
  /** The note's own one-line summary. */
  synopsis?: string | null;
  /** The opening of what's written, shown as a quotation when there's no synopsis. */
  quote?: string | null;
  tags?: string[];
  /** For the project: how many of each kind it holds. */
  counts?: Array<{ n: number; label: string }>;
  /** The line at the bottom right, such as "1,240 words · 6 min read". */
  meta?: string | null;
  /** The note's first picture, as a data URL. */
  image?: string | null;
  /** The call to action on the button. */
  action: string;
};

export async function drawCard(card: CardInput) {
  const { youngSerif, inter, logo } = await loadAssets();
  const accent = accents[card.kind];
  const icon = svgSrc(card.icon, accent);
  const watermark = card.image ? null : svgSrc(card.icon, rgba(accent, 0.09));
  const title = card.title || "Untitled";
  const narrow = Boolean(card.image);
  const size = titleSize(title, narrow);
  const body = card.synopsis || card.quote;
  const tags = (card.tags ?? []).slice(0, 4);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: paper,
          backgroundImage: `radial-gradient(circle at 100% 0%, ${rgba(accent, 0.3)}, ${rgba(accent, 0.1)} 34%, rgba(251, 248, 243, 0) 62%), radial-gradient(circle at 0% 100%, rgba(255, 196, 140, 0.28), rgba(251, 248, 243, 0) 45%)`,
          color: ink,
          fontFamily: "Inter",
        }}
      >
        {/* The kind's colour down the left edge. */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, backgroundColor: accent }} />

        {watermark && (
          // eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page
          <img src={watermark} width={560} height={560} alt="" style={{ position: "absolute", right: -90, bottom: -110, transform: "rotate(-12deg)" }} />
        )}

        <div style={{ display: "flex", flex: 1, padding: "56px 72px 52px 86px", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            {/* What it is, and where it sits. */}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 20px 9px 14px",
                  borderRadius: 999,
                  backgroundColor: rgba(accent, 0.12),
                  border: `2px solid ${rgba(accent, 0.35)}`,
                  color: accent,
                  fontSize: 25,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
                {icon && <img src={icon} width={30} height={30} alt="" />}
                {card.kindLabel}
              </div>
              {card.trail.length > 0 && (
                <div style={{ display: "block", flex: 1, minWidth: 0, fontSize: 25, color: muted, lineClamp: 1 }}>{card.trail.join("  ›  ")}</div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
              <div
                style={{
                  display: "block",
                  fontFamily: "Young Serif",
                  fontSize: size,
                  lineHeight: 1.04,
                  letterSpacing: size > 70 ? -2.5 : -1.5,
                  lineClamp: body || card.counts?.length ? 2 : 3,
                }}
              >
                {title}
              </div>

              {card.synopsis ? (
                <div style={{ display: "block", marginTop: 22, fontSize: 30, lineHeight: 1.36, color: muted, lineClamp: size > 70 ? 3 : 2 }}>
                  {card.synopsis}
                </div>
              ) : card.quote ? (
                <div style={{ display: "flex", marginTop: 22, gap: 16 }}>
                  <div style={{ display: "flex", width: 5, borderRadius: 4, backgroundColor: rgba(accent, 0.55) }} />
                  <div style={{ display: "block", flex: 1, fontFamily: "Young Serif", fontSize: 28, lineHeight: 1.42, color: "#3d3a35", lineClamp: size > 70 ? 3 : 2 }}>
                    {card.quote}
                  </div>
                </div>
              ) : null}

              {card.counts && card.counts.length > 0 && (
                <div style={{ display: "flex", gap: 40, marginTop: 30 }}>
                  {card.counts.slice(0, 4).map((c) => (
                    <div key={c.label} style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ fontFamily: "Young Serif", fontSize: 52, lineHeight: 1, color: accent }}>{c.n.toLocaleString("en-US")}</div>
                      <div style={{ marginTop: 6, fontSize: 22, color: muted }}>{c.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
                  {tags.map((tag) => (
                    <div key={tag} style={{ display: "flex", padding: "6px 16px", borderRadius: 999, backgroundColor: "rgba(22, 20, 18, 0.06)", fontSize: 21, color: muted }}>
                      #{tag}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Whose it is, how long it is, and where to read it. */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
              <img src={logo} width={46} height={46} alt="" />
              <div style={{ fontFamily: "Young Serif", fontSize: 34, letterSpacing: -0.5 }}>Plotra</div>
              <div style={{ display: "flex", flex: 1 }} />
              {card.meta && <div style={{ display: "flex", fontSize: 23, color: muted, marginRight: 8 }}>{card.meta}</div>}
              <div style={{ display: "flex", alignItems: "center", padding: "13px 28px", borderRadius: 999, backgroundColor: ink, color: "#ffffff", fontSize: 23 }}>
                {card.action} →
              </div>
            </div>
          </div>

          {card.image && (
            <div
              style={{
                display: "flex",
                alignSelf: "center",
                width: 360,
                height: 470,
                padding: 10,
                borderRadius: 30,
                backgroundColor: "#ffffff",
                transform: "rotate(2.5deg)",
                boxShadow: `0 30px 60px -20px ${rgba(accent, 0.45)}, 0 10px 24px -12px rgba(22, 20, 18, 0.35)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
              <img src={card.image} width={340} height={450} alt="" style={{ borderRadius: 22, objectFit: "cover" }} />
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...cardSize,
      fonts: [
        { name: "Young Serif", data: youngSerif, style: "normal", weight: 400 },
        { name: "Inter", data: inter, style: "normal", weight: 400 },
      ],
      headers: {
        // A link that is switched off stops showing its card at once.
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    },
  );
}

/** The card for a link that is switched off, never existed, or is being asked too often: nothing of the project. */
export const plainCard = () =>
  drawCard({ kind: "project", kindLabel: "Shared on Plotra", icon: "book-2-linear", title: "A story, shared from Plotra", trail: [], action: "Open" });
