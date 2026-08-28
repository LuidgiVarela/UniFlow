create table if not exists public.grade_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  weight numeric,
  expected_count integer,
  calculation text not null default 'average' check (calculation in ('average')),
  created_at timestamptz not null default now()
);

alter table public.assessments add column if not exists grade_component_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assessments_grade_component_id_fkey'
  ) then
    alter table public.assessments
      add constraint assessments_grade_component_id_fkey
      foreign key (grade_component_id)
      references public.grade_components(id)
      on delete set null;
  end if;
end $$;

alter table public.grade_components enable row level security;

drop policy if exists "Users can read own grade components" on public.grade_components;
drop policy if exists "Users can insert own grade components" on public.grade_components;
drop policy if exists "Users can update own grade components" on public.grade_components;
drop policy if exists "Users can delete own grade components" on public.grade_components;

create policy "Users can read own grade components"
  on public.grade_components for select
  using (auth.uid() = user_id);

create policy "Users can insert own grade components"
  on public.grade_components for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.subjects
      where subjects.id = grade_components.subject_id
        and subjects.user_id = auth.uid()
    )
  );

create policy "Users can update own grade components"
  on public.grade_components for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.subjects
      where subjects.id = grade_components.subject_id
        and subjects.user_id = auth.uid()
    )
  );

create policy "Users can delete own grade components"
  on public.grade_components for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own assessments" on public.assessments;
drop policy if exists "Users can update own assessments" on public.assessments;

create policy "Users can insert own assessments" on public.assessments for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = assessments.subject_id and subjects.user_id = auth.uid())
  and (
    grade_component_id is null
    or exists (
      select 1
      from public.grade_components
      where grade_components.id = assessments.grade_component_id
        and grade_components.user_id = auth.uid()
        and grade_components.subject_id = assessments.subject_id
    )
  )
);

create policy "Users can update own assessments" on public.assessments for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = assessments.subject_id and subjects.user_id = auth.uid())
  and (
    grade_component_id is null
    or exists (
      select 1
      from public.grade_components
      where grade_components.id = assessments.grade_component_id
        and grade_components.user_id = auth.uid()
        and grade_components.subject_id = assessments.subject_id
    )
  )
);

create index if not exists grade_components_subject_id_idx on public.grade_components(subject_id);
create index if not exists grade_components_user_id_subject_id_idx on public.grade_components(user_id, subject_id);
create index if not exists assessments_grade_component_id_idx on public.assessments(grade_component_id);
