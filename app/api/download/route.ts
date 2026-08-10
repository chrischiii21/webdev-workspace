import sharp from "sharp";
import { fetchImageBufferWithFallback } from "@/lib/extract";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");
  const filename = searchParams.get("name") || "image.avif";

  if (!imageUrl) {
    return Response.json({ error: "Missing url." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return Response.json({ error: "Invalid url." }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return Response.json({ error: "Invalid protocol." }, { status: 400 });
  }

  const MAX_WIDTH = 1600;

  try {
    const raw = await fetchImageBufferWithFallback(imageUrl);
    const pipeline = sharp(raw).rotate();
    const meta = await pipeline.metadata();
    if (meta.width && meta.width > MAX_WIDTH) pipeline.resize({ width: MAX_WIDTH });
    const avif = await pipeline.avif({ quality: 65, effort: 9 }).toBuffer();
    return new Response(new Uint8Array(avif), {
      headers: {
        "Content-Type": "image/avif",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "X-Original-Size": String(raw.length),
        "X-Optimized-Size": String(avif.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch or convert image.";
    return Response.json({ error: message }, { status: 502 });
  }
}
