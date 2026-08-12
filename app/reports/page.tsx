"use client";

import { useEffect, useMemo, useState } from "react";

interface EodReport {
  id: string;
  author: string;
  authorName: string | null;
  date: string;
  didToday: string;
  nextUp: string;
  createdAt: string;
  updatedAt: string;
}

type EmploymentType = "intern" | "employee";
const GROUPS: { type: EmploymentType; label: string }[] = [
  { type: "employee", label: "Employees" },
  { type: "intern", label: "Interns" },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function authorLabel(r: EodReport) {
  return r.authorName || r.author;
}

function timestampLabel(r: EodReport) {
  const edited = r.updatedAt !== r.createdAt;
  const at = new Date(edited ? r.updatedAt : r.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${edited ? "Updated" : "Added"} ${at}`;
}

function buildStandupText(
  date: string,
  reports: EodReport[],
  employmentByEmail: Record<string, EmploymentType>,
) {
  const lines = [`Daily Standup — ${formatDate(date)}`, ""];
  for (const group of GROUPS) {
    const groupReports = reports.filter(
      (r) => (employmentByEmail[r.author] ?? "employee") === group.type,
    );
    if (groupReports.length === 0) continue;
    lines.push(`${group.label}:`);
    for (const r of groupReports) {
      lines.push(`  ${authorLabel(r)}`);
      lines.push(`    Did: ${r.didToday}`);
      lines.push(`    Next: ${r.nextUp || "—"}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export default function ReportsPage() {
  const [date, setDate] = useState(todayStr());
  const [reports, setReports] = useState<EodReport[]>([]);
  const [employmentByEmail, setEmploymentByEmail] = useState<Record<string, EmploymentType>>({});
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [didToday, setDidToday] = useState("");
  const [nextUp, setNextUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        const users: { email: string; employmentType: EmploymentType }[] = data.users ?? [];
        setEmploymentByEmail(Object.fromEntries(users.map((u) => [u.email, u.employmentType])));
      });
  }, []);

  useEffect(() => {
    fetch(`/api/reports?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        const list: EodReport[] = data.reports ?? [];
        setReports(list);
        setMe(data.me ?? "");
        const mine = list.find((r) => r.author === data.me);
        setDidToday(mine?.didToday ?? "");
        setNextUp(mine?.nextUp ?? "");
      })
      .finally(() => setLoading(false));
  }, [date]);

  const myReport = useMemo(() => reports.find((r) => r.author === me), [reports, me]);
  const standupText = useMemo(
    () => buildStandupText(date, reports, employmentByEmail),
    [date, reports, employmentByEmail],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, didToday, nextUp }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to save report.");
      return;
    }
    setReports((prev) => {
      const rest = prev.filter((r) => r.author !== data.report.author);
      return [...rest, data.report];
    });
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">EOD Reports</h1>
          <p className="text-sm text-foreground/60">Daily standup: what got done, what&apos;s next</p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="clay-well px-3 py-2 text-sm outline-none"
          />
        </label>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 clay">
        <p className="text-sm font-semibold text-foreground">
          {myReport ? "Update your report" : "Submit your report"} for {formatDate(date)}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            What you did today
            <textarea
              required
              rows={5}
              value={didToday}
              onChange={(e) => setDidToday(e.target.value)}
              placeholder="Shipped the login redirect fix, reviewed PR #42..."
              className="px-3 py-2 text-sm text-foreground outline-none clay-well"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            What&apos;s next
            <textarea
              rows={5}
              value={nextUp}
              onChange={(e) => setNextUp(e.target.value)}
              placeholder="Start on the reports API, follow up with QA..."
              className="px-3 py-2 text-sm text-foreground outline-none clay-well"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="self-start bg-brand-navy px-4 py-2 text-sm font-semibold text-white clay-btn disabled:opacity-50"
        >
          {saving ? "Saving..." : myReport ? "Update report" : "Save report"}
        </button>
        {error && <p className="bg-brand-red/10 px-3 py-2 text-xs text-brand-red">{error}</p>}
      </form>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/80">
          Team standup ({reports.length})
        </h2>
        <button
          type="button"
          disabled={reports.length === 0}
          onClick={async () => {
            await navigator.clipboard.writeText(standupText);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="px-3 py-1.5 text-xs font-medium text-foreground clay-btn disabled:opacity-50"
        >
          {copied ? "Copied!" : "Copy unified report"}
        </button>
      </div>

      {!loading && reports.length === 0 && (
        <p className="text-sm text-foreground/40">No reports submitted for this day yet.</p>
      )}

      {GROUPS.map((group) => {
        const groupReports = reports.filter(
          (r) => (employmentByEmail[r.author] ?? "employee") === group.type,
        );
        if (groupReports.length === 0) return null;
        return (
          <div key={group.type} className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
              {group.label} ({groupReports.length})
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {groupReports.map((r) => (
                <div key={r.id} className="clay flex flex-col gap-2 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{authorLabel(r)}</p>
                    <p className="shrink-0 text-[10px] text-foreground/40">{timestampLabel(r)}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="text-sm text-foreground/70">
                      <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">
                        Did
                      </p>
                      <p className="whitespace-pre-wrap">{r.didToday}</p>
                    </div>
                    {r.nextUp && (
                      <div className="text-sm text-foreground/70">
                        <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">
                          Next
                        </p>
                        <p className="whitespace-pre-wrap">{r.nextUp}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </main>
  );
}
