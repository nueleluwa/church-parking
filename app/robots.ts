import type { MetadataRoute } from "next";

/** Search engines may list the home page and the car park pages, and nothing the team or members use. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/staff", "/admin", "/account", "/p/"] }],
  };
}
