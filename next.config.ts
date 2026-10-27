import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A page visited a moment ago opens from the browser's cache; saving anything refreshes it.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
};

export default nextConfig;
