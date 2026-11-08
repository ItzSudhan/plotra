import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { siteTagline } from "@/lib/site";

// The card a link to the site unfurls into: the logo, the promise, and the
// free plan. It is drawn at build time, in the site's own faces and colours.

export const alt = `Plotra. ${siteTagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ember = "#e2602a";

export default async function Image() {
  const [youngSerif, inter, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/YoungSerif-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Regular.ttf")),
    readFile(join(process.cwd(), "public/logo.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

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
          <img src={logoSrc} width={64} height={64} alt="" />
          <div style={{ fontFamily: "Young Serif", fontSize: 50, letterSpacing: -1 }}>Plotra</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontFamily: "Young Serif",
              fontSize: 84,
              lineHeight: 1,
              letterSpacing: -2.5,
            }}
          >
            <span style={{ marginRight: 22 }}>Write your</span>
            <span style={{ marginRight: 22, color: ember }}>novel</span>
            <span style={{ marginRight: 22 }}>and build</span>
            <span style={{ marginRight: 22 }}>its</span>
            <span style={{ marginRight: 22, color: ember }}>world</span>
            <span>in one place.</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 29, color: "#5e5a54" }}>
            Everything stays linked. Co-writers join you live. Canon stays straight.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              padding: "16px 34px",
              borderRadius: 999,
              backgroundColor: "#161412",
              color: "#ffffff",
              fontSize: 26,
            }}
          >
            Start writing for free
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Young Serif", data: youngSerif, style: "normal", weight: 400 },
        { name: "Inter", data: inter, style: "normal", weight: 400 },
      ],
    },
  );
}
