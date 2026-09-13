alter table public.topics
  add column if not exists mastery_level smallint,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists next_review_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'topics_mastery_level_check'
      and conrelid = 'public.topics'::regclass
  ) then
    alter table public.topics
      add constraint topics_mastery_level_check
      check (mastery_level between 0 and 3);
  end if;
end $$;

create index if not exists topics_user_next_review_date_idx
  on public.topics(user_id, next_review_date);
