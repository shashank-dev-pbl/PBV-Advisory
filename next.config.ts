import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The LinkedIn extension calls fixed paths (/api/queue, /api/activity). They are answered by the outreach routes.
  async rewrites() {
    return [
      { source: "/api/queue", destination: "/api/outreach/queue" },
      { source: "/api/queue/:id", destination: "/api/outreach/queue/:id" },
      { source: "/api/activity", destination: "/api/outreach/activity" },
      { source: "/api/activity/create-record", destination: "/api/outreach/activity/create-record" },
    ];
  },
};

export default nextConfig;
