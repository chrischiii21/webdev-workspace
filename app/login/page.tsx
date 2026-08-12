"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4 p-6 clay">
        <div>
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-sm bg-brand-navy text-sm font-bold text-white">
            W
          </div>
          <h1 className="text-lg font-semibold text-foreground">WebDev Workspace</h1>
          <p className="text-sm text-foreground/60">Sign in to continue</p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 text-sm text-foreground outline-none clay-well"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2 text-sm text-foreground outline-none clay-well"
          />
        </label>

        {error && <p className="bg-brand-red/10 px-3 py-2 text-xs text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white clay-btn disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
