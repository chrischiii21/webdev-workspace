import { chromium, type Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export async function fetchHtmlViaBrowser(url: string, timeoutMs = 20_000): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    locale: "en-US",
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const status = response?.status() ?? 0;
    if (status >= 400) {
      throw new Error(
        `${new URL(url).hostname} still blocked the request in a real browser (HTTP ${status}). This looks like network/IP-level blocking rather than a fingerprint check, which a headless browser can't get around.`
      );
    }
    return await page.content();
  } finally {
    await context.close();
  }
}

export async function fetchBinaryViaBrowser(url: string, timeoutMs = 20_000): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    locale: "en-US",
  });
  try {
    const response = await context.request.get(url, { timeout: timeoutMs });
    if (!response.ok()) {
      throw new Error(`${new URL(url).hostname} still blocked the request in a real browser (HTTP ${response.status()}).`);
    }
    return await response.body();
  } finally {
    await context.close();
  }
}
