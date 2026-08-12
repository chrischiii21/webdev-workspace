import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nameOf } from "@/lib/roles";
import { listReports, upsertReport } from "@/lib/eodStore";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Everyone (dev and admin) can see everyone's reports.
  const reports = await listReports();
  const date = req.nextUrl.searchParams.get("date");
  const filtered = date ? reports.filter((r) => r.date === date) : reports;

  return NextResponse.json({ reports: filtered, me: user.email });
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
  const didToday = typeof body.didToday === "string" ? body.didToday.trim() : "";
  const nextUp = typeof body.nextUp === "string" ? body.nextUp.trim() : "";
  const date =
    typeof body.date === "string" && body.date ? body.date : new Date().toISOString().slice(0, 10);

  if (!didToday) {
    return NextResponse.json({ error: "What you did today is required." }, { status: 400 });
  }

  const report = await upsertReport({
    author: user.email ?? user.id,
    authorName: nameOf(user.app_metadata),
    date,
    didToday,
    nextUp,
  });

  return NextResponse.json({ report });
}
