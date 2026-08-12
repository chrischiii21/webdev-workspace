import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { employmentTypeOf, nameOf } from "@/lib/roles";
import { EodReport, listReports, upsertReport } from "@/lib/eodStore";

function toBullets(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ type: "TextBlock", text: `• ${line}`, wrap: true, spacing: "None" }));
}

function postToTeams(report: EodReport) {
  const webhookUrl = process.env.TEAMS_EOD_WEBHOOK_URL;
  if (!webhookUrl) return;
  const who = report.authorName || report.author;
  const dateLabel = new Date(`${report.date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // This workflow trigger renders the POST body as a card directly, not a
  // plain-text payload -- it must be a full Adaptive Card.
  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `EOD Reports — ${dateLabel}`,
        weight: "Bolder",
        size: "Medium",
        wrap: true,
      },
      { type: "TextBlock", text: who, isSubtle: true, spacing: "None", wrap: true },
      { type: "TextBlock", text: "What I did today", weight: "Bolder", spacing: "Medium", wrap: true },
      ...toBullets(report.didToday),
      ...(report.nextUp
        ? [
            { type: "TextBlock", text: "What's next", weight: "Bolder", spacing: "Medium", wrap: true },
            ...toBullets(report.nextUp),
          ]
        : []),
    ],
  };
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  }).catch((err) => console.error("Teams webhook post failed:", err));
}

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

  if (employmentTypeOf(user.app_metadata) === "employee") postToTeams(report);

  return NextResponse.json({ report });
}
