alter table public.subjects
  add column if not exists absences_count integer not null default 0;
