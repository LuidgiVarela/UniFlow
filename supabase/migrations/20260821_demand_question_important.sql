alter table public.demand_questions
  add column if not exists important boolean not null default false;
