import { NextResponse } from "next/server";

export const dynamic = "force-static";

/**
 * The parking team's own installable app: "Church Parking Team", which opens on /staff. Drivers' app
 * (the one at /) is separate, so the team's phone shows two different icons and each opens in its own place.
 */
export function GET() {
  return NextResponse.json(
    {
      name: "Church Parking Team",
      short_name: "Parking Team",
      description: "For the church parking team: scan passes, release cars and see what is happening.",
      id: "/staff",
      start_url: "/staff",
      scope: "/",
      display: "standalone",
      background_color: "#f6f3ef",
      theme_color: "#141414",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
