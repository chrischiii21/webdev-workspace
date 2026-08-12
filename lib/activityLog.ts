import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "activity.json");
const MAX_EVENTS = 500;

// ponytail: single in-memory write queue, same tradeoff as kanbanStore.
let queue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<ActivityEvent[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as ActivityEvent[];
  } catch {
    return [];
  }
}

async function writeAll(events: ActivityEvent[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(events, null, 2));
}

export function logEvent(actor: string, action: string, target: string): Promise<void> {
  const run = queue.then(async () => {
    const events = await readAll();
    events.push({ id: randomUUID(), actor, action, target, at: new Date().toISOString() });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    await writeAll(events);
  });
  queue = run.catch(() => {});
  return run;
}

export async function listEvents(): Promise<ActivityEvent[]> {
  const events = await readAll();
  return events.slice().reverse();
}
