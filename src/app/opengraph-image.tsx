import { ImageResponse } from "next/og";

import { HEART_PATH } from "@/components/brand/heart-path";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SCALE = 3.4; // the heart lives in a 48 × 44 box

/** The split-heart mark for the share image: two clipped halves (rose + lilac), like the site logo. */
function Mark() {
  const w = 48 * SCALE;
  const h = 44 * SCALE;
  const heart = (fill: string, offsetX: number) => (
    <svg width={w} height={h} viewBox="0 0 48 44" style={{ position: "absolute", left: -offsetX, top: 0 }}>
      <path d={HEART_PATH} fill={fill} />
    </svg>
  );
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 23.1 * SCALE, height: h, overflow: "hidden" }}>
        {heart("#ff7aa8", 0)}
      </div>
      <div style={{ display: "flex", position: "absolute", left: 24.9 * SCALE, top: 0, width: 23.1 * SCALE, height: h, overflow: "hidden" }}>
        {heart("#b58ad1", 24.9 * SCALE)}
      </div>
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#150c1b",
          backgroundImage:
            "radial-gradient(circle at 50% 0%, rgba(255,178,122,0.28), transparent 60%), radial-gradient(circle at 15% 95%, rgba(255,122,168,0.16), transparent 55%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 34 }}>
          <Mark />
          <span style={{ fontSize: 64, fontWeight: 700, color: "#f8eef1", letterSpacing: -1.5 }}>SoulSync</span>
        </div>
        <span
          style={{
            fontSize: 60,
            fontWeight: 700,
            color: "#f8eef1",
            textAlign: "center",
            maxWidth: 900,
            lineHeight: 1.15,
            letterSpacing: -1.5,
          }}
        >
          Start with who you are
        </span>
      </div>
    ),
    { ...size },
  );
}
