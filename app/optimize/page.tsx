"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface QueueItem {
  id: string;
  file: File;
  status: "pending" | "working" | "done" | "error";
  previewUrl: string;
  originalSize: number;
  optimizedSize: number | null;
  blobUrl: string | null;
  filename: string | null;
  error: string | null;
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

export default function OptimizePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(item: QueueItem) {
    setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "working" } : q)));
    try {
      const form = new FormData();
      form.append("file", item.file);
      const res = await fetch("/api/optimize", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Conversion failed.");
      }
      const optimizedSize = Number(res.headers.get("X-Optimized-Size"));
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const filename = `${item.file.name.replace(/\.[a-zA-Z0-9]+$/, "")}.avif`;
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "done", optimizedSize, blobUrl, filename } : q,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed.";
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: message } : q)),
      );
    }
  }

  const addFiles = useCallback((files: FileList | File[]) => {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    const items: QueueItem[] = images.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      status: "pending",
      previewUrl: URL.createObjectURL(file),
      originalSize: file.size,
      optimizedSize: null,
      blobUrl: null,
      filename: null,
      error: null,
    }));
    setQueue((prev) => [...prev, ...items]);
    // Each browser download is a user-triggered action, so fire them one at a
    // time (spaced by their own conversion time) rather than Promise.all --
    // Chrome silently blocks a burst of simultaneous downloads.
    (async () => {
      for (const item of items) await processFile(item);
    })();
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
        }
      }
      return prev.filter((q) => q.status === "pending" || q.status === "working");
    });
  }

  const doneCount = queue.filter((q) => q.status === "done").length;

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex h-16 items-center gap-4 px-6 clay">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-brand-navy text-sm font-bold text-white">
          O
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Image Optimizer</p>
          <p className="text-xs text-foreground/60">
            Upload images, optimize to AVIF, download when you&apos;re ready
          </p>
        </div>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 p-12 text-center clay-well ${
          dragActive ? "outline outline-2 outline-brand-orange" : ""
        }`}
      >
        <UploadIcon />
        <p className="text-sm font-medium text-foreground">
          Drop images here, click to browse, or paste (Ctrl/Cmd+V)
        </p>
        <p className="text-xs text-foreground/50">
          Converted to AVIF, then wait for your go-ahead to download
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

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
                className="flex items-center justify-between gap-3 px-3 py-2 clay-well"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-sm object-cover clay"
                  />
                  <p className="min-w-0 truncate text-xs font-medium text-foreground">
                    {item.file.name}
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
                        onClick={() => downloadItem(item)}
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
  );
}
