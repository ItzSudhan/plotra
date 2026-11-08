// Draws the repository's social preview (GitHub → Settings → Social preview),
// 1280 × 640, in the same faces and colours as the site's link card
// (app/opengraph-image.tsx). Run from apps/web:
//   bun scripts/social-preview.tsx
// It writes public/press/plotra-social-preview.png.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";

/* eslint-disable @next/next/no-img-element -- drawn into an image, not a page */

const ember = "#e2602a";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const [youngSerif, inter, logo, editor, graph] = await Promise.all([
  readFile(join(root, "assets/fonts/YoungSerif-Regular.ttf")),
  readFile(join(root, "assets/fonts/Inter-Regular.ttf")),
  readFile(join(root, "public/logo.png")),
  readFile(join(root, "public/press/plotra-editor.png")),
  readFile(join(root, "public/press/plotra-graph.png")),
]);
const src = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

/** Both screenshots are 2000 × 1250. */
const shot = { width: 2000, height: 1250 };

/** A window showing one region of a screenshot, zoomed so its text stays readable at thumbnail size. */
function Crop({
  png,
  region,
  scale,
  style,
}: {
  png: Buffer;
  region: { x: number; y: number; width: number; height: number };
  scale: number;
  style: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        width: region.width * scale,
        height: region.height * scale,
        overflow: "hidden",
        borderRadius: 18,
        border: "1.5px solid rgba(22, 20, 18, 0.12)",
        backgroundColor: "#f7f5f1",
        boxShadow: "0 30px 60px -20px rgba(80, 40, 20, 0.35), 0 8px 16px -8px rgba(22, 20, 18, 0.15)",
        ...style,
      }}
    >
      <img
        src={src(png)}
        width={shot.width * scale}
        height={shot.height * scale}
        alt=""
        style={{ position: "absolute", left: -region.x * scale, top: -region.y * scale }}
      />
    </div>
  );
}

const pill = (label: string) => (
  <div
    style={{
      display: "flex",
      padding: "8px 18px",
      borderRadius: 999,
      border: "1.5px solid rgba(22, 20, 18, 0.14)",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      fontSize: 20,
      color: "#3d3934",
    }}
  >
    {label}
  </div>
);

const image = new ImageResponse(
  (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: "#fbf8f4",
        backgroundImage:
          "radial-gradient(circle at 92% 88%, rgba(244, 114, 94, 0.42), rgba(255, 196, 140, 0.24) 34%, rgba(251, 248, 244, 0) 62%), radial-gradient(circle at 0% 0%, rgba(255, 214, 170, 0.35), rgba(251, 248, 244, 0) 40%)",
        color: "#161412",
        fontFamily: "Inter",
        overflow: "hidden",
      }}
    >
      <Crop
        png={graph}
        region={{ x: 560, y: 150, width: 1020, height: 800 }}
        scale={0.5}
        style={{ left: 760, top: 44, transform: "rotate(3deg)" }}
      />
      <Crop
        png={editor}
        region={{ x: 545, y: 140, width: 900, height: 470 }}
        scale={0.62}
        style={{ left: 640, top: 280, transform: "rotate(-2deg)" }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 640,
          height: "100%",
          padding: "60px 0 56px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={src(logo)} width={60} height={60} alt="" />
          <div style={{ fontFamily: "Young Serif", fontSize: 46, letterSpacing: -1 }}>Plotra</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Young Serif",
              fontSize: 60,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            <div style={{ display: "flex" }}>
              Write your<span style={{ marginLeft: 16, color: ember }}>novel</span>
            </div>
            <div style={{ display: "flex" }}>
              and build its<span style={{ marginLeft: 16, color: ember }}>world</span>
            </div>
            <div style={{ display: "flex" }}>in one place.</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 30, width: 560 }}>
            {pill("Open source")}
            {pill("Live co-writing")}
            {pill("Self-hostable")}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 22, color: "#5e5a54" }}>plotra.ink</div>
      </div>
    </div>
  ),
  {
    width: 1280,
    height: 640,
    fonts: [
      { name: "Young Serif", data: youngSerif, style: "normal", weight: 400 },
      { name: "Inter", data: inter, style: "normal", weight: 400 },
    ],
  },
);

const out = join(root, "public/press/plotra-social-preview.png");
await writeFile(out, Buffer.from(await image.arrayBuffer()));
console.log(`Wrote ${out}`);
