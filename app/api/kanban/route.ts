import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks, type Priority } from "@/lib/kanbanStore";
import { logEvent } from "@/lib/activityLog";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const priority: Priority = ["low", "medium", "high"].includes(body.priority)
    ? body.priority
    : "medium";

  const task = await createTask(
    {
      title,
      description: typeof body.description === "string" ? body.description : "",
      priority,
      assignedTo: typeof body.assignedTo === "string" ? body.assignedTo : "",
    },
    user.email ?? user.id,
  );
  logEvent(user.email ?? user.id, "created task", task.title);
  return NextResponse.json({ task }, { status: 201 });
}
