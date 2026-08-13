"use client";

import { useState } from "react";

export default function PasswordCell({
  password,
  restricted,
}: {
  password: string | null;
  restricted?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  if (restricted) return <span className="text-xs text-foreground/30">Restricted</span>;
  if (!password) return <span className="text-foreground/30">—</span>;

  async function copy() {
    await navigator.clipboard.writeText(password!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title={copied ? "Copied!" : "Click to copy"}
        onClick={copy}
        className="rounded-sm px-1.5 py-0.5 font-mono text-foreground/70 hover:bg-[var(--surface-muted)]"
      >
        {copied ? "Copied!" : visible ? password : "••••••••"}
      </button>
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
        className="text-foreground/40 hover:text-foreground/70"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M2.5 2.5l15 15M8.3 5.2C8.85 5.07 9.42 5 10 5c5.5 0 8.5 5.5 8.5 5.5a13.8 13.8 0 0 1-3.06 3.68M11.9 12.06a2.5 2.5 0 0 1-3.53-3.54M5.6 6.6C3.02 8.28 1.5 10.5 1.5 10.5S4.5 16 10 16c1.03 0 1.98-.19 2.85-.51"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
