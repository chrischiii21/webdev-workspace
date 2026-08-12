"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMasterPrompt, type PromptMode } from "@/lib/prompt";

interface ColorSwatch {
  hex: string;
  role: string;
  weight: number;
}

interface ExtractedImage {
  url: string;
  kind: string;
}

interface ExtractResult {
  siteUrl: string;
  siteTitle: string;
  colors: ColorSwatch[];
  images: ExtractedImage[];
}

interface Preview {
  imageUrl: string;
  filename: string;
  blobUrl: string | null;
  originalSize: number | null;
  optimizedSize: number | null;
}

function avifFilename(originalUrl: string): string {
  const clean = originalUrl.split("?")[0].split("#")[0];
  const base = clean.split("/").pop() || "image";
  return `${base.replace(/\.[a-zA-Z0-9]+$/, "")}.avif`;
}

function formatOf(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop()?.toUpperCase() ?? "";
  if (
    ["JPG", "JPEG", "PNG", "SVG", "WEBP", "GIF", "ICO", "AVIF"].includes(ext)
  ) {
    return ext === "JPEG" ? "JPG" : ext;
  }
  return "IMG";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [originalSizes, setOriginalSizes] = useState<Record<string, number>>(
    {},
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<string | null>(null);
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>(
    {},
  );
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [promptMode, setPromptMode] = useState<PromptMode>("both");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [scraperUsage, setScraperUsage] = useState<{
    requestCount: number;
    requestLimit: number;
  } | null>(null);

  // ScraperAPI is only the last-resort fetch tier, but its account endpoint
  // is the authoritative source for credit usage -- pull it once on load
  // instead of approximating with our own counter.
  useEffect(() => {
    fetch("/api/scraperapi-usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.requestLimit) setScraperUsage(data);
      })
      .catch(() => {});
  }, []);

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveKind(null);
    setDims({});
    setOriginalSizes({});
    setLoadedImages(new Set());
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Lost connection to the server mid-request. Please try again.");
      }
      if (!res.ok) throw new Error(data.error ?? "Extraction failed.");
      setResult(data);
      setSelected(new Set(data.images.map((i: ExtractedImage) => i.url)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Original file size, via our own server (a direct cross-origin HEAD from
  // the browser routinely fails with net::ERR_FAILED against WAF-protected
  // sites, so the source is queried server-side instead).
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    for (const img of result.images) {
      fetch(`/api/size?url=${encodeURIComponent(img.url)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data.size) return;
          setOriginalSizes((prev) => ({
            ...prev,
            [img.url]: Number(data.size),
          }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [result]);

  function toggleImage(imgUrl: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(imgUrl)) next.delete(imgUrl);
      else next.add(imgUrl);
      return next;
    });
  }

  const visibleImages = useMemo(() => {
    if (!result) return [];
    return activeKind
      ? result.images.filter((i) => i.kind === activeKind)
      : result.images;
  }, [result, activeKind]);

  const kindCounts = useMemo(() => {
    if (!result) return [];
    const counts = new Map<string, number>();
    for (const img of result.images)
      counts.set(img.kind, (counts.get(img.kind) ?? 0) + 1);
    return [...counts.entries()];
  }, [result]);

  function selectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const img of visibleImages) next.add(img.url);
      return next;
    });
  }

  function deselectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const img of visibleImages) next.delete(img.url);
      return next;
    });
  }

  // Opens the preview modal immediately (with a loading state) so there's no
  // dead pause before anything appears, then fills it in once the server-side
  // AVIF conversion finishes. The download itself only happens on confirm.
  async function openPreview(imageUrl: string) {
    const filename = avifFilename(imageUrl);
    setError(null);
    setPreview({
      imageUrl,
      filename,
      blobUrl: null,
      originalSize: null,
      optimizedSize: null,
    });
    try {
      const res = await fetch(
        `/api/download?url=${encodeURIComponent(imageUrl)}&name=${encodeURIComponent(filename)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Conversion failed.");
      }
      const originalSize = Number(res.headers.get("X-Original-Size"));
      const optimizedSize = Number(res.headers.get("X-Optimized-Size"));
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setPreview((prev) =>
        prev?.imageUrl === imageUrl
          ? { ...prev, blobUrl, originalSize, optimizedSize }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
      setPreview((prev) => (prev?.imageUrl === imageUrl ? null : prev));
    }
  }

  function closePreview() {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
    setPreview(null);
  }

  function confirmDownload() {
    if (!preview?.blobUrl) return;
    const a = document.createElement("a");
    a.href = preview.blobUrl;
    a.download = preview.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    closePreview();
  }

  // Converts and downloads every selected image one at a time -- sequential
  // (not Promise.all) so the browser sees spaced-out user-triggered downloads
  // instead of a burst, which Chrome silently blocks past ~5 at once.
  async function downloadSelected() {
    const urls = [...selected];
    if (urls.length === 0) return;
    setBulkDownloading(true);
    setBulkProgress({ done: 0, total: urls.length });
    for (const imageUrl of urls) {
      const filename = avifFilename(imageUrl);
      try {
        const res = await fetch(
          `/api/download?url=${encodeURIComponent(imageUrl)}&name=${encodeURIComponent(filename)}`,
        );
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(blobUrl);
        }
      } catch {
        // keep going -- one failed image shouldn't stop the rest
      }
      setBulkProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }
    setBulkDownloading(false);
  }

  const masterPrompt = useMemo(() => {
    if (!result) return "";
    // Points at our own /api/download endpoint (which converts on the fly)
    // rather than the original source URL, so the prompt hands off an
    // already-optimized AVIF image instead of the unoptimized original.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const optimizedUrls = [...selected].map((imageUrl) => {
      const name = avifFilename(imageUrl);
      return `${origin}/api/download?url=${encodeURIComponent(imageUrl)}&name=${encodeURIComponent(name)}`;
    });
    return buildMasterPrompt(
      result.siteUrl,
      result.siteTitle,
      result.colors,
      optimizedUrls,
      true,
      promptMode,
    );
  }, [result, selected, promptMode]);

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
          <div className="flex h-20 w-20 items-center justify-center rounded-sm bg-brand-navy">
            <span className="h-9 w-9 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Extracting brand assets...
          </p>
          <p className="text-xs text-foreground/60">
            Fetching colors and images from {url || "the site"}
          </p>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-4 px-6 clay">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-brand-navy text-sm font-bold text-white">
          B
        </div>
        <div className="shrink-0">
          <p className="text-sm font-semibold text-foreground">
            Brand Extractor
          </p>
          <p className="text-xs text-foreground/60">
            colors + images + AVIF, in one pass
          </p>
        </div>
        <form
          onSubmit={handleExtract}
          className="ml-4 flex flex-1 items-center gap-2"
        >
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            aria-label="Website URL"
            className="w-full flex-1 px-4 py-2.5 text-sm text-foreground outline-none clay-well placeholder:text-foreground/40"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white clay-btn disabled:opacity-50"
          >
            {loading ? "Extracting..." : "Extract"}
          </button>
        </form>
        {scraperUsage && (
          <div
            title="ScraperAPI credits used this billing cycle (last-resort fetch fallback only)"
            className={`ml-2 shrink-0 px-3 py-1.5 text-xs font-medium clay-well ${
              scraperUsage.requestCount / scraperUsage.requestLimit > 0.9
                ? "text-brand-red"
                : scraperUsage.requestCount / scraperUsage.requestLimit > 0.7
                  ? "text-brand-orange"
                  : "text-foreground/60"
            }`}
          >
            ScraperAPI {scraperUsage.requestCount}/{scraperUsage.requestLimit}
          </div>
        )}
      </header>

      {error && (
        <p className="bg-brand-red/10 px-3 py-2 text-xs text-brand-red">
          {error}
        </p>
      )}

      <div className="flex gap-4">
        {result && (
          <aside className="sticky top-[5.5rem] flex h-[calc(100vh-7.5rem)] w-72 shrink-0 flex-col gap-6 overflow-y-auto p-5 clay">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/60">
                Colors
              </p>
              <div className="flex flex-wrap gap-2">
                {result.colors.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => copyText(c.hex, c.hex)}
                    title={`${c.role} · click to copy`}
                    className="group flex flex-col items-center gap-1"
                  >
                    <span
                      className="block h-9 w-9 rounded-sm clay-btn"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="text-[10px] text-foreground/60 group-hover:text-foreground">
                      {copied === c.hex ? "copied" : c.hex}
                    </span>
                  </button>
                ))}
                {result.colors.length === 0 && (
                  <p className="text-xs text-foreground/40">No colors found.</p>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/60">
                Filter by type
              </p>
              <div className="flex flex-wrap gap-2">
                {kindCounts.map(([kind, count]) => (
                  <button
                    key={kind}
                    onClick={() =>
                      setActiveKind((prev) => (prev === kind ? null : kind))
                    }
                    className={`px-3 py-1.5 text-xs font-medium clay-btn ${
                      activeKind === kind
                        ? "bg-brand-magenta text-white"
                        : "text-foreground/70"
                    }`}
                  >
                    {kind} ({count})
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
                  Master Prompt
                </p>
                <button
                  onClick={() => copyText(masterPrompt, "prompt")}
                  className="px-3 py-1 text-xs font-medium text-foreground clay-btn"
                >
                  {copied === "prompt" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="flex gap-1 p-1 clay-well">
                {(["both", "colors", "images"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPromptMode(mode)}
                    className={`flex-1 px-2.5 py-1 text-xs font-medium capitalize ${
                      promptMode === mode
                        ? "bg-brand-navy text-white clay-btn"
                        : "text-foreground/60"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <textarea
                readOnly
                value={masterPrompt}
                className="min-h-[16rem] w-full flex-1 resize-none p-3 font-mono text-xs text-foreground clay-well"
              />
            </div>
          </aside>
        )}

        <main className="flex-1 p-6 clay">
          {!result && (
            <p className="text-sm text-foreground/60">
              Paste a website URL above to pull its brand colors and images.
            </p>
          )}

          {result && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-foreground/70">
                  Showing {visibleImages.length} of {result.images.length}{" "}
                  images from{" "}
                  <span className="font-medium text-foreground">
                    {new URL(result.siteUrl).hostname}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="px-3 py-1.5 text-xs font-medium text-foreground clay-btn"
                  >
                    Select all
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-3 py-1.5 text-xs font-medium text-foreground clay-btn"
                  >
                    Deselect all
                  </button>
                  <button
                    onClick={downloadSelected}
                    disabled={selected.size === 0 || bulkDownloading}
                    className="flex items-center gap-1.5 bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white clay-btn disabled:opacity-50"
                  >
                    <DownloadIcon />
                    {bulkDownloading
                      ? `Downloading ${bulkProgress.done}/${bulkProgress.total}...`
                      : `Download Selected (${selected.size})`}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleImages.map((img) => {
                  const d = dims[img.url];
                  const originalSize = originalSizes[img.url];
                  const loaded = loadedImages.has(img.url);
                  return (
                    <div key={img.url} className="overflow-hidden p-2 clay">
                      <div className="relative flex h-32 items-center justify-center overflow-hidden clay-well">
                        <input
                          type="checkbox"
                          checked={selected.has(img.url)}
                          onChange={() => toggleImage(img.url)}
                          className="absolute left-2 top-2 z-10 h-4 w-4 accent-brand-magenta"
                        />
                        {d && (
                          <span className="absolute right-2 top-2 rounded-sm bg-brand-navy/80 px-2 py-0.5 text-[10px] text-white">
                            {d.w} x {d.h}
                          </span>
                        )}
                        {!loaded && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/15 border-t-foreground/50" />
                          </span>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.kind}
                          className={`h-full w-full object-contain p-3 transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
                          onError={(e) => {
                            const t = e.currentTarget;
                            // Some sites block direct hotlinking (bot-protection challenge
                            // pages instead of the real image); retry once through our
                            // server, which has a resilient fetch fallback chain.
                            if (t.dataset.proxied) {
                              setLoadedImages((prev) =>
                                new Set(prev).add(img.url),
                              );
                              return;
                            }
                            t.dataset.proxied = "1";
                            t.src = `/api/image?url=${encodeURIComponent(img.url)}`;
                          }}
                          onLoad={(e) => {
                            const t = e.currentTarget;
                            setLoadedImages((prev) =>
                              new Set(prev).add(img.url),
                            );
                            if (!t.naturalWidth) return;
                            setDims((prev) => ({
                              ...prev,
                              [img.url]: {
                                w: t.naturalWidth,
                                h: t.naturalHeight,
                              },
                            }));
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 px-1 pt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-sm bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold text-foreground/70">
                            {formatOf(img.url)}
                          </span>
                          <span className="text-[11px] text-foreground/50">
                            {img.kind}
                          </span>
                        </div>
                        {originalSize != null && (
                          <span className="text-[10px] text-foreground/50">
                            {formatBytes(originalSize)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-2">
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noreferrer"
                          title="Open original"
                          className="text-[11px] font-medium text-foreground/60 hover:text-foreground"
                        >
                          open original
                        </a>
                        <button
                          onClick={() => openPreview(img.url)}
                          title="Preview optimized version"
                          className="flex items-center gap-1 bg-brand-orange px-2.5 py-1 text-[11px] font-semibold text-white clay-btn"
                        >
                          <DownloadIcon />
                          Optimize
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closePreview}
        >
          <div
            className="flex w-full max-w-lg flex-col gap-4 p-5 clay"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Preview: {preview.filename}
              </p>
              <button
                onClick={closePreview}
                className="flex h-7 w-7 items-center justify-center text-foreground/60 clay-btn"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="relative flex h-64 items-center justify-center overflow-hidden clay-well">
              {preview.blobUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.blobUrl}
                  alt={preview.filename}
                  className="h-full w-full object-contain p-3"
                />
              ) : (
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/15 border-t-foreground/50" />
              )}
            </div>
            <p className="bg-foreground/5 px-3 py-2 text-center text-xs font-medium text-foreground/70">
              {preview.originalSize != null && preview.optimizedSize != null ? (
                <>
                  {formatBytes(preview.originalSize)} →{" "}
                  {formatBytes(preview.optimizedSize)} (-
                  {Math.round(
                    (1 - preview.optimizedSize / preview.originalSize) * 100,
                  )}
                  %)
                </>
              ) : (
                "Optimizing..."
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={closePreview}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-foreground clay-btn"
              >
                Cancel
              </button>
              <button
                onClick={confirmDownload}
                disabled={!preview.blobUrl}
                className="flex flex-1 items-center justify-center gap-1.5 bg-brand-orange px-3 py-2.5 text-sm font-semibold text-white clay-btn disabled:opacity-50"
              >
                <DownloadIcon />
                Download Optimized
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
