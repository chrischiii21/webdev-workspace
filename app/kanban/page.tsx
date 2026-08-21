"use client";

import { useEffect, useState } from "react";
import type { ChecklistItem, Priority, Status, Tag, Task } from "@/lib/kanbanStore";
import { DISMISSED_KEY, isTaskMoved, isTaskNew, readDismissed } from "@/lib/kanbanBadges";
import ConfirmDialog from "@/app/components/ConfirmDialog";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in-progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-brand-red/10 text-brand-red",
  medium: "bg-brand-orange/10 text-brand-orange",
  low: "bg-foreground/10 text-foreground/70",
};

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-brand-red",
  medium: "bg-brand-orange",
  low: "bg-foreground/30",
};

const TAG_LABEL: Record<Tag, string> = {
  development: "Development",
  "qa-review": "QA Review",
};

const TAG_STYLE: Record<Tag, string> = {
  development: "bg-sky-600 text-white",
  "qa-review": "bg-purple-600 text-white",
};

function toggleAssignee(current: string[], email: string): string[] {
  return current.includes(email) ? current.filter((e) => e !== email) : [...current, email];
}

function AssigneePicker({
  users,
  selected,
  onToggle,
}: {
  users: { id: string; email: string; name: string | null }[];
  selected: string[];
  onToggle: (email: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-foreground/50">Assignees</label>
      <div className="clay-well flex max-h-32 flex-col gap-0.5 overflow-y-auto p-2">
        {users.map((u) => (
          <label
            key={u.id}
            className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-[var(--surface-muted)]"
          >
            <input
              type="checkbox"
              checked={selected.includes(u.email)}
              onChange={() => onToggle(u.email)}
            />
            <span>{u.name || u.email}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function emptyForm() {
  return {
    title: "",
    description: "",
    priority: "medium" as Priority,
    assignedTo: [] as string[],
    tag: "" as Tag | "",
  };
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M13.5 3.5 16.5 6.5 7 16H4v-3l9.5-9.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M4 10.5 8 14.5 16 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChecklistProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-8 overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-green-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] text-foreground/40">
        {done}/{total}
      </span>
    </div>
  );
}

function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex min-w-[10rem] items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[10px] font-semibold text-white">
        {label[0]?.toUpperCase()}
      </span>
      <span className="shrink-0 text-xs text-foreground/70">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-green-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] text-foreground/40">
        {done}/{total}
      </span>
    </div>
  );
}

function AssigneeProgress({
  tasks,
  users,
  isAdmin,
}: {
  tasks: Task[];
  users: { id: string; email: string; name: string | null }[];
  isAdmin: boolean;
}) {
  if (!isAdmin) {
    if (tasks.length === 0) return null;
    const done = tasks.filter((t) => t.status === "done").length;
    return (
      <div className="clay-well flex w-full p-3">
        <ProgressBar label="Your progress" done={done} total={tasks.length} />
      </div>
    );
  }

  const byAssignee = new Map<string, { done: number; total: number }>();
  for (const t of tasks) {
    for (const email of t.assignedTo) {
      const entry = byAssignee.get(email) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (t.status === "done") entry.done += 1;
      byAssignee.set(email, entry);
    }
  }
  const rows = [...byAssignee.entries()].sort((a, b) => b[1].total - a[1].total);
  if (rows.length === 0) return null;

  return (
    <div className="clay-well flex shrink-0 flex-wrap gap-x-5 gap-y-2 p-3">
      {rows.map(([email, { done, total }]) => (
        <ProgressBar key={email} label={users.find((u) => u.email === email)?.name || email} done={done} total={total} />
      ))}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3">
      <path
        d="M3 4.5h14v9H8l-3.5 3v-3H3v-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 20" fill="currentColor" className="h-4 w-2.5 shrink-0">
      <circle cx="2.5" cy="4" r="1.2" />
      <circle cx="7.5" cy="4" r="1.2" />
      <circle cx="2.5" cy="10" r="1.2" />
      <circle cx="7.5" cy="10" r="1.2" />
      <circle cx="2.5" cy="16" r="1.2" />
      <circle cx="7.5" cy="16" r="1.2" />
    </svg>
  );
}

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingStatus, setCreatingStatus] = useState<Status | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [titleError, setTitleError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newChecklistOn, setNewChecklistOn] = useState(false);
  const [newChecklist, setNewChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistDraft, setNewChecklistDraft] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => readDismissed());
  const [search, setSearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  useEffect(() => {
    fetch("/api/kanban")
      .then((r) => r.json())
      .then((data) => {
        setTasks(data.tasks ?? []);
        setIsAdmin(Boolean(data.isAdmin));
        setUserEmail(data.email ?? "");
      })
      .finally(() => setLoading(false));
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []));
  }, []);

  const active = tasks.find((t) => t.id === activeId) ?? null;
  const query = search.trim().toLowerCase();
  const visibleTasks = tasks
    .filter((t) => !assigneeFilter || t.assignedTo.includes(assigneeFilter))
    .filter(
      (t) =>
        !query ||
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.assignedTo.some((a) => assigneeLabel(a).toLowerCase().includes(query)),
    );

  function dismissTask(task: Task) {
    setDismissed((prev) => {
      const next = { ...prev, [task.id]: task.statusChangedAt };
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      return next;
    });
  }

  function isNewTask(task: Task) {
    return isTaskNew(task, dismissed);
  }

  function isMovedTask(task: Task) {
    return isTaskMoved(task, dismissed);
  }

  function assigneeLabel(email: string) {
    return users.find((u) => u.email === email)?.name || email;
  }

  async function refreshTask(id: string, patch: Partial<Task>) {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              updatedAt: now,
              statusChangedAt:
                patch.status !== undefined && patch.status !== t.status
                  ? now
                  : t.statusChangedAt,
            }
          : t,
      ),
    );
    const res = await fetch(`/api/kanban/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.task) {
      setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
    }
  }

  async function addComment(id: string, text: string) {
    const res = await fetch(`/api/kanban/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.task) {
      setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
    }
  }

  function resetCreateForm() {
    setForm(emptyForm());
    setTitleError(false);
    setCreatingStatus(null);
    setNewChecklistOn(false);
    setNewChecklist([]);
    setNewChecklistDraft("");
  }

  function addNewChecklistItem() {
    if (!newChecklistDraft.trim()) return;
    setNewChecklist((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: newChecklistDraft.trim(), done: false },
    ]);
    setNewChecklistDraft("");
  }

  function removeNewChecklistItem(itemId: string) {
    setNewChecklist((prev) => prev.filter((c) => c.id !== itemId));
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setTitleError(true);
      return;
    }
    const res = await fetch("/api/kanban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    const status = creatingStatus ?? "todo";
    const checklist = newChecklistOn ? newChecklist : [];
    const task: Task = { ...data.task, status, checklist };
    setTasks((prev) => [task, ...prev]);
    const patch: Partial<Task> = {};
    if (status !== data.task.status) patch.status = status;
    if (checklist.length > 0) patch.checklist = checklist;
    if (Object.keys(patch).length > 0) {
      fetch(`/api/kanban/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    }
    resetCreateForm();
  }

  async function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setActiveId(null);
    await fetch(`/api/kanban/${id}`, { method: "DELETE" });
  }

  function moveTask(id: string, status: Status) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    refreshTask(id, { status });
  }

  function addChecklistItem() {
    if (!active || !checklistDraft.trim()) return;
    const item: ChecklistItem = {
      id: crypto.randomUUID(),
      text: checklistDraft.trim(),
      done: false,
    };
    refreshTask(active.id, { checklist: [...active.checklist, item] });
    setChecklistDraft("");
  }

  function toggleChecklistItem(itemId: string) {
    if (!active) return;
    const checklist = active.checklist.map((c) =>
      c.id === itemId ? { ...c, done: !c.done } : c,
    );
    refreshTask(active.id, { checklist });
  }

  function removeChecklistItem(itemId: string) {
    if (!active) return;
    refreshTask(active.id, {
      checklist: active.checklist.filter((c) => c.id !== itemId),
    });
  }

  return (
    <main className="flex h-full w-full flex-1 flex-col gap-6 overflow-hidden p-6">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kanban Board</h1>
          <p className="text-sm text-foreground/60">Team to-do tracker</p>
        </div>
        <div className="flex w-full max-w-xl gap-2">
          <input
            type="search"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="clay-well w-full px-3 py-2 text-sm outline-none"
          />
          {isAdmin && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="clay-well shrink-0 px-3 py-2 text-sm outline-none"
            >
              <option value="">All assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!loading && <AssigneeProgress tasks={tasks} users={users} isAdmin={isAdmin} />}

      {loading ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className={`clay-well flex min-h-[300px] flex-col gap-3 overflow-hidden p-4 outline-2 outline-offset-[-2px] transition-colors ${
                dragOverStatus === col.status ? "outline-brand-navy" : "outline-transparent"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggingId) setDragOverStatus(col.status);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragOverStatus(null);
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/task-id");
                if (id) moveTask(id, col.status);
                setDragOverStatus(null);
                setDraggingId(null);
              }}
            >
              <h2 className="shrink-0 px-1 text-sm font-semibold text-foreground">
                {col.label}{" "}
                <span className="text-foreground/40">
                  {visibleTasks.filter((t) => t.status === col.status).length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setCreatingStatus(col.status)}
                className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs text-foreground/40 hover:bg-[var(--surface-muted)] hover:text-foreground/70"
              >
                <PlusIcon />
                New
              </button>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                {visibleTasks
                  .filter((t) => t.status === col.status)
                  .map((task) => {
                    const done = task.checklist.filter((c) => c.done).length;
                    const assigneeNames = task.assignedTo.map(assigneeLabel);
                    const isNew = isNewTask(task);
                    const isMoved = isMovedTask(task);
                    return (
                      <button
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/task-id", task.id);
                          setDraggingId(task.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStatus(null);
                        }}
                        onClick={() => {
                          setActiveId(task.id);
                          setEditing(false);
                          setCommentDraft("");
                          dismissTask(task);
                        }}
                        className={`group clay relative flex cursor-grab flex-col gap-1.5 p-3 pl-6 text-left transition-opacity active:cursor-grabbing ${
                          isNew || isMoved ? "pr-14" : ""
                        } ${draggingId === task.id ? "opacity-40" : "opacity-100"} ${
                          isNew || isMoved ? "border-l-2 border-l-brand-orange" : ""
                        }`}
                      >
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-foreground/25 opacity-0 transition-opacity group-hover:opacity-100">
                          <GripIcon />
                        </span>
                        {(isNew || isMoved) && (
                          <span className="absolute right-2 top-2 rounded-full bg-brand-orange px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-white">
                            {isNew ? "New" : "Moved"}
                          </span>
                        )}
                        <span className="break-words text-sm font-medium leading-snug text-foreground">
                          {task.title}
                        </span>
                        {task.tag && (
                          <span
                            className={`w-fit rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${TAG_STYLE[task.tag]}`}
                          >
                            {TAG_LABEL[task.tag]}
                          </span>
                        )}
                        {task.description && (
                          <p className="line-clamp-2 break-words text-xs text-foreground/50">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-foreground/50">
                          <span className="flex items-center gap-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                            <span className="capitalize">{task.priority}</span>
                          </span>
                          {assigneeNames.length > 0 && (
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              {assigneeNames.map((name) => (
                                <span key={name} className="flex items-center gap-1">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[9px] font-semibold text-white">
                                    {name[0]?.toUpperCase()}
                                  </span>
                                  <span className="truncate">{name}</span>
                                </span>
                              ))}
                            </span>
                          )}
                          {task.checklist.length > 0 && (
                            <span className="ml-auto shrink-0">
                              <ChecklistProgress done={done} total={task.checklist.length} />
                            </span>
                          )}
                          {isAdmin && col.status === "done" && task.comments.length > 0 && (
                            <span
                              className={`flex shrink-0 items-center gap-1 rounded-full bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-brand-orange ${
                                task.checklist.length > 0 ? "" : "ml-auto"
                              }`}
                              title={`${task.comments.length} comment${task.comments.length > 1 ? "s" : ""} — open to review`}
                            >
                              <ChatIcon />
                              {task.comments.length}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      {creatingStatus && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={createTask}
            className="clay flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[var(--surface-border)] bg-[var(--surface)] p-6 pb-3">
            <h2 className="text-lg font-semibold">
              New Task —{" "}
              {COLUMNS.find((c) => c.status === creatingStatus)?.label}
            </h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground/50">
                Title <span className="text-brand-red">*</span>
              </label>
              <input
                autoFocus
                placeholder="Title"
                className={`clay-well px-3 py-2 outline-none ${
                  titleError ? "border-brand-red" : ""
                }`}
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value });
                  if (titleError) setTitleError(false);
                }}
              />
              {titleError && (
                <span className="text-xs text-brand-red">Title is required.</span>
              )}
            </div>
            <textarea
              placeholder="Description"
              rows={3}
              className="clay-well min-h-20 resize-y break-words px-3 py-2 outline-none"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                className="clay-well w-full min-w-0 px-3 py-2 outline-none"
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <select
                className="clay-well w-full min-w-0 px-3 py-2 outline-none"
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value as Tag | "" })}
              >
                <option value="">No tag</option>
                <option value="development">Development</option>
                <option value="qa-review">QA Review</option>
              </select>
            </div>
            <AssigneePicker
              users={users}
              selected={form.assignedTo}
              onToggle={(email) =>
                setForm((f) => ({ ...f, assignedTo: toggleAssignee(f.assignedTo, email) }))
              }
            />
            </div>

            <div className="flex flex-col gap-3 p-6 pt-3">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setNewChecklistOn((v) => !v)}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium text-foreground/80">Add checklist</span>
                <span
                  className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
                    newChecklistOn ? "bg-brand-navy" : "bg-[var(--surface-muted)]"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      newChecklistOn ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>

              {newChecklistOn && (
                <div className="clay-well flex flex-col gap-2 p-3">
                  {newChecklist.map((item) => (
                    <div key={item.id} className="clay flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 break-words">{item.text}</span>
                      <button
                        type="button"
                        aria-label="Remove checklist item"
                        title="Remove checklist item"
                        onClick={() => removeNewChecklistItem(item.id)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-brand-red hover:bg-brand-red/10"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <textarea
                      placeholder="Add checklist item"
                      rows={1}
                      className="max-h-32 flex-1 resize-none break-words bg-transparent px-2 py-1 text-sm outline-none"
                      value={newChecklistDraft}
                      onChange={(e) => setNewChecklistDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          addNewChecklistItem();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="clay-btn px-3 py-1 text-xs"
                      onClick={addNewChecklistItem}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="clay-btn px-4 py-2 text-sm"
                onClick={resetCreateForm}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="clay-btn bg-brand-navy px-4 py-2 text-sm text-white"
              >
                Create
              </button>
            </div>
            </div>
          </form>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="clay flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-2 p-6 pb-3">
              {editing ? (
                <input
                  autoFocus
                  className="flex-1 bg-transparent text-lg font-semibold outline-none"
                  value={active.title}
                  onChange={(e) => refreshTask(active.id, { title: e.target.value })}
                />
              ) : (
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{active.title}</h2>
                  <p className="mt-1 text-xs text-foreground/50">
                    {COLUMNS.find((c) => c.status === active.status)?.label}
                  </p>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={`rounded-sm px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLE[active.priority]}`}
                >
                  {active.priority}
                </span>
                {active.tag && (
                  <span
                    className={`rounded-sm px-2 py-0.5 text-xs font-medium ${TAG_STYLE[active.tag]}`}
                  >
                    {TAG_LABEL[active.tag]}
                  </span>
                )}
                {active.status !== "done" && (
                  <button
                    type="button"
                    aria-label={editing ? "Done editing" : "Edit task"}
                    title={editing ? "Done editing" : "Edit task"}
                    onClick={() => setEditing((v) => !v)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-foreground/60 hover:bg-[var(--surface-muted)]"
                  >
                    {editing ? <CheckIcon /> : <PencilIcon />}
                  </button>
                )}
                {(isAdmin || active.createdBy === userEmail) && (
                  <button
                    type="button"
                    aria-label="Delete task"
                    title="Delete task"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-brand-red hover:bg-brand-red/10"
                  >
                    <TrashIcon />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={() => setActiveId(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-foreground/60 hover:bg-[var(--surface-muted)]"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1.3fr_1fr]">
            <div className="flex flex-col gap-3 overflow-y-auto p-6 pt-0 md:border-r md:border-[var(--surface-border)]">
            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[var(--surface-border)] bg-[var(--surface)] pb-3 pt-3">
            {editing ? (
              <>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="clay-well min-h-20 resize-y break-words px-3 py-2 outline-none"
                  value={active.description}
                  onChange={(e) => refreshTask(active.id, { description: e.target.value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <select
                    className="clay-well w-full min-w-0 px-3 py-2 outline-none"
                    value={active.priority}
                    onChange={(e) =>
                      refreshTask(active.id, { priority: e.target.value as Priority })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <select
                    className="clay-well w-full min-w-0 px-3 py-2 outline-none"
                    value={active.status}
                    onChange={(e) =>
                      refreshTask(active.id, { status: e.target.value as Status })
                    }
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.status} value={c.status}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="clay-well w-full min-w-0 px-3 py-2 outline-none"
                    value={active.tag ?? ""}
                    onChange={(e) =>
                      refreshTask(active.id, { tag: (e.target.value || null) as Tag | null })
                    }
                  >
                    <option value="">No tag</option>
                    <option value="development">Development</option>
                    <option value="qa-review">QA Review</option>
                  </select>
                </div>
                <AssigneePicker
                  users={users}
                  selected={active.assignedTo}
                  onToggle={(email) =>
                    refreshTask(active.id, { assignedTo: toggleAssignee(active.assignedTo, email) })
                  }
                />
              </>
            ) : (
              <>
                {active.description && (
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground/70">
                    {active.description}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-foreground/40">Assigned to</p>
                    {active.assignedTo.length > 0 ? (
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        {active.assignedTo.map(assigneeLabel).map((name) => (
                          <span key={name} className="flex items-center gap-1 text-foreground/80">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[9px] font-semibold text-white">
                              {name[0]?.toUpperCase()}
                            </span>
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-foreground/80">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-foreground/40">Created</p>
                    <p className="text-foreground/80">
                      {new Date(active.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </>
            )}
            </div>

            <div className="clay-well flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground/60">Checklist</h3>
                {active.checklist.length > 0 && (
                  <div className="w-32">
                    <ChecklistProgress
                      done={active.checklist.filter((c) => c.done).length}
                      total={active.checklist.length}
                    />
                  </div>
                )}
              </div>
              {active.checklist.map((item) => (
                <label
                  key={item.id}
                  className="clay flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={active.status === "done"}
                    onChange={() => toggleChecklistItem(item.id)}
                  />
                  <span
                    className={
                      item.done
                        ? "min-w-0 flex-1 break-words line-through opacity-50"
                        : "min-w-0 flex-1 break-words"
                    }
                  >
                    {item.text}
                  </span>
                  {active.status !== "done" && (
                    <button
                      type="button"
                      aria-label="Remove checklist item"
                      title="Remove checklist item"
                      onClick={() => removeChecklistItem(item.id)}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-brand-red hover:bg-brand-red/10"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </label>
              ))}
              {active.status !== "done" && (
                <div className="flex gap-2">
                  <textarea
                    placeholder="Add checklist item"
                    rows={1}
                    className="max-h-32 flex-1 resize-none break-words bg-transparent px-2 py-1 text-sm outline-none"
                    value={checklistDraft}
                    onChange={(e) => setChecklistDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        addChecklistItem();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="clay-btn px-3 py-1 text-xs"
                    onClick={addChecklistItem}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto p-6 pt-4 md:pt-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground/60">History</h3>
              {active.history.length === 0 ? (
                <p className="text-xs text-foreground/40">No activity yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {[...active.history].reverse().map((entry) => (
                    <li key={entry.id} className="text-xs text-foreground/60">
                      <span className="font-medium text-foreground/80">
                        {assigneeLabel(entry.actor)}
                      </span>{" "}
                      {entry.message.toLowerCase()} ·{" "}
                      <span className="text-foreground/40">
                        {new Date(entry.at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground/60">Comments</h3>
              {active.comments.length > 0 && (
                <ul className="flex flex-col gap-2.5">
                  {active.comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="border-b border-[var(--surface-border)] pb-2.5 text-sm last:border-none last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground/80">
                          {assigneeLabel(comment.author)}
                        </span>
                        <span className="text-[10px] text-foreground/40">
                          {new Date(comment.at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-foreground/70">
                        {comment.text}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="clay-well flex gap-2 px-2 py-1">
                <input
                  placeholder="Add a comment"
                  className="flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentDraft.trim()) {
                      e.preventDefault();
                      addComment(active.id, commentDraft.trim());
                      setCommentDraft("");
                    }
                  }}
                />
                <button
                  type="button"
                  className="clay-btn px-3 py-1 text-xs"
                  disabled={!commentDraft.trim()}
                  onClick={() => {
                    addComment(active.id, commentDraft.trim());
                    setCommentDraft("");
                  }}
                >
                  Post
                </button>
              </div>
            </div>
            </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete task"
        description={active ? `Delete "${active.title}"? This can't be undone.` : undefined}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          if (active) removeTask(active.id);
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </main>
  );
}
