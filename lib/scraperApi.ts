const SCRAPERAPI_BASE = "https://api.scraperapi.com";

async function scraperApiFetch(url: string, timeoutMs: number): Promise<Response> {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) {
    throw new Error("SCRAPERAPI_KEY is not configured on the server.");
  }

  const proxyUrl = `${SCRAPERAPI_BASE}?api_key=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(proxyUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`ScraperAPI request failed (${res.status}) fetching ${url}.`);
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`ScraperAPI timed out fetching ${url} after ${timeoutMs / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHtmlViaScraperApi(url: string, timeoutMs = 30_000): Promise<string> {
  const res = await scraperApiFetch(url, timeoutMs);
  return await res.text();
}

export async function fetchBinaryViaScraperApi(url: string, timeoutMs = 30_000): Promise<Buffer> {
  const res = await scraperApiFetch(url, timeoutMs);
  return Buffer.from(await res.arrayBuffer());
}

export interface ScraperApiUsage {
  requestCount: number;
  requestLimit: number;
  failedRequestCount: number;
}

// ScraperAPI's own account endpoint is the source of truth for credit usage
// (it already tracks billing-cycle resets, render-cost weighting, etc.) --
// no need to approximate it with our own counter.
export async function getScraperApiUsage(): Promise<ScraperApiUsage | null> {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) return null;

  const res = await fetch(`${SCRAPERAPI_BASE}/account?api_key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`ScraperAPI account lookup failed (${res.status}).`);
  const data = await res.json();
  return {
    requestCount: data.requestCount,
    requestLimit: data.requestLimit,
    failedRequestCount: data.failedRequestCount,
  };
}
