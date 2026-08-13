import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { employmentTypeOf, nameOf, roleOf, type EmploymentType, type Role } from "@/lib/roles";
import { generatePassword } from "@/lib/generatePassword";
import { logEvent } from "@/lib/activityLog";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    name: nameOf(u.app_metadata),
    employmentType: employmentTypeOf(u.app_metadata),
  }));
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || roleOf(user.app_metadata) !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role: Role =
    body.role === "admin" ? "admin" : body.role === "manager" ? "manager" : "developer";
  const employmentType: EmploymentType = body.employmentType === "intern" ? "intern" : "employee";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const password = generatePassword();
  const admin = createAdminClient();
  // Internal tool, no email sending involved -- the account is created
  // outright (email_confirm: true) and the admin shares the password
  // directly with whoever it's for.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role, employment_type: employmentType, generated_password: password, name: name || undefined },
  });
  if (error || !created.user) {
    return NextResponse.json({ error: error?.message ?? "Failed to create user." }, { status: 400 });
  }

  logEvent(user.email ?? user.id, "created user", `${email} (${role}, ${employmentType})`);
  return NextResponse.json({ email, password });
}
