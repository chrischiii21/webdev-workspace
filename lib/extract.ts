import * as cheerio from "cheerio";
import { Vibrant } from "node-vibrant/node";
import sharp from "sharp";
import { fetchHtmlViaBrowser, fetchBinaryViaBrowser } from "./browserFetch";
import { fetchHtmlViaScraperApi, fetchBinaryViaScraperApi } from "./scraperApi";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const BROWSER_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export interface ExtractedImage {
  url: string;
  kind: "logo" | "icon" | "og" | "img" | "bg";
}

export interface ColorSwatch {
  hex: string;
  role: string;
  weight: number;
}

export interface ExtractResult {
  siteUrl: string;
  siteTitle: string;
  colors: ColorSwatch[];
  images: ExtractedImage[];
}

class BlockedError extends Error {}

function resolveUrl(src: string, base: string): string | null {
  try {
    const u = new URL(src, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (res.status === 403 || res.status === 429) {
      throw new BlockedError(`${new URL(url).hostname} returned HTTP ${res.status}.`);
    }
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out fetching ${url} after ${timeoutMs / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractImages($: cheerio.CheerioAPI, baseUrl: string): ExtractedImage[] {
  const found: ExtractedImage[] = [];
  const seen = new Set<string>();

  const push = (src: string | undefined, kind: ExtractedImage["kind"]) => {
    if (!src || src.startsWith("data:")) return;
    const abs = resolveUrl(src, baseUrl);
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    found.push({ url: abs, kind });
  };

  push($('meta[property="og:image"]').attr("content"), "og");
  $('link[rel~="icon"]').each((_, el) => push($(el).attr("href"), "icon"));
  $('link[rel="apple-touch-icon"]').each((_, el) =>
    push($(el).attr("href"), "icon")
  );
  // Scoped to header/nav: a bare `img[class*="logo"]` selector also matches
  // "trusted by" customer-logo grids elsewhere on the page, which would get
  // treated as the site's own brand mark otherwise.
  $(
    'header img[class*="logo" i], header img[id*="logo" i], header img[alt*="logo" i], nav img[class*="logo" i], nav img[id*="logo" i], nav img[alt*="logo" i]'
  ).each((_, el) => push($(el).attr("src"), "logo"));
  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    push(src, "img");
  });

  return found.slice(0, 30);
}

const HEX_RE = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi;

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return hex.toLowerCase();
}

function isGrayscaleOrExtreme(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const isGray = max - min < 20; // low saturation -> neutral UI color, not a brand color
  const isNearWhite = max > 245;
  const isNearBlack = max < 20;
  return isGray || isNearWhite || isNearBlack;
}

// Combined text of the page's inline HTML/<style> content plus its linked
// stylesheets, used as the single source for both color-frequency mining and
// CSS background-image discovery (hero/section backgrounds are almost always
// `background-image: url(...)` in a stylesheet, never an <img> tag).
async function collectCssText($: cheerio.CheerioAPI, html: string, baseUrl: string): Promise<string> {
  const sheetHrefs = $('link[rel="stylesheet"]')
    .map((_, el) => $(el).attr("href"))
    .get()
    .map((href) => resolveUrl(href ?? "", baseUrl))
    .filter((u): u is string => !!u)
    .slice(0, 5);

  const sheets = await Promise.allSettled(sheetHrefs.map((u) => fetchText(u, 6000)));
  const sheetText = sheets
    .filter((s): s is PromiseFulfilledResult<string> => s.status === "fulfilled")
    .map((s) => s.value)
    .join("\n");

  return `${html}\n${sheetText}`;
}

function extractCssColorFrequency(cssText: string): Map<string, number> {
  const freq = new Map<string, number>();
  const tally = (hex: string) => {
    const norm = normalizeHex(hex);
    freq.set(norm, (freq.get(norm) ?? 0) + 1);
  };
  for (const m of cssText.matchAll(HEX_RE)) tally(m[0]);
  for (const m of cssText.matchAll(RGB_RE)) {
    tally(toHex(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  return freq;
}

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
// No svg: background SVGs in the wild are almost always icon-font sprites
// (referenced with a `#symbol-name` fragment) or decorative patterns, not photos.
const IMAGE_EXT_RE = /\.(webp|jpe?g|png|gif|avif)(\?|$)/i;

function extractCssBackgroundImages(cssText: string, baseUrl: string): ExtractedImage[] {
  const found: ExtractedImage[] = [];
  const seen = new Set<string>();
  for (const m of cssText.matchAll(CSS_URL_RE)) {
    const src = m[2];
    if (!src || src.startsWith("data:") || !IMAGE_EXT_RE.test(src)) continue;
    const abs = resolveUrl(src, baseUrl);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    found.push({ url: abs, kind: "bg" });
  }
  return found;
}

async function fetchImageBuffer(url: string, timeoutMs = 10_000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// Mirrors fetchSiteHtml's escalation: plain fetch, then a real browser, then a
// residential-proxy API. Some WAFs (e.g. SiteGround's captcha layer) respond
// with a 200/202 HTML challenge page instead of a 403, so status codes alone
// aren't a reliable "blocked" signal here -- each tier is validated by actually
// trying to decode the bytes as an image, and only escalates on decode failure.
export async function fetchImageBufferWithFallback(url: string): Promise<Buffer> {
  const tiers: Array<() => Promise<Buffer>> = [() => fetchImageBuffer(url), () => fetchBinaryViaBrowser(url)];
  if (process.env.SCRAPERAPI_KEY) tiers.push(() => fetchBinaryViaScraperApi(url));

  let lastErr: unknown;
  for (const tier of tiers) {
    try {
      const buf = await tier();
      await sharp(buf).metadata();
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Could not fetch a valid image from ${url}.`);
}

// A plain client-side HEAD request to the source origin routinely fails with
// net::ERR_FAILED (CORS / WAF), so original file size is fetched through this
// server-side helper instead. HEAD is tried first (cheap); if the origin
// doesn't answer it, fall back to the same resilient fetch chain used for
// downloads and just report the byte length.
export async function fetchImageSize(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "HEAD", headers: BROWSER_HEADERS });
    const len = res.headers.get("content-length");
    const type = res.headers.get("content-type") ?? "";
    // status 200 + image content-type only -- WAF challenge pages often answer
    // HEAD with a 202 (or a 200 HTML page) plus their own tiny content-length.
    if (res.status === 200 && len && type.startsWith("image/")) return Number(len);
  } catch {
    // fall through to the resilient fetch chain below
  }
  const buf = await fetchImageBufferWithFallback(url);
  return buf.length;
}

async function extractLogoPalette(images: ExtractedImage[]): Promise<ColorSwatch[]> {
  // Logo/icon images are frequently WebP or AVIF, which node-vibrant's bundled
  // Jimp decoder can't read. Decode with sharp (broad format support) and hand
  // it a plain PNG buffer instead of letting Vibrant fetch+decode the URL itself.
  const candidates = [
    ...images.filter((i) => i.kind === "logo"),
    ...images.filter((i) => i.kind === "icon"),
    ...images.filter((i) => i.kind === "og"),
  ].slice(0, 4);

  for (const candidate of candidates) {
    try {
      const raw = await fetchImageBufferWithFallback(candidate.url);
      const png = await sharp(raw).flatten({ background: "#ffffff" }).png().toBuffer();
      const palette = await Vibrant.from(png).getPalette();
      const swatches: ColorSwatch[] = [];
      for (const [name, swatch] of Object.entries(palette)) {
        if (!swatch) continue;
        swatches.push({ hex: swatch.hex, role: `logo-${name}`, weight: swatch.population });
      }
      if (swatches.length > 0) return swatches;
    } catch (err) {
      if (process.env.DEBUG_EXTRACT) console.log(`[debug] logo candidate failed: ${candidate.url}`, err);
    }
  }
  return [];
}

// Some WAFs "soft block" with an HTTP 200 and a near-empty interstitial page
// instead of a 403, which the status-code checks above don't catch. Treat a
// suspiciously small page as blocked too so it still escalates to the next tier.
function looksBlockedOrEmpty(html: string): boolean {
  return html.trim().length < 500;
}

async function fetchSiteHtml(siteUrl: string): Promise<string> {
  try {
    const html = await fetchText(siteUrl);
    if (!looksBlockedOrEmpty(html)) return html;
  } catch (err) {
    if (!(err instanceof BlockedError)) throw err;
  }

  try {
    const html = await fetchHtmlViaBrowser(siteUrl);
    if (looksBlockedOrEmpty(html)) {
      throw new Error(`${new URL(siteUrl).hostname} returned an empty page even through a real browser.`);
    }
    return html;
  } catch (err) {
    if (!process.env.SCRAPERAPI_KEY) throw err;
    const html = await fetchHtmlViaScraperApi(siteUrl);
    if (looksBlockedOrEmpty(html)) {
      throw new Error(`${new URL(siteUrl).hostname} returned an empty page through every available fallback.`);
    }
    return html;
  }
}

export async function extractBranding(siteUrl: string): Promise<ExtractResult> {
  const html = await fetchSiteHtml(siteUrl);
  const $ = cheerio.load(html);
  const baseUrl = siteUrl;

  const siteTitle = $("title").first().text().trim() || new URL(siteUrl).hostname;
  const cssText = await collectCssText($, html, baseUrl);

  const allImages = [...extractImages($, baseUrl), ...extractCssBackgroundImages(cssText, baseUrl)];
  const seenUrls = new Set<string>();
  const images: ExtractedImage[] = [];
  for (const img of allImages) {
    if (seenUrls.has(img.url) || images.length >= 40) continue;
    seenUrls.add(img.url);
    images.push(img);
  }
  const cssFreq = extractCssColorFrequency(cssText);
  const logoSwatches = await extractLogoPalette(images);

  // CSS-frequency colors are the literal hex values the site actually deploys
  // (buttons, links, headings) -- an exact match, not an approximation -- so
  // they lead the palette. Logo colors are pixel samples from a resized/
  // recompressed image (webp/svg rasterization, resampling) and only
  // approximate the true brand hex, so they just fill any remaining slots
  // the CSS scan didn't cover.
  const rankedCssColors = [...cssFreq.entries()]
    .filter(([hex]) => !isGrayscaleOrExtreme(hex))
    .sort((a, b) => b[1] - a[1]);

  const rankedLogoSwatches = logoSwatches
    .filter((s) => !isGrayscaleOrExtreme(s.hex))
    .sort((a, b) => b.weight - a.weight);

  const seen = new Set<string>();
  const combined: ColorSwatch[] = [];
  const addColor = (hex: string, weight: number) => {
    if (seen.has(hex) || combined.length >= 8) return;
    seen.add(hex);
    const role = combined.length === 0 ? "primary" : combined.length === 1 ? "secondary" : "accent";
    combined.push({ hex, role, weight });
  };

  for (const [hex, count] of rankedCssColors) addColor(hex, count);
  for (const s of rankedLogoSwatches) addColor(s.hex, s.weight);

  return { siteUrl, siteTitle, colors: combined, images };
}
