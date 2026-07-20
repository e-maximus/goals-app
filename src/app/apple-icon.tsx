import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The same two footprints as icon.svg, inlined as a data URI: satori renders
// <img>, not raw <svg> children.
const footprints = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><g fill="#ffffff">` +
    `<g transform="translate(23 44) rotate(-16)"><ellipse cx="0" cy="2" rx="6.4" ry="9"/><circle cx="-4.6" cy="-9.4" r="2.5"/><circle cx="0.6" cy="-11.2" r="2.3"/><circle cx="5.4" cy="-9.6" r="2"/></g>` +
    `<g transform="translate(41 26) rotate(16) scale(-1 1)"><ellipse cx="0" cy="2" rx="6.4" ry="9"/><circle cx="-4.6" cy="-9.4" r="2.5"/><circle cx="0.6" cy="-11.2" r="2.3"/><circle cx="5.4" cy="-9.6" r="2"/></g>` +
    `</g></svg>`
)}`;

// Home-screen icon: the app's green with the white footprints and a progress
// notch. Hex approximations of the theme's oklch values — satori doesn't parse
// oklch().
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
        <img src={footprints} alt="" width={104} height={104} />
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
