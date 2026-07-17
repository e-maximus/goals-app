import { ImageResponse } from "next/og";

export const alt = "Keep Going — break big goals into small steps";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card for keepgoing.you: the motto over the app's green, with a
// stylized progress bar as the one visual. Colors are hex approximations of the
// theme's oklch values (globals.css) — satori doesn't parse oklch().
export default function Image() {
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
          gap: 28,
          background: "linear-gradient(160deg, #16211a 0%, #1e3327 100%)",
          color: "#f4f7f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>Keep going.</div>
        <div style={{ fontSize: 36, color: "#9db5a6" }}>
          Every big goal is just a long line of small steps.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            width: 560,
            height: 16,
            borderRadius: 8,
            background: "#31463a",
          }}
        >
          <div
            style={{
              width: "70%",
              height: "100%",
              borderRadius: 8,
              background: "#3fae6e",
            }}
          />
        </div>
        <div style={{ fontSize: 28, color: "#6f8579", marginTop: 8 }}>keepgoing.you</div>
      </div>
    ),
    size
  );
}
