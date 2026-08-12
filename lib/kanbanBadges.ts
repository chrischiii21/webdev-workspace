import type { Task } from "./kanbanStore";

export const DISMISSED_KEY = "kanban:dismissed";

export function readDismissed(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// A task is "new" until its card is clicked at least once after creation.
export function isTaskNew(task: Task, dismissed: Record<string, string>): boolean {
  return !dismissed[task.id] || dismissed[task.id] < task.createdAt;
}

// A task is "moved" once seen, but moved again (status changed) since the last click.
export function isTaskMoved(task: Task, dismissed: Record<string, string>): boolean {
  if (isTaskNew(task, dismissed)) return false;
  return dismissed[task.id] < task.statusChangedAt;
}
