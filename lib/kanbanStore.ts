import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

export type Priority = "low" | "medium" | "high";
export type Status = "todo" | "in-progress" | "done";
export type Tag = "development" | "qa-review";

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
  tag: Tag | null;
  checklist: ChecklistItem[];
  history: HistoryEntry[];
  comments: Comment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
}

const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
};

interface TaskRow {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  assigned_to: string;
  status: Status;
  tag: Tag | null;
  checklist: ChecklistItem[];
  history: HistoryEntry[];
  comments: Comment[];
  created_by: string;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
}

function fromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    assignedTo: row.assigned_to,
    status: row.status,
    tag: row.tag,
    checklist: row.checklist,
    history: row.history,
    comments: row.comments,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusChangedAt: row.status_changed_at,
  };
}

export async function listTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as TaskRow[]).map(fromRow);
}

export async function createTask(
  input: {
    title: string;
    description: string;
    priority: Priority;
    assignedTo: string;
    tag?: Tag | null;
  },
  actor: string,
): Promise<Task> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description,
      priority: input.priority,
      assigned_to: input.assignedTo,
      tag: input.tag ?? null,
      status: "todo",
      checklist: [],
      history: [{ id: randomUUID(), message: "Created task", actor, at: now }],
      comments: [],
      created_by: actor,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as TaskRow);
}

export async function updateTask(
  id: string,
  patch: Partial<
    Omit<Task, "id" | "createdAt" | "updatedAt" | "statusChangedAt" | "history" | "comments">
  >,
  actor: string,
): Promise<Task | null> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return null;
  const current = fromRow(existing as TaskRow);
  if (current.status === "done") return current;

  const now = new Date().toISOString();
  const statusChanged = patch.status !== undefined && patch.status !== current.status;
  const history = statusChanged
    ? [
        ...current.history,
        {
          id: randomUUID(),
          message: `Moved to ${STATUS_LABEL[patch.status as Status]}`,
          actor,
          at: now,
        },
      ]
    : current.history;

  const { data, error } = await supabase
    .from("tasks")
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.assignedTo !== undefined && { assigned_to: patch.assignedTo }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.tag !== undefined && { tag: patch.tag }),
      ...(patch.checklist !== undefined && { checklist: patch.checklist }),
      history,
      updated_at: now,
      ...(statusChanged && { status_changed_at: now }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as TaskRow);
}

export async function addComment(id: string, author: string, text: string): Promise<Task | null> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select("comments")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return null;

  const comments = [
    ...(existing.comments as Comment[]),
    { id: randomUUID(), author, text, at: new Date().toISOString() },
  ];
  const { data, error } = await supabase
    .from("tasks")
    .update({ comments, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as TaskRow);
}

export async function deleteTask(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
