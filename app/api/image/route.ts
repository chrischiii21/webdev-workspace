import sharp from "sharp";
import { fetchImageBufferWithFallback } from "@/lib/extract";

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  tiff: "image/tiff",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");
  if (!imageUrl) {
    return Response.json({ error: "Missing url." }, { status: 400 });
  }

  try {
    const buf = await fetchImageBufferWithFallback(imageUrl);
    const { format } = await sharp(buf).metadata();
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": (format && MIME_BY_FORMAT[format]) ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch image.";
    return Response.json({ error: message }, { status: 502 });
  }
}
