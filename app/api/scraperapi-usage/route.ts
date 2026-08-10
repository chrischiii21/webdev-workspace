import { getScraperApiUsage } from "@/lib/scraperApi";

export async function GET() {
  try {
    const usage = await getScraperApiUsage();
    return Response.json(usage);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch ScraperAPI usage.";
    return Response.json({ error: message }, { status: 502 });
  }
}
