import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Vercel serverless functions cap request bodies at 4.5MB, so files above
// that go straight to Supabase Storage from the browser instead of through
// /api/optimize -- this mints the signed upload URL for that path.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { filename } = await request.json();
  if (typeof filename !== "string" || !filename) {
    return NextResponse.json({ error: "Missing filename." }, { status: 400 });
  }

  const path = `${crypto.randomUUID()}-${filename}`;
  const { data, error } = await createAdminClient()
    .storage.from("optimizer-uploads")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't prepare upload." }, { status: 502 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
