import { fetchImageSize } from "@/lib/extract";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");
  if (!imageUrl) {
    return Response.json({ error: "Missing url." }, { status: 400 });
  }

  try {
    const size = await fetchImageSize(imageUrl);
    return Response.json({ size });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get image size.";
    return Response.json({ error: message }, { status: 502 });
  }
}
