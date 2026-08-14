-- Lets a task be labeled Development or QA Review, shown on its card.
alter table public.tasks
  add column tag text check (tag in ('development', 'qa-review'));
