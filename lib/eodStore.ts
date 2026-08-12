import { createClient } from "@/lib/supabase/server";

export interface EodReport {
  id: string;
  author: string;
  authorName: string | null;
  date: string; // YYYY-MM-DD
  didToday: string;
  nextUp: string;
  createdAt: string;
  updatedAt: string;
}

interface EodReportRow {
  id: string;
  author: string;
  author_name: string | null;
  date: string;
  did_today: string;
  next_up: string;
  created_at: string;
  updated_at: string;
}

function fromRow(row: EodReportRow): EodReport {
  return {
    id: row.id,
    author: row.author,
    authorName: row.author_name,
    date: row.date,
    didToday: row.did_today,
    nextUp: row.next_up,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listReports(): Promise<EodReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eod_reports")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as EodReportRow[]).map(fromRow);
}

// One report per author per day -- resubmitting the same day updates it in place.
export async function upsertReport(input: {
  author: string;
  authorName: string | null;
  date: string;
  didToday: string;
  nextUp: string;
}): Promise<EodReport> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eod_reports")
    .upsert(
      {
        author: input.author,
        author_name: input.authorName,
        date: input.date,
        did_today: input.didToday,
        next_up: input.nextUp,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "author,date" },
    )
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as EodReportRow);
}

// Scoped to the requesting author so one person can't delete someone else's report.
export async function deleteReport(id: string, author: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eod_reports")
    .delete()
    .eq("id", id)
    .eq("author", author)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
