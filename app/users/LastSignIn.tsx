"use client";

// Server Components render on Vercel's server (UTC), so toLocaleString()
// there formats in UTC instead of the visitor's timezone. This intentionally
// renders differently between the server pass and the client hydration pass
// (window is only defined client-side) so the browser's local timezone wins;
// suppressHydrationWarning tells React that mismatch is expected here.
export default function LastSignIn({ iso }: { iso: string | null }) {
  if (!iso) return <span>Never</span>;
  return (
    <span suppressHydrationWarning>
      {typeof window !== "undefined" ? new Date(iso).toLocaleString() : "—"}
    </span>
  );
}
