import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import youtubedl from "youtube-dl-exec";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const MAX_WIDTH = 1600;
const MAX_VIDEO_WIDTH = 1280;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

function isYouTubeUrl(url: URL): boolean {
  return YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
}

async function fetchYouTubeVideo(
  url: string,
): Promise<{ raw: Buffer; name: string; type: string } | { error: string }> {
  const dir = await mkdtemp(join(tmpdir(), "ytdlp-"));
  const outPath = join(dir, "video.mp4");
  try {
    const info = await youtubedl(url, {
      output: outPath,
      format: "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b",
      mergeOutputFormat: "mp4",
      noPlaylist: true,
      noWarnings: true,
      printJson: true,
      ...(ffmpegPath && { ffmpegLocation: ffmpegPath }),
    });
    const raw = await readFile(outPath);
    const rawTitle = typeof info === "object" && "title" in info ? String(info.title) : "video";
    const title = rawTitle.replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "").trim().slice(0, 80) || "video";
    return { raw, name: `${title}.mp4`, type: "video/mp4" };
  } catch {
    return { error: "Couldn't download that YouTube video." };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const urlField = form.get("url");

  let raw: Buffer;
  let name: string;
  let type: string;

  if (file instanceof File) {
    raw = Buffer.from(await file.arrayBuffer());
    name = file.name;
    type = file.type;
  } else if (typeof urlField === "string" && urlField) {
    const fetched = await fetchRemoteMedia(urlField);
    if ("error" in fetched) return Response.json({ error: fetched.error }, { status: 400 });
    ({ raw, name, type } = fetched);
  } else {
    return Response.json({ error: "Missing file or url." }, { status: 400 });
  }

  if (type.startsWith("image/")) return optimizeImage(raw, name);
  if (type.startsWith("video/")) return optimizeVideo(raw, name);
  return Response.json({ error: "Not an image or video file." }, { status: 400 });
}

async function fetchRemoteMedia(
  rawUrl: string,
): Promise<{ raw: Buffer; name: string; type: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: "Invalid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http/https URLs are supported." };
  }
  if (isYouTubeUrl(url)) return fetchYouTubeVideo(rawUrl);
  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateAddress(address)) return { error: "That host isn't allowed." };
  } catch {
    return { error: "Couldn't resolve that host." };
  }

  // ponytail: single DNS check before fetch, doesn't re-validate on redirect
  // hops (DNS-rebinding / redirect-to-internal bypass). Add a redirect: "manual"
  // loop that re-checks each hop if this endpoint is ever exposed publicly.
  const res = await fetch(url);
  if (!res.ok) return { error: `Couldn't fetch that URL (${res.status}).` };
  const type = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!type.startsWith("image/") && !type.startsWith("video/")) {
    return { error: "URL did not return an image or video." };
  }
  const raw = Buffer.from(await res.arrayBuffer());
  const name = decodeURIComponent(url.pathname.split("/").pop() || "download");
  return { raw, name, type };
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

async function optimizeImage(raw: Buffer, name: string) {
  const filename = `${name.replace(/\.[a-zA-Z0-9]+$/, "")}.avif`;
  try {
    const pipeline = sharp(raw).rotate();
    const meta = await pipeline.metadata();
    if (meta.width && meta.width > MAX_WIDTH) pipeline.resize({ width: MAX_WIDTH });
    const avif = await pipeline.avif({ quality: 65, effort: 9 }).toBuffer();
    return new Response(new Uint8Array(avif), {
      headers: {
        "Content-Type": "image/avif",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "X-Original-Size": String(raw.length),
        "X-Optimized-Size": String(avif.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to convert image.";
    return Response.json({ error: message }, { status: 502 });
  }
}

async function optimizeVideo(raw: Buffer, name: string) {
  const filename = `${name.replace(/\.[a-zA-Z0-9]+$/, "")}.mp4`;
  const dir = await mkdtemp(join(tmpdir(), "optimize-"));
  const inPath = join(dir, "in");
  const outPath = join(dir, "out.mp4");
  try {
    await writeFile(inPath, raw);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inPath)
        .videoFilters(`scale='min(${MAX_VIDEO_WIDTH},iw)':-2`)
        .videoCodec("libx264")
        .outputOptions(["-crf 28", "-preset veryfast", "-movflags +faststart"])
        .audioCodec("aac")
        .audioBitrate("128k")
        .on("error", reject)
        .on("end", () => resolve())
        .save(outPath);
    });
    const optimized = await readFile(outPath);
    return new Response(new Uint8Array(optimized), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "X-Original-Size": String(raw.length),
        "X-Optimized-Size": String(optimized.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to convert video.";
    return Response.json({ error: message }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
