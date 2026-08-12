import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static, youtube-dl-exec, playwright-core, and @sparticuz/chromium
  // all resolve binary/data paths via __dirname at runtime, which breaks if
  // Next bundles them; keep them (and fluent-ffmpeg) unbundled.
  serverExternalPackages: [
    "ffmpeg-static",
    "fluent-ffmpeg",
    "youtube-dl-exec",
    "playwright-core",
    "@sparticuz/chromium",
  ],
};

export default nextConfig;
