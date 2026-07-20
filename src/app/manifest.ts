import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keep Going",
    short_name: "Keep Going",
    description: "Break big goals into small steps, and make progress one step at a time.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8faf9",
    theme_color: "#3fae6e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
