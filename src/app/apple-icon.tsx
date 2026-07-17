import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: the app's green with a white "K" and a progress notch.
// Hex approximations of the theme's oklch values — satori doesn't parse oklch().
export default function Icon() {
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
          gap: 10,
          background: "linear-gradient(160deg, #3fae6e 0%, #2c8a53 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1 }}>K</div>
        <div
          style={{
            display: "flex",
            width: 88,
            height: 10,
            borderRadius: 5,
            background: "rgba(255,255,255,0.35)",
          }}
        >
          <div
            style={{
              width: "70%",
              height: "100%",
              borderRadius: 5,
              background: "#ffffff",
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
