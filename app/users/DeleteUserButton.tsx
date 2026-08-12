"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/app/components/ConfirmDialog";

export default function DeleteUserButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to delete user.");
      setLoading(false);
      return;
    }
    setConfirmOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${email}`}
        title="Delete user"
        onClick={() => setConfirmOpen(true)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-brand-red hover:bg-brand-red/10"
      >
        <TrashIcon />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete user"
        description={error ?? `Delete ${email}? This can't be undone.`}
        confirmLabel="Delete"
        danger
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </>
  );
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
