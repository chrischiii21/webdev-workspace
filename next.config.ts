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
  // serverExternalPackages only keeps these out of the JS bundle -- it
  // doesn't make Vercel's output tracer pick up files these packages read
  // at runtime via fs (playwright-core's browsers.json, @sparticuz/chromium's
  // bundled Chromium archive), which every browser-fallback route needs.
  outputFileTracingIncludes: {
    "/api/extract": ["./node_modules/playwright-core/**/*", "./node_modules/@sparticuz/chromium/**/*"],
    "/api/download": ["./node_modules/playwright-core/**/*", "./node_modules/@sparticuz/chromium/**/*"],
    "/api/size": ["./node_modules/playwright-core/**/*", "./node_modules/@sparticuz/chromium/**/*"],
    "/api/image": ["./node_modules/playwright-core/**/*", "./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
