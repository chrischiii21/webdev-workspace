"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { BULLET, SUB_BULLET, parseBulletLines, sanitizeBulletText } from "@/lib/bulletText";

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

// Today's "what's next" is what gets read out at tomorrow's DSU.
function buildDsuText(date: string, reports: EodReport[]) {
  const lines = [`DSU Report — ${formatDate(date)}`, ""];
  for (const r of [...reports].sort((a, b) => authorLabel(a).localeCompare(authorLabel(b)))) {
    lines.push(`${authorLabel(r)}: ${r.nextUp || "—"}`);
  }
  return lines.join("\n").trim();
}

function currentLineRange(value: string, cursor: number) {
  const start = value.lastIndexOf("\n", cursor - 1) + 1;
  const nextBreak = value.indexOf("\n", cursor);
  return { start, end: nextBreak === -1 ? value.length : nextBreak };
}

// Enter continues the list at the current level (or exits it if the bullet
// is empty); Tab/Shift+Tab demote/promote the current line between a main
// bullet and a sub-bullet.
function handleBulletKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  onChange: (next: string) => void,
) {
  const el = e.currentTarget;
  const cursor = el.selectionStart;
  const value = el.value;
  const { start, end } = currentLineRange(value, cursor);
  const line = value.slice(start, end);
  const prefix = line.startsWith(SUB_BULLET) ? SUB_BULLET : line.startsWith(BULLET) ? BULLET : "";

  if (e.key === "Tab") {
    e.preventDefault();
    if (!prefix) return;
    if (e.shiftKey ? prefix !== SUB_BULLET : prefix !== BULLET) return;
    const swapped = e.shiftKey ? BULLET : SUB_BULLET;
    const next = value.slice(0, start) + swapped + line.slice(prefix.length) + value.slice(end);
    onChange(next);
    const delta = swapped.length - prefix.length;
    requestAnimationFrame(() => el.setSelectionRange(cursor + delta, cursor + delta));
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    const content = line.slice(prefix.length);
    if (prefix && content.trim() === "") {
      const next = value.slice(0, start) + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(start, start));
      return;
    }
    const insert = "\n" + (prefix || BULLET);
    const next = value.slice(0, cursor) + insert + value.slice(cursor);
    onChange(next);
    const pos = cursor + insert.length;
    requestAnimationFrame(() => el.setSelectionRange(pos, pos));
  }
}

// Multi-line pastes get bulletized to match; a single-line paste just drops
// in inline (no reason to force a bullet mid-sentence).
function handleBulletPaste(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  onChange: (next: string) => void,
) {
  const pasted = e.clipboardData.getData("text");
  if (!pasted.includes("\n")) return;
  e.preventDefault();
  const el = e.currentTarget;
  const value = el.value;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const bulletized = parseBulletLines(pasted)
    .map(({ level, text }) => (level === 1 ? SUB_BULLET : BULLET) + text)
    .join("\n");
  onChange(value.slice(0, start) + bulletized + value.slice(end));
}

function BulletTextarea({
  value,
  onChange,
  className,
  placeholder,
  required,
  rows,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <textarea
      required={required}
      rows={rows}
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => {
        if (e.currentTarget.value === "") {
          onChange(BULLET);
          requestAnimationFrame(() => e.currentTarget.setSelectionRange(BULLET.length, BULLET.length));
        }
      }}
      onBlur={(e) => onChange(sanitizeBulletText(e.currentTarget.value))}
      onKeyDown={(e) => handleBulletKeyDown(e, onChange)}
      onPaste={(e) => handleBulletPaste(e, onChange)}
    />
  );
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
  const [showDsu, setShowDsu] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        // Sanitized on load too, so an older plain-text report (predating
        // this format) shows up bulleted, same as anything typed fresh.
        setDidToday(mine ? sanitizeBulletText(mine.didToday) : "");
        setNextUp(mine ? sanitizeBulletText(mine.nextUp) : "");
      })
      .finally(() => setLoading(false));
  }, [date]);

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    const res = await fetch(`/api/reports/${confirmDeleteId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to delete report.");
      setConfirmDeleteId(null);
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== confirmDeleteId));
    setDidToday("");
    setNextUp("");
    setConfirmDeleteId(null);
  }

  const myReport = useMemo(() => reports.find((r) => r.author === me), [reports, me]);
  const dsuText = useMemo(() => buildDsuText(date, reports), [date, reports]);
  const dsuOrder = useMemo(
    () => [...reports].sort((a, b) => authorLabel(a).localeCompare(authorLabel(b))),
    [reports],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanDidToday = sanitizeBulletText(didToday);
    const cleanNextUp = sanitizeBulletText(nextUp);
    setDidToday(cleanDidToday);
    setNextUp(cleanNextUp);
    setSaving(true);
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, didToday: cleanDidToday, nextUp: cleanNextUp }),
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
            <BulletTextarea
              required
              rows={5}
              value={didToday}
              onChange={setDidToday}
              placeholder={"Shipped the login redirect fix\nReviewed PR #42\n(Tab to add a sub-bullet)"}
              className="px-3 py-2 text-sm text-foreground outline-none clay-well"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            What&apos;s next
            <BulletTextarea
              rows={5}
              value={nextUp}
              onChange={setNextUp}
              placeholder={"Start on the reports API\nFollow up with QA"}
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
          onClick={() => setShowDsu(true)}
          className="px-3 py-1.5 text-xs font-medium text-foreground clay-btn disabled:opacity-50"
        >
          DSU report
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
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-[10px] text-foreground/40">{timestampLabel(r)}</p>
                      {r.author === me && (
                        <button
                          type="button"
                          aria-label="Delete report"
                          title="Delete report"
                          onClick={() => setConfirmDeleteId(r.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-brand-red hover:bg-brand-red/10"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
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

      {showDsu && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowDsu(false)}
        >
          <div
            className="clay flex w-full max-w-lg flex-col gap-3 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">DSU Report</h2>
                <p className="text-xs text-foreground/50">
                  What&apos;s next for {formatDate(date)} — read at tomorrow&apos;s standup
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDsu(false)}
                aria-label="Close"
                className="text-foreground/40 hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {dsuOrder.map((r) => (
                <div key={r.id} className="clay-well px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">{authorLabel(r)}</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground/70">
                    {r.nextUp || "—"}
                  </p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(dsuText);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="self-start px-3 py-1.5 text-xs font-medium text-foreground clay-btn"
            >
              {copied ? "Copied!" : "Copy as text"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete report"
        description="Delete this report? This can't be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </main>
  );
}
