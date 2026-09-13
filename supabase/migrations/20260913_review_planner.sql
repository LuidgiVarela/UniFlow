create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  target_type text not null check (target_type in ('topic', 'material')),
  target_title text not null,
  topic_id uuid references public.topics(id) on delete set null,
  assessment_id uuid references public.assessments(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  action text not null check (action in ('completed', 'postponed', 'auto_rescheduled')),
  scheduled_for date not null,
  resulting_review_date date,
  mastery_level smallint check (mastery_level between 0 and 3),
  created_at timestamptz not null default now()
);

create table if not exists public.review_day_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  capacity smallint not null default 3 check (capacity between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);

alter table public.review_events enable row level security;
alter table public.review_day_plans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_events'
      and policyname = 'Users can read own review events'
  ) then
    create policy "Users can read own review events"
      on public.review_events for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_events'
      and policyname = 'Users can insert own review events'
  ) then
    create policy "Users can insert own review events"
      on public.review_events for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.subjects
          where subjects.id = review_events.subject_id
            and subjects.user_id = auth.uid()
        )
        and (
          review_events.topic_id is null
          or exists (
            select 1 from public.topics
            where topics.id = review_events.topic_id
              and topics.user_id = auth.uid()
          )
        )
        and (
          review_events.assessment_id is null
          or exists (
            select 1 from public.assessments
            where assessments.id = review_events.assessment_id
              and assessments.user_id = auth.uid()
          )
        )
        and (
          review_events.material_id is null
          or exists (
            select 1 from public.materials
            where materials.id = review_events.material_id
              and materials.user_id = auth.uid()
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_day_plans'
      and policyname = 'Users can read own review day plans'
  ) then
    create policy "Users can read own review day plans"
      on public.review_day_plans for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_day_plans'
      and policyname = 'Users can insert own review day plans'
  ) then
    create policy "Users can insert own review day plans"
      on public.review_day_plans for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_day_plans'
      and policyname = 'Users can update own review day plans'
  ) then
    create policy "Users can update own review day plans"
      on public.review_day_plans for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists review_events_user_created_at_idx
  on public.review_events(user_id, created_at desc);

create index if not exists review_events_user_scheduled_for_idx
  on public.review_events(user_id, scheduled_for);
