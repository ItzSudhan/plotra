import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { type ArtName, blogArt } from "@/components/blog/art";

// The card a link to one of the site's inner pages unfurls into: the logo, the
// section it belongs to, the page's title and, for a post, its drawing. It
// matches the home page's own card (app/opengraph-image.tsx).

export const cardSize = { width: 1200, height: 630 };
export const cardType = "image/png";

const ember = "#e2602a";

export async function pageCard({
  section,
  title,
  description,
  footer,
  art,
}: {
  /** The pill beside the logo, such as "Blog". */
  section: string;
  title: string;
  description?: string;
  /** The line along the bottom. */
  footer: string;
  art?: ArtName;
}) {
  const [youngSerif, inter, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/YoungSerif-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Regular.ttf")),
    readFile(join(process.cwd(), "public/logo.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  const long = title.length > (art ? 44 : 30);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#ffffff",
          backgroundImage:
            "radial-gradient(circle at 100% 100%, rgba(244, 114, 94, 0.34), rgba(255, 196, 140, 0.2) 38%, rgba(255, 255, 255, 0) 68%)",
          color: "#161412",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
          <img src={logoSrc} width={64} height={64} alt="" />
          <div style={{ fontFamily: "Young Serif", fontSize: 50, letterSpacing: -1 }}>Plotra</div>
          <div
            style={{
              display: "flex",
              marginLeft: 6,
              padding: "8px 20px",
              borderRadius: 999,
              border: `2px solid ${ember}`,
              color: ember,
              fontSize: 26,
            }}
          >
            {section}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div
              style={{
                fontFamily: "Young Serif",
                fontSize: art ? (long ? 52 : 62) : long ? 68 : 84,
                lineHeight: 1.04,
                letterSpacing: art ? -1.5 : -2.5,
              }}
            >
              {title}
            </div>
            {description && !art && (
              <div style={{ display: "block", marginTop: 28, fontSize: 29, lineHeight: 1.35, color: "#5e5a54", lineClamp: 3 }}>
                {description}
              </div>
            )}
          </div>
          {art && (
            <div
              style={{
                display: "flex",
                width: 464,
                height: 261,
                borderRadius: 24,
                overflow: "hidden",
                border: "2px solid rgba(22, 20, 18, 0.1)",
                boxShadow: "0 24px 48px -24px rgba(22, 20, 18, 0.35)",
              }}
            >
              {blogArt(art, { width: 464, height: 261 })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#5e5a54" }}>{footer}</div>
      </div>
    ),
    {
      ...cardSize,
      fonts: [
        { name: "Young Serif", data: youngSerif, style: "normal", weight: 400 },
        { name: "Inter", data: inter, style: "normal", weight: 400 },
      ],
    },
  );
}
