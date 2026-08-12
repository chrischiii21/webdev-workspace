import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Session-bound client (RLS applies as the calling user). Use in Server
// Components, Route Handlers and Server Actions.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render -- middleware already
            // refreshes the session, so a failed write here is harmless.
          }
        },
      },
    },
  );
}

// Service-role client: bypasses RLS entirely via the Auth Admin API.
// Server-only -- SUPABASE_SERVICE_ROLE_KEY must never reach the browser.
// Only call this after verifying the caller is an admin.
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}
