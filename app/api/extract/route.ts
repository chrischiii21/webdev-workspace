import { extractBranding } from "@/lib/extract";

export async function POST(request: Request) {
  const { url } = await request.json();

  if (typeof url !== "string" || url.trim().length === 0) {
    return Response.json({ error: "A website URL is required." }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = new URL(url.startsWith("http") ? url : `https://${url}`).toString();
  } catch {
    return Response.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  try {
    const result = await extractBranding(normalized);
    return Response.json(result);
  } catch (err) {
    console.error(`[extract] ${normalized}:`, err);
    const message = err instanceof Error ? err.message : "Failed to extract branding.";
    return Response.json({ error: message }, { status: 502 });
  }
}
