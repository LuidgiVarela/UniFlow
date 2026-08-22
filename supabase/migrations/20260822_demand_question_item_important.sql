alter table public.demand_question_items
  add column if not exists important boolean not null default false;
