import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path via __dirname at runtime, which
  // breaks if Next bundles it; keep it (and fluent-ffmpeg) unbundled.
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
};

export default nextConfig;
