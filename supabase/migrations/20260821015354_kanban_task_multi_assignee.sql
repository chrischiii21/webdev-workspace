-- Tasks can now have multiple assignees; assigned_to becomes an array.
-- Existing single-email values map to a one-element array ('' -> {}).

alter table public.tasks
  alter column assigned_to drop default,
  alter column assigned_to type text[]
    using case when assigned_to = '' then '{}'::text[] else array[assigned_to] end,
  alter column assigned_to set default '{}'::text[];
