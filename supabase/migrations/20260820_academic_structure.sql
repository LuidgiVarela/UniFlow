alter table public.subjects add column if not exists classroom text;
alter table public.subjects add column if not exists schedule text;
alter table public.subjects add column if not exists total_classes integer;
alter table public.subjects add column if not exists professor_progress integer;
alter table public.subjects add column if not exists student_progress integer;

alter table public.topics add column if not exists notes text;

alter table public.assessments add column if not exists type text not null default 'prova';
alter table public.assessments add column if not exists description text;
alter table public.assessments add column if not exists status text not null default 'futura';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessments_type_check'
  ) then
    alter table public.assessments
      add constraint assessments_type_check
      check (type in ('prova', 'trabalho', 'lista', 'projeto', 'seminario', 'outro'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assessments_status_check'
  ) then
    alter table public.assessments
      add constraint assessments_status_check
      check (status in ('futura', 'realizada', 'corrigida'));
  end if;
end $$;

create table if not exists public.assessment_topics (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assessment_id, topic_id)
);

alter table public.assessment_topics enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_topics'
      and policyname = 'Users can read own assessment topics'
  ) then
    create policy "Users can read own assessment topics"
      on public.assessment_topics for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_topics'
      and policyname = 'Users can insert own assessment topics'
  ) then
    create policy "Users can insert own assessment topics"
      on public.assessment_topics for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.assessments
          where assessments.id = assessment_topics.assessment_id
          and assessments.user_id = auth.uid()
        )
        and exists (
          select 1 from public.topics
          where topics.id = assessment_topics.topic_id
          and topics.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_topics'
      and policyname = 'Users can delete own assessment topics'
  ) then
    create policy "Users can delete own assessment topics"
      on public.assessment_topics for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists assessments_user_id_date_idx on public.assessments(user_id, date);
create index if not exists assessment_topics_topic_id_idx on public.assessment_topics(topic_id);
