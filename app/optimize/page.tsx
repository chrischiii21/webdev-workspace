"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface QueueItem {
  id: string;
  file: File | null;
  url: string | null;
  name: string;
  status: "pending" | "working" | "done" | "error";
  previewUrl: string;
  posterUrl: string | null;
  originalSize: number;
  optimizedSize: number | null;
  blobUrl: string | null;
  filename: string | null;
  error: string | null;
  width?: number;
  height?: number;
  day: string;
}

function extLabel(name: string, fallback: string): string {
  return name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toUpperCase() ?? fallback;
}

// Finished results persist locally (IndexedDB, not Supabase) so a refresh
// doesn't lose them, but only for the calendar day they were made on --
// each new day starts fresh. In-flight items aren't persisted; a refresh
// mid-conversion just loses that item, same as any other uploader.
const DB_NAME = "media-optimizer";
const STORE = "results";

interface StoredResult {
  id: string;
  name: string;
  filename: string;
  originalSize: number;
  optimizedSize: number;
  blob: Blob;
  day: string;
}

function todayKey(): string {
  return new Date().toDateString();
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(result: StoredResult) {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(result);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function dbDelete(id: string) {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ponytail: purges stale days on load/focus, not via a live midnight timer --
// a tab left open past midnight only resets once it's foregrounded again.
async function dbLoadFresh(): Promise<StoredResult[]> {
  const db = await openStore();
  const all: StoredResult[] = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredResult[]);
    req.onerror = () => reject(req.error);
  });
  const today = todayKey();
  const stale = all.filter((r) => r.day !== today);
  if (stale.length) {
    const tx = db.transaction(STORE, "readwrite");
    for (const r of stale) tx.objectStore(STORE).delete(r.id);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }
  db.close();
  return all.filter((r) => r.day === today);
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|avi|m4v)(\?|#|$)/i;

function isVideoItem(item: QueueItem): boolean {
  // Once conversion finishes, the server-assigned filename is authoritative --
  // a source URL like a YouTube watch link carries no file extension to sniff.
  if (item.filename) return /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(item.filename);
  if (item.file) return item.file.type.startsWith("video/");
  if (item.url && youTubeThumbnail(item.url)) return true;
  return VIDEO_EXT_RE.test(item.url ?? "");
}

function youTubeThumbnail(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
    else if (host === "youtube.com") {
      id = u.searchParams.get("v");
      if (!id) {
        const match = u.pathname.match(/^\/(shorts|embed)\/([^/]+)/);
        id = match ? match[2] : null;
      }
    }
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
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

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-8 w-8">
      <path
        d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 15.5h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0">
      <path
        d="M3 5.5a1 1 0 0 1 1-1h3.5l1.5 1.5H16a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0">
      <path
        d="M8.5 11.5 11.5 8.5M7 13l-1.5 1.5a2.5 2.5 0 0 1-3.5-3.5L4 9M13 7l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5L16.5 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6m-7 0 .7 9.1a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L15 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 9v5M11.5 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function OptimizePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = queue.find((q) => q.id === selectedId) ?? null;

  async function processFile(item: QueueItem) {
    setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "working" } : q)));
    try {
      const form = new FormData();
      if (item.file) form.append("file", item.file);
      else form.append("url", item.url!);
      const res = await fetch("/api/optimize", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Conversion failed.");
      }
      const optimizedSize = Number(res.headers.get("X-Optimized-Size"));
      const originalSize = Number(res.headers.get("X-Original-Size")) || item.originalSize;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? item.name;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      // A URL-sourced item's previewUrl is the source page/link, not playable
      // media (notably a YouTube watch URL) -- swap it for the converted blob.
      const name = item.url ? filename.replace(/\.[a-zA-Z0-9]+$/, "") : item.name;
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: "done",
                optimizedSize,
                originalSize,
                blobUrl,
                filename,
                name,
                previewUrl: item.url ? blobUrl : q.previewUrl,
              }
            : q,
        ),
      );
      void dbPut({
        id: item.id,
        name,
        filename,
        originalSize,
        optimizedSize,
        blob,
        day: item.day,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed.";
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: message } : q)),
      );
    }
  }

  const addFiles = useCallback((files: FileList | File[]) => {
    const media = [...files].filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    const items: QueueItem[] = media.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      url: null,
      name: file.name,
      status: "pending",
      previewUrl: URL.createObjectURL(file),
      posterUrl: null,
      originalSize: file.size,
      optimizedSize: null,
      blobUrl: null,
      filename: null,
      error: null,
      day: todayKey(),
    }));
    setQueue((prev) => [...prev, ...items]);
    if (items.length) setSelectedId(items[items.length - 1].id);
    // Each browser download is a user-triggered action, so fire them one at a
    // time (spaced by their own conversion time) rather than Promise.all --
    // Chrome silently blocks a burst of simultaneous downloads.
    (async () => {
      for (const item of items) await processFile(item);
    })();
  }, []);

  function addUrl(rawUrl: string) {
    const url = rawUrl.trim();
    if (!url) return;
    let name = url;
    try {
      name = decodeURIComponent(new URL(url).pathname.split("/").pop() || url);
    } catch {
      // ponytail: malformed URL, fall back to showing the raw string
    }
    const item: QueueItem = {
      id: `${url}-${Math.random().toString(36).slice(2)}`,
      file: null,
      url,
      name,
      status: "pending",
      previewUrl: url,
      posterUrl: youTubeThumbnail(url),
      originalSize: 0,
      optimizedSize: null,
      blobUrl: null,
      filename: null,
      error: null,
      day: todayKey(),
    };
    setQueue((prev) => [...prev, item]);
    setSelectedId(item.id);
    void processFile(item);
  }

  function removeItem(id: string) {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
      }
      return prev.filter((q) => q.id !== id);
    });
    setSelectedId((cur) => (cur === id ? null : cur));
    void dbDelete(id);
  }

  function setDimensions(id: string, width: number, height: number) {
    setQueue((prev) =>
      prev.map((q) => (q.id === id && !q.width ? { ...q, width, height } : q)),
    );
  }

  function purgeStaleDay() {
    const today = todayKey();
    setQueue((prev) => {
      for (const q of prev) {
        if (q.day !== today) {
          URL.revokeObjectURL(q.previewUrl);
          if (q.blobUrl) URL.revokeObjectURL(q.blobUrl);
          void dbDelete(q.id);
        }
      }
      return prev.filter((q) => q.day === today);
    });
  }

  useEffect(() => {
    void dbLoadFresh().then((results) => {
      if (!results.length) return;
      setQueue((prev) => {
        const existingIds = new Set(prev.map((q) => q.id));
        const restored: QueueItem[] = results
          .filter((r) => !existingIds.has(r.id))
          .map((r) => {
            const blobUrl = URL.createObjectURL(r.blob);
            return {
              id: r.id,
              file: null,
              url: null,
              name: r.name,
              status: "done",
              previewUrl: blobUrl,
              posterUrl: null,
              originalSize: r.originalSize,
              optimizedSize: r.optimizedSize,
              blobUrl,
              filename: r.filename,
              error: null,
              day: r.day,
            };
          });
        return [...restored, ...prev];
      });
    });

    function onVisibilityChange() {
      if (document.visibilityState === "visible") purgeStaleDay();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length) addFiles(files);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function downloadItem(item: QueueItem) {
    if (!item.blobUrl || !item.filename) return;
    const a = document.createElement("a");
    a.href = item.blobUrl;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadAll() {
    for (const item of queue) if (item.status === "done") downloadItem(item);
  }

  function clearFinished() {
    setQueue((prev) => {
      for (const q of prev) {
        if (q.status !== "pending" && q.status !== "working") {
          URL.revokeObjectURL(q.previewUrl);
          if (q.blobUrl) URL.revokeObjectURL(q.blobUrl);
          void dbDelete(q.id);
        }
      }
      return prev.filter((q) => q.status === "pending" || q.status === "working");
    });
    setSelectedId((cur) => {
      const stillThere = queue.find((q) => q.id === cur);
      return stillThere && (stillThere.status === "pending" || stillThere.status === "working")
        ? cur
        : null;
    });
  }

  const doneCount = queue.filter((q) => q.status === "done").length;

  function closePicker() {
    setPickerOpen(false);
    setLinkMode(false);
    setLinkValue("");
  }

  return (
    <div className="flex gap-4 p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex h-16 items-center gap-4 px-6 clay">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-brand-navy text-sm font-bold text-white">
            O
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Media Optimizer</p>
            <p className="text-xs text-foreground/60">
              Upload images or videos, optimize, download when you&apos;re ready
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="ml-auto flex items-center gap-1.5 bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white clay-btn"
          >
            <PlusIcon />
            Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </header>

        {pickerOpen && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
            onClick={closePicker}
          >
            <div
              className="clay flex w-full max-w-lg flex-col gap-3 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              {linkMode ? (
                <form
                  className="flex flex-col gap-2 p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addUrl(linkValue);
                    closePicker();
                  }}
                >
                  <p className="text-xs font-medium text-foreground/70">
                    Paste an image or video URL, or a YouTube link
                  </p>
                  <input
                    autoFocus
                    type="url"
                    required
                    value={linkValue}
                    onChange={(e) => setLinkValue(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="clay-well px-3 py-2 text-sm text-foreground outline-none"
                  />
                  <div className="mt-1 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setLinkMode(false)}
                      className="clay-btn px-3 py-1.5 text-xs"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="clay-btn bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Add
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    onDrop(e);
                    closePicker();
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-[var(--surface-border)] p-8 text-center ${
                    dragActive ? "border-brand-orange" : ""
                  }`}
                >
                  <UploadIcon />
                  <p className="text-sm font-medium text-foreground">Drop files here</p>
                </div>
              )}

              {!linkMode && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        closePicker();
                        inputRef.current?.click();
                      }}
                      className="flex items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-[var(--surface-muted)]"
                    >
                      <FolderIcon />
                      From device
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkMode(true)}
                      className="flex items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-[var(--surface-muted)]"
                    >
                      <LinkIcon />
                      From link
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={closePicker}
                    className="clay-btn px-3 py-2 text-xs font-medium text-foreground/70"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {queue.length === 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => setPickerOpen(true)}
            className={`flex min-h-[50vh] flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-[var(--surface-border)] p-8 text-center cursor-pointer clay ${
              dragActive ? "border-brand-orange" : ""
            }`}
          >
            <UploadIcon />
            <p className="text-sm font-medium text-foreground">No files yet</p>
            <p className="text-xs text-foreground/50">
              Drag and drop, paste, or click to upload images or videos
            </p>
          </div>
        )}

        {queue.length > 0 && (
          <div className="flex flex-col gap-2 p-4 clay">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
                Queue
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAll}
                  disabled={doneCount === 0}
                  className="flex items-center gap-1.5 bg-brand-orange px-2.5 py-1 text-xs font-semibold text-white clay-btn disabled:opacity-50"
                >
                  <DownloadIcon />
                  Download all ({doneCount})
                </button>
                <button
                  onClick={clearFinished}
                  className="px-2.5 py-1 text-xs font-medium text-foreground/70 clay-btn"
                >
                  Clear finished
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {queue.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 clay-well ${
                    item.id === selectedId ? "outline outline-2 outline-brand-orange" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {isVideoItem(item) ? (
                      <video
                        src={item.previewUrl}
                        poster={item.posterUrl ?? undefined}
                        muted
                        className="h-8 w-8 shrink-0 rounded-sm object-cover clay"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-sm object-cover clay"
                      />
                    )}
                    <p className="min-w-0 truncate text-xs font-medium text-foreground">
                      {item.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px] text-foreground/50">
                    {item.status === "working" && "Optimizing..."}
                    {item.status === "error" && (
                      <span className="text-brand-red">{item.error}</span>
                    )}
                    {item.status === "done" && item.optimizedSize != null && (
                      <>
                        <span className="text-foreground/60">
                          {formatBytes(item.originalSize)} → {formatBytes(item.optimizedSize)} (-
                          {Math.round((1 - item.optimizedSize / item.originalSize) * 100)}%)
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadItem(item);
                          }}
                          title="Download optimized file"
                          className="flex items-center gap-1 bg-brand-orange px-2 py-1 text-[11px] font-semibold text-white clay-btn"
                        >
                          <DownloadIcon />
                          Download
                        </button>
                      </>
                    )}
                    {item.status === "pending" && "Queued..."}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DetailPanel
        item={selected}
        onDownload={downloadItem}
        onRemove={removeItem}
        onDimensions={setDimensions}
      />
    </div>
  );
}

function DetailPanel({
  item,
  onDownload,
  onRemove,
  onDimensions,
}: {
  item: QueueItem | null;
  onDownload: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onDimensions: (id: string, width: number, height: number) => void;
}) {
  if (!item) {
    return (
      <div className="hidden min-h-[70vh] w-80 shrink-0 flex-col items-center justify-center gap-2 p-6 text-center clay lg:flex">
        <UploadIcon />
        <p className="text-xs text-foreground/50">Select a file to see details</p>
      </div>
    );
  }

  const isVideo = isVideoItem(item);
  const beforeExt = extLabel(item.name, isVideo ? "VIDEO" : "IMAGE");
  const afterExt = item.filename ? extLabel(item.filename, isVideo ? "MP4" : "AVIF") : null;
  const pct =
    item.status === "done" && item.optimizedSize != null && item.originalSize > 0
      ? Math.round((1 - item.optimizedSize / item.originalSize) * 100)
      : null;

  return (
    <div className="hidden min-h-[70vh] w-80 shrink-0 flex-col gap-3 overflow-y-auto p-4 clay lg:flex">
      <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-sm clay-well">
        {isVideo ? (
          <video
            key={item.previewUrl}
            src={item.previewUrl}
            poster={item.posterUrl ?? undefined}
            controls
            muted
            className="max-h-64 w-full object-contain"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (!item.width) onDimensions(item.id, v.videoWidth, v.videoHeight);
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.previewUrl}
            src={item.previewUrl}
            alt=""
            className="max-h-64 w-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (!item.width) onDimensions(item.id, img.naturalWidth, img.naturalHeight);
            }}
          />
        )}
      </div>

      <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
      <p className="text-xs text-foreground/50">
        {beforeExt}
        {item.width ? ` · ${item.width}×${item.height}` : ""}
        {item.originalSize > 0 ? ` · ${formatBytes(item.originalSize)}` : ""}
      </p>

      {item.status === "done" && item.optimizedSize != null && (
        <div className="flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-xs clay-well">
          <span className="text-foreground/60">
            {beforeExt} {formatBytes(item.originalSize)}
          </span>
          <span className="text-foreground/30">→</span>
          <span className="text-foreground/60">
            {afterExt} {formatBytes(item.optimizedSize)}
          </span>
          {pct != null && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-600">
              -{pct}%
            </span>
          )}
        </div>
      )}
      {item.status === "working" && <p className="text-xs text-foreground/50">Optimizing…</p>}
      {item.status === "pending" && <p className="text-xs text-foreground/50">Queued…</p>}
      {item.status === "error" && <p className="text-xs text-brand-red">{item.error}</p>}

      <div className="mt-auto flex gap-2">
        <button
          onClick={() => onDownload(item)}
          disabled={item.status !== "done"}
          className="flex flex-1 items-center justify-center gap-1.5 bg-brand-orange px-3 py-2 text-xs font-semibold text-white clay-btn disabled:opacity-50"
        >
          <DownloadIcon />
          Download
        </button>
        <button
          onClick={() => onRemove(item.id)}
          title="Remove"
          className="flex items-center justify-center px-3 py-2 text-foreground/60 clay-btn"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
