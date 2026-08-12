import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export interface EodReport {
  id: string;
  author: string;
  authorName: string | null;
  date: string; // YYYY-MM-DD
  didToday: string;
  nextUp: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "eodReports.json");

// ponytail: single in-memory write queue, same tradeoff as kanbanStore.
let queue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<EodReport[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as EodReport[];
  } catch {
    return [];
  }
}

async function writeAll(reports: EodReport[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(reports, null, 2));
}

function mutate<T>(fn: (reports: EodReport[]) => T): Promise<T> {
  const run = queue.then(async () => {
    const reports = await readAll();
    const result = fn(reports);
    await writeAll(reports);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function listReports(): Promise<EodReport[]> {
  return readAll();
}

// One report per author per day -- resubmitting the same day updates it in place.
export function upsertReport(input: {
  author: string;
  authorName: string | null;
  date: string;
  didToday: string;
  nextUp: string;
}): Promise<EodReport> {
  return mutate((reports) => {
    const now = new Date().toISOString();
    const existing = reports.find((r) => r.author === input.author && r.date === input.date);
    if (existing) {
      existing.authorName = input.authorName;
      existing.didToday = input.didToday;
      existing.nextUp = input.nextUp;
      existing.updatedAt = now;
      return existing;
    }
    const report: EodReport = {
      id: randomUUID(),
      author: input.author,
      authorName: input.authorName,
      date: input.date,
      didToday: input.didToday,
      nextUp: input.nextUp,
      createdAt: now,
      updatedAt: now,
    };
    reports.push(report);
    return report;
  });
}
