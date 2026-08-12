import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export type Priority = "low" | "medium" | "high";
export type Status = "todo" | "in-progress" | "done";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface HistoryEntry {
  id: string;
  message: string;
  actor: string;
  at: string;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  assignedTo: string;
  status: Status;
  checklist: ChecklistItem[];
  history: HistoryEntry[];
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
}

const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "kanban.json");

// ponytail: single in-memory write queue, fine for a small internal team, swap for real DB locking if this ever scales past one server.
let queue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Task[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

async function writeAll(tasks: Task[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(tasks, null, 2));
}

function mutate<T>(fn: (tasks: Task[]) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const tasks = await readAll();
    const result = await fn(tasks);
    await writeAll(tasks);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function listTasks(): Promise<Task[]> {
  return readAll();
}

export function createTask(
  input: {
    title: string;
    description: string;
    priority: Priority;
    assignedTo: string;
  },
  actor: string,
): Promise<Task> {
  return mutate((tasks) => {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      priority: input.priority,
      assignedTo: input.assignedTo,
      status: "todo",
      checklist: [],
      history: [{ id: randomUUID(), message: "Created task", actor, at: now }],
      comments: [],
      createdAt: now,
      updatedAt: now,
      statusChangedAt: now,
    };
    tasks.push(task);
    return task;
  });
}

export function updateTask(
  id: string,
  patch: Partial<
    Omit<Task, "id" | "createdAt" | "updatedAt" | "statusChangedAt" | "history" | "comments">
  >,
  actor: string,
): Promise<Task | null> {
  return mutate((tasks) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return null;
    const statusChanged = patch.status !== undefined && patch.status !== task.status;
    Object.assign(task, patch);
    task.updatedAt = new Date().toISOString();
    if (statusChanged) {
      task.statusChangedAt = task.updatedAt;
      task.history.push({
        id: randomUUID(),
        message: `Moved to ${STATUS_LABEL[task.status]}`,
        actor,
        at: task.statusChangedAt,
      });
    }
    return task;
  });
}

export function addComment(id: string, author: string, text: string): Promise<Task | null> {
  return mutate((tasks) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return null;
    task.comments.push({ id: randomUUID(), author, text, at: new Date().toISOString() });
    return task;
  });
}

export function deleteTask(id: string): Promise<boolean> {
  return mutate((tasks) => {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    tasks.splice(idx, 1);
    return true;
  });
}
