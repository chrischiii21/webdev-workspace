import { NextRequest, NextResponse } from "next/server";
import { deleteTask, listTasks, updateTask } from "@/lib/kanbanStore";
import { logEvent } from "@/lib/activityLog";
import { createClient } from "@/lib/supabase/server";
import { canAccessTask } from "@/lib/roles";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const existing = (await listTasks()).find((t) => t.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!canAccessTask(existing.assignedTo, user.app_metadata, user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const patch = await req.json();
  const task = await updateTask(id, patch, user.email ?? user.id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const action = patch.status === "done" ? "completed task" : "updated task";
  logEvent(user.email ?? user.id, action, task.title);
  return NextResponse.json({ task });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const existing = (await listTasks()).find((t) => t.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!canAccessTask(existing.assignedTo, user.app_metadata, user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const ok = await deleteTask(id);
  if (!ok) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  logEvent(user.email ?? user.id, "deleted task", existing?.title ?? id);
  return NextResponse.json({ ok: true });
}
