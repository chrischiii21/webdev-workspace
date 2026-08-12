"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmploymentType, Role } from "@/lib/roles";

export default function AddUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("developer");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("employee");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role, employmentType }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create user.");
      setLoading(false);
      return;
    }
    setEmail("");
    setName("");
    setLoading(false);
    setCreated({ email: data.email, password: data.password });
    router.refresh();
  }

  if (created) {
    return (
      <div className="flex flex-col gap-3 p-4 clay">
        <p className="text-sm text-foreground">
          Account created for <span className="font-medium">{created.email}</span>. Share this
          password with them directly -- it won&apos;t be shown again.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 text-sm text-foreground clay-well">{created.password}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(created.password);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="px-3 py-2 text-xs font-medium text-foreground clay-btn"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCreated(null)}
          className="self-start bg-brand-navy px-4 py-2 text-sm font-semibold text-white clay-btn"
        >
          Add another user
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 p-4 clay">
      <label className="flex flex-1 min-w-40 flex-col gap-1 text-sm">
        Name
        <input
          required
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 text-sm text-foreground outline-none clay-well"
        />
      </label>
      <label className="flex flex-1 min-w-48 flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          required
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 text-sm text-foreground outline-none clay-well"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="px-3 py-2 text-sm text-foreground outline-none clay-well"
        >
          <option value="developer">Developer</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Type
        <select
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
          className="px-3 py-2 text-sm text-foreground outline-none clay-well"
        >
          <option value="employee">Employee</option>
          <option value="intern">Intern</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={loading}
        className="bg-brand-navy px-4 py-2 text-sm font-semibold text-white clay-btn disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create user"}
      </button>
      {error && <p className="w-full bg-brand-red/10 px-3 py-2 text-xs text-brand-red">{error}</p>}
    </form>
  );
}
