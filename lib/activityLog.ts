import { createClient } from "@/lib/supabase/server";

export interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}

const MAX_EVENTS = 500;

export async function logEvent(actor: string, action: string, target: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("activity_events").insert({ actor, action, target });
  if (error) throw error;
}

// ponytail: table isn't trimmed on write anymore (Postgres storage is cheap
// at this volume) -- listEvents just caps what it reads. Add a cron/trigger
// to prune old rows if the table ever gets large enough to matter.
export async function listEvents(): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .order("at", { ascending: false })
    .limit(MAX_EVENTS);
  if (error) throw error;
  return (data as ActivityEvent[]).map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    target: row.target,
    at: row.at,
  }));
}
