import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          backgroundColor: "#050816",
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,77,141,0.35), transparent 55%), radial-gradient(circle at 80% 30%, rgba(124,58,237,0.4), transparent 55%), radial-gradient(circle at 50% 90%, rgba(34,211,238,0.25), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "linear-gradient(135deg, #FF4D8D, #7C3AED)",
            }}
          />
          <span
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: "white",
              letterSpacing: -1,
            }}
          >
            SoulSync AI
          </span>
        </div>
        <span
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "white",
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
