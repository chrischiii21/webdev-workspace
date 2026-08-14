-- Tracks who created each task so non-admins can be restricted to deleting
-- only their own tasks (not ones created by an admin).
alter table public.tasks
  add column created_by text not null default '';

update public.tasks
  set created_by = history->0->>'actor'
  where created_by = '' and jsonb_array_length(history) > 0;
