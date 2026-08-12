import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static and youtube-dl-exec resolve their binary paths via
  // __dirname at runtime, which breaks if Next bundles them; keep them
  // (and fluent-ffmpeg) unbundled.
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg", "youtube-dl-exec"],
};

export default nextConfig;
