import sharp from "sharp";

const MAX_WIDTH = 1600;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Not an image file." }, { status: 400 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const filename = `${file.name.replace(/\.[a-zA-Z0-9]+$/, "")}.avif`;

  try {
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
    const message = err instanceof Error ? err.message : "Failed to convert image.";
    return Response.json({ error: message }, { status: 502 });
  }
}
