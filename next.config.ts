import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only "N" badge sits on top of the first tab in the staff tab bar, so keep it off the screen.
  devIndicators: false,
  async headers() {
    return [
      {
        // Pass links hold a secret token: never send them on as a referrer, never cache them.
        source: "/p/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
