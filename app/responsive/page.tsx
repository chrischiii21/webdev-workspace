"use client";

import { useRef, useState } from "react";

const DEVICES = [
  { label: "Mobile", width: 375, height: 812 },
  { label: "Tablet", width: 768, height: 1024 },
  { label: "Laptop", width: 1366, height: 800 },
  { label: "Desktop", width: 1920, height: 1080 },
];

// ponytail: a cross-origin site's scrollTop is not readable/writable from
// here, so those frames are rendered oversized and translated up by a shared
// offset -- a fixed guess at max page height, not the page's real height.
const TALL = 6000;

function normalize(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1;
const ZOOM_STEP = 0.1;

// Builds a selector stable enough to find "the same element" in a sibling
// frame loading the same page -- id if present, else a tag+nth-of-type path
// from the body down.
function cssPath(el: Element | null): string {
  if (!el || el.nodeType !== 1) return "";
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName.toLowerCase() !== "body") {
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    let selector = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(selector);
    node = parent;
  }
  return parts.join(" > ");
}

export default function ResponsivePage() {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEVICES.map((d) => d.label)));
  const [zoom, setZoom] = useState(0.4);
  const dragFrom = useRef<number | null>(null);
  const frames = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const mirroring = useRef(false);

  const sameOrigin = (() => {
    if (!url) return false;
    try {
      return new URL(url).origin === window.location.origin;
    } catch {
      return false;
    }
  })();

  function preview(e?: React.FormEvent) {
    e?.preventDefault();
    setUrl(normalize(input));
    setReloadKey((k) => k + 1);
    setScrollY(0);
  }

  function toggleDevice(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
        frames.current.delete(label);
      } else next.add(label);
      return next;
    });
  }

  function scrollBy(delta: number) {
    setScrollY((y) => clamp(y + delta / zoom, 0, TALL - 200));
  }

  // Same-origin only: click and scroll in one frame really happen in every
  // sibling frame's own document (accessible because the browser only blocks
  // this across origins). Scroll syncs by page percentage, since a
  // responsive layout's content height differs per breakpoint.
  function attachMirror(label: string, iframe: HTMLIFrameElement) {
    frames.current.set(label, iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win || !sameOrigin) return;

    function siblings() {
      return [...frames.current.entries()].filter(
        ([l, el]) => l !== label && el.isConnected && el.contentWindow && el.contentDocument,
      );
    }

    function onClick(e: MouseEvent) {
      if (mirroring.current) return;
      const path = cssPath(e.target as Element);
      console.log("[mirror] click on", label, "path:", path, "siblings:", siblings().length);
      if (!path) return;
      mirroring.current = true;
      for (const [sl, el] of siblings()) {
        const target = el.contentDocument!.querySelector(path);
        console.log("[mirror] ->", sl, target ? "found" : "NOT FOUND");
        if (target instanceof HTMLElement) target.click();
      }
      mirroring.current = false;
    }

    function onScroll() {
      if (mirroring.current) return;
      const max = doc!.documentElement.scrollHeight - win!.innerHeight;
      const pct = max > 0 ? win!.scrollY / max : 0;
      mirroring.current = true;
      for (const [, el] of siblings()) {
        const sMax = el.contentDocument!.documentElement.scrollHeight - el.contentWindow!.innerHeight;
        el.contentWindow!.scrollTo({ top: pct * Math.max(sMax, 0) });
      }
      mirroring.current = false;
    }

    doc.addEventListener("click", onClick, true);
    win.addEventListener("scroll", onScroll);
    console.log("[mirror] attached for", label);
  }

  const visible = DEVICES.filter((d) => selected.has(d.label));

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex h-16 shrink-0 items-center gap-4 px-6 clay">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-brand-navy text-sm font-bold text-white">
          R
        </div>
        <div className="shrink-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Responsive Preview
            <span className="rounded-full bg-brand-orange/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-orange">
              Under development
            </span>
          </p>
          <p className="text-xs text-foreground/60">
            See a URL at every screen size, scrolled together
          </p>
        </div>
        <form onSubmit={preview} className="ml-4 flex flex-1 items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://example.com or http://localhost:3000"
            aria-label="Website URL"
            className="w-full flex-1 px-4 py-2.5 text-sm text-foreground outline-none clay-well placeholder:text-foreground/40"
            required
          />
          <button
            type="button"
            onClick={() => {
              setInput(window.location.origin);
              setUrl(window.location.origin);
              setReloadKey((k) => k + 1);
              setScrollY(0);
            }}
            className="shrink-0 px-3 py-2.5 text-xs font-medium text-foreground clay-btn"
          >
            This app
          </button>
          <button
            type="submit"
            className="shrink-0 bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white clay-btn"
          >
            Preview
          </button>
          {url && (
            <button
              type="button"
              onClick={() => {
                frames.current.clear();
                setReloadKey((k) => k + 1);
                setScrollY(0);
              }}
              title="Reload all frames"
              className="shrink-0 px-3 py-2.5 text-xs font-medium text-foreground clay-btn"
            >
              Reload
            </button>
          )}
        </form>
      </header>

      <div className="flex shrink-0 items-center gap-2 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
          Screens
        </p>
        {DEVICES.map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => toggleDevice(d.label)}
            className={`px-3 py-1.5 text-xs font-medium clay-btn ${
              selected.has(d.label) ? "bg-brand-navy text-white" : "text-foreground/60"
            }`}
          >
            {d.label}
          </button>
        ))}
        {url && !sameOrigin && (
          <p className="ml-2 text-[11px] text-foreground/40">
            External site: scroll stays in sync; clicks don&apos;t (browsers block that across
            origins). Use &quot;This app&quot; for full click sync.
          </p>
        )}
        {url && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => clamp(z - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX))}
              disabled={zoom <= ZOOM_MIN}
              className="flex h-7 w-7 items-center justify-center text-sm font-semibold text-foreground clay-btn disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Reset zoom"
              className="w-12 text-center text-xs font-medium text-foreground/70 clay-btn py-1"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clamp(z + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX))}
              disabled={zoom >= ZOOM_MAX}
              className="flex h-7 w-7 items-center justify-center text-sm font-semibold text-foreground clay-btn disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}
      </div>

      {!url && (
        <div className="flex flex-1 items-center justify-center clay">
          <p className="text-sm text-foreground/60">
            Paste a URL above to preview it at mobile, tablet, laptop, and desktop widths.
          </p>
        </div>
      )}

      {url && visible.length === 0 && (
        <div className="flex flex-1 items-center justify-center clay">
          <p className="text-sm text-foreground/60">Pick at least one screen size above.</p>
        </div>
      )}

      {url && visible.length > 0 && (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
          {visible.map((d) => {
            const boxWidth = d.width * zoom;
            const boxHeight = d.height * zoom;
            return (
              <div
                key={d.label}
                className="flex shrink-0 flex-col gap-2 p-3 clay"
                style={{ width: boxWidth + 24 }}
              >
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-foreground">{d.label}</p>
                  <p className="text-[10px] text-foreground/50">
                    {d.width}×{d.height}
                  </p>
                </div>
                <div
                  className="relative overflow-hidden clay-well"
                  style={{ width: boxWidth, height: boxHeight, maxHeight: "calc(100vh - 14rem)" }}
                >
                  {sameOrigin ? (
                    <iframe
                      key={`${d.label}-${reloadKey}`}
                      ref={(el) => {
                        if (el) frames.current.set(d.label, el);
                      }}
                      src={url}
                      title={`${d.label} preview`}
                      onLoad={(e) => attachMirror(d.label, e.currentTarget)}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: d.width,
                        height: d.height,
                        border: "none",
                        transform: `scale(${zoom})`,
                        transformOrigin: "0 0",
                      }}
                    />
                  ) : (
                    <div
                      className="absolute left-0 top-0"
                      style={{
                        width: d.width,
                        height: d.height,
                        transform: `scale(${zoom})`,
                        transformOrigin: "0 0",
                      }}
                    >
                      <iframe
                        key={`${d.label}-${reloadKey}`}
                        src={url}
                        title={`${d.label} preview`}
                        scrolling="no"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: d.width,
                          height: TALL,
                          border: "none",
                          pointerEvents: "none",
                          transform: `translateY(-${Math.min(scrollY, TALL - d.height)}px)`,
                        }}
                      />
                      {/* Capture layer: cross-origin content can't relay wheel/drag input,
                          so this drives the shared scroll offset every frame reads from. */}
                      <div
                        className="absolute inset-0 cursor-grab active:cursor-grabbing"
                        onWheel={(e) => {
                          e.preventDefault();
                          scrollBy(e.deltaY);
                        }}
                        onPointerDown={(e) => {
                          dragFrom.current = e.clientY;
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (dragFrom.current === null) return;
                          scrollBy(dragFrom.current - e.clientY);
                          dragFrom.current = e.clientY;
                        }}
                        onPointerUp={() => {
                          dragFrom.current = null;
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
