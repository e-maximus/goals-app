import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/about", "/privacy", "/terms"];

  return routes.map((route) => ({
    url: new URL(route, SITE_URL).toString(),
  }));
}
