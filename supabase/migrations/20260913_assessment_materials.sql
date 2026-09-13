create table if not exists public.assessment_materials (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mastery_level smallint check (mastery_level between 0 and 3),
  last_reviewed_at timestamptz,
  next_review_date date,
  created_at timestamptz not null default now(),
  primary key (assessment_id, material_id)
);

alter table public.assessment_materials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_materials'
      and policyname = 'Users can read own assessment materials'
  ) then
    create policy "Users can read own assessment materials"
      on public.assessment_materials for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_materials'
      and policyname = 'Users can insert own assessment materials'
  ) then
    create policy "Users can insert own assessment materials"
      on public.assessment_materials for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.assessments assessment
          join public.materials material
            on material.id = assessment_materials.material_id
          where assessment.id = assessment_materials.assessment_id
            and assessment.user_id = auth.uid()
            and material.user_id = auth.uid()
            and assessment.subject_id = material.subject_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_materials'
      and policyname = 'Users can update own assessment materials'
  ) then
    create policy "Users can update own assessment materials"
      on public.assessment_materials for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.assessments assessment
          join public.materials material
            on material.id = assessment_materials.material_id
          where assessment.id = assessment_materials.assessment_id
            and assessment.user_id = auth.uid()
            and material.user_id = auth.uid()
            and assessment.subject_id = material.subject_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_materials'
      and policyname = 'Users can delete own assessment materials'
  ) then
    create policy "Users can delete own assessment materials"
      on public.assessment_materials for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists assessment_materials_material_id_idx
  on public.assessment_materials(material_id);

create index if not exists assessment_materials_user_next_review_date_idx
  on public.assessment_materials(user_id, next_review_date);
