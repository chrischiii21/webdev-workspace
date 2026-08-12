import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteReport } from "@/lib/eodStore";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const ok = await deleteReport(id, user.email ?? user.id);
  if (!ok) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
