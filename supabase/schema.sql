create extension if not exists "pgcrypto";

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text not null,
  professor text,
  color text not null default '#205e5c',
  status text not null default 'tranquilo' check (status in ('tranquilo', 'atencao', 'prioridade', 'atrasado')),
  notes text,
  classroom text,
  schedule text,
  total_classes integer,
  absences_count integer not null default 0,
  professor_progress integer,
  student_progress integer,
  professor_position text,
  student_position text,
  sort_order integer,
  created_at timestamptz not null default now()
);

alter table public.subjects add column if not exists absences_count integer not null default 0;

create table if not exists public.demands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  type text not null check (type in ('prova', 'trabalho', 'lista', 'exercicio', 'leitura', 'apresentacao', 'outro')),
  description text,
  due_date date,
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluido')),
  total_items integer,
  completed_items integer,
  constraint demands_total_items_non_negative check (total_items is null or total_items >= 0),
  constraint demands_completed_items_non_negative check (completed_items is null or completed_items >= 0),
  constraint demands_completed_items_not_greater_than_total check (
    total_items is null
    or completed_items is null
    or completed_items <= total_items
  ),
  constraint demands_total_positive_when_completed_exists check (
    completed_items is null
    or total_items is null
    or total_items > 0
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.demand_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  demand_id uuid not null references public.demands(id) on delete cascade,
  label text not null,
  difficulty text not null default 'media' check (difficulty in ('facil', 'media', 'dificil')),
  important boolean not null default false,
  notes text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.demand_questions add column if not exists important boolean not null default false;

create table if not exists public.demand_question_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.demand_questions(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  important boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.demand_question_items add column if not exists important boolean not null default false;

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'estudando', 'concluido')),
  order_index integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.grade_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  weight numeric,
  expected_count integer,
  calculation text not null default 'average' check (calculation in ('average', 'weighted')),
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  grade_component_id uuid references public.grade_components(id) on delete set null,
  name text not null,
  type text not null default 'prova' check (type in ('prova', 'trabalho', 'lista', 'projeto', 'seminario', 'outro')),
  date date,
  weight numeric,
  max_score numeric,
  score numeric,
  description text,
  status text not null default 'futura' check (status in ('futura', 'realizada', 'corrigida')),
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

create table if not exists public.assessment_topics (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assessment_id, topic_id)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  folder_id uuid,
  name text not null,
  type text not null check (type in ('file', 'link')),
  file_path text,
  url text,
  sort_order integer,
  created_at timestamptz not null default now()
);

create table if not exists public.material_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  parent_folder_id uuid,
  name text not null,
  sort_order integer,
  created_at timestamptz not null default now()
);

alter table public.materials add column if not exists folder_id uuid;
alter table public.materials add column if not exists sort_order integer;
alter table public.material_folders add column if not exists parent_folder_id uuid;
alter table public.material_folders add column if not exists sort_order integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_folder_id_fkey'
  ) then
    alter table public.materials
      add constraint materials_folder_id_fkey
      foreign key (folder_id)
      references public.material_folders(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_folders_parent_folder_id_fkey'
  ) then
    alter table public.material_folders
      add constraint material_folders_parent_folder_id_fkey
      foreign key (parent_folder_id)
      references public.material_folders(id)
      on delete set null;
  end if;
end $$;

alter table public.subjects enable row level security;
alter table public.demands enable row level security;
alter table public.demand_questions enable row level security;
alter table public.demand_question_items enable row level security;
alter table public.topics enable row level security;
alter table public.grade_components enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_topics enable row level security;
alter table public.materials enable row level security;
alter table public.material_folders enable row level security;

create policy "Users can read own subjects" on public.subjects for select using (auth.uid() = user_id);
create policy "Users can insert own subjects" on public.subjects for insert with check (auth.uid() = user_id);
create policy "Users can update own subjects" on public.subjects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own subjects" on public.subjects for delete using (auth.uid() = user_id);

create policy "Users can read own demands" on public.demands for select using (auth.uid() = user_id);
create policy "Users can insert own demands" on public.demands for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = demands.subject_id and subjects.user_id = auth.uid())
);
create policy "Users can update own demands" on public.demands for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = demands.subject_id and subjects.user_id = auth.uid())
);
create policy "Users can delete own demands" on public.demands for delete using (auth.uid() = user_id);

create policy "Users can read own demand questions" on public.demand_questions for select using (auth.uid() = user_id);
create policy "Users can insert own demand questions" on public.demand_questions for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.demands where demands.id = demand_questions.demand_id and demands.user_id = auth.uid())
);
create policy "Users can update own demand questions" on public.demand_questions for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.demands where demands.id = demand_questions.demand_id and demands.user_id = auth.uid())
);
create policy "Users can delete own demand questions" on public.demand_questions for delete using (auth.uid() = user_id);

create policy "Users can read own demand question items" on public.demand_question_items for select using (auth.uid() = user_id);
create policy "Users can insert own demand question items" on public.demand_question_items for insert with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.demand_questions
    where demand_questions.id = demand_question_items.question_id
      and demand_questions.user_id = auth.uid()
  )
);
create policy "Users can update own demand question items" on public.demand_question_items for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.demand_questions
    where demand_questions.id = demand_question_items.question_id
      and demand_questions.user_id = auth.uid()
  )
);
create policy "Users can delete own demand question items" on public.demand_question_items for delete using (auth.uid() = user_id);

create policy "Users can read own topics" on public.topics for select using (auth.uid() = user_id);
create policy "Users can insert own topics" on public.topics for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = topics.subject_id and subjects.user_id = auth.uid())
);
create policy "Users can update own topics" on public.topics for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = topics.subject_id and subjects.user_id = auth.uid())
);
create policy "Users can delete own topics" on public.topics for delete using (auth.uid() = user_id);

create policy "Users can read own grade components" on public.grade_components for select using (auth.uid() = user_id);
create policy "Users can insert own grade components" on public.grade_components for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = grade_components.subject_id and subjects.user_id = auth.uid())
);
create policy "Users can update own grade components" on public.grade_components for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = grade_components.subject_id and subjects.user_id = auth.uid())
);
create policy "Users can delete own grade components" on public.grade_components for delete using (auth.uid() = user_id);

create policy "Users can read own assessments" on public.assessments for select using (auth.uid() = user_id);
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
create policy "Users can delete own assessments" on public.assessments for delete using (auth.uid() = user_id);

create policy "Users can read own assessment topics" on public.assessment_topics for select using (auth.uid() = user_id);
create policy "Users can insert own assessment topics" on public.assessment_topics for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.assessments where assessments.id = assessment_topics.assessment_id and assessments.user_id = auth.uid())
  and exists (select 1 from public.topics where topics.id = assessment_topics.topic_id and topics.user_id = auth.uid())
);
create policy "Users can delete own assessment topics" on public.assessment_topics for delete using (auth.uid() = user_id);

create policy "Users can read own materials" on public.materials for select using (auth.uid() = user_id);
create policy "Users can insert own materials" on public.materials for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = materials.subject_id and subjects.user_id = auth.uid())
  and (
    folder_id is null
    or exists (select 1 from public.material_folders where material_folders.id = materials.folder_id and material_folders.user_id = auth.uid())
  )
);
create policy "Users can update own materials" on public.materials for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = materials.subject_id and subjects.user_id = auth.uid())
  and (
    folder_id is null
    or exists (select 1 from public.material_folders where material_folders.id = materials.folder_id and material_folders.user_id = auth.uid())
  )
);
create policy "Users can delete own materials" on public.materials for delete using (auth.uid() = user_id);

create policy "Users can read own material folders" on public.material_folders for select using (auth.uid() = user_id);
create policy "Users can insert own material folders" on public.material_folders for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = material_folders.subject_id and subjects.user_id = auth.uid())
  and (
    parent_folder_id is null
    or exists (
      select 1
      from public.material_folders parent
      where parent.id = material_folders.parent_folder_id
        and parent.user_id = auth.uid()
        and parent.subject_id = material_folders.subject_id
    )
  )
);
create policy "Users can update own material folders" on public.material_folders for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.subjects where subjects.id = material_folders.subject_id and subjects.user_id = auth.uid())
  and (
    parent_folder_id is null
    or exists (
      select 1
      from public.material_folders parent
      where parent.id = material_folders.parent_folder_id
        and parent.user_id = auth.uid()
        and parent.subject_id = material_folders.subject_id
    )
  )
);
create policy "Users can delete own material folders" on public.material_folders for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('subject-materials', 'subject-materials', false)
on conflict (id) do nothing;

create policy "Users can read own subject material files"
  on storage.objects for select
  using (bucket_id = 'subject-materials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can upload own subject material files"
  on storage.objects for insert
  with check (bucket_id = 'subject-materials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own subject material files"
  on storage.objects for delete
  using (bucket_id = 'subject-materials' and auth.uid()::text = (storage.foldername(name))[1]);

create index if not exists subjects_user_id_idx on public.subjects(user_id);
create index if not exists subjects_user_id_sort_order_idx on public.subjects(user_id, sort_order);
create index if not exists demands_user_id_due_date_idx on public.demands(user_id, due_date);
create index if not exists demand_questions_demand_id_idx on public.demand_questions(demand_id);
create index if not exists demand_question_items_question_id_idx on public.demand_question_items(question_id);
create index if not exists topics_subject_id_idx on public.topics(subject_id);
create index if not exists grade_components_subject_id_idx on public.grade_components(subject_id);
create index if not exists grade_components_user_id_subject_id_idx on public.grade_components(user_id, subject_id);
create index if not exists assessments_subject_id_idx on public.assessments(subject_id);
create index if not exists assessments_grade_component_id_idx on public.assessments(grade_component_id);
create index if not exists assessments_user_id_date_idx on public.assessments(user_id, date);
create index if not exists assessment_topics_topic_id_idx on public.assessment_topics(topic_id);
create index if not exists materials_subject_id_idx on public.materials(subject_id);
create index if not exists material_folders_subject_id_idx on public.material_folders(subject_id);
create index if not exists material_folders_subject_sort_order_idx on public.material_folders(subject_id, sort_order);
create index if not exists material_folders_parent_folder_id_idx on public.material_folders(parent_folder_id);
create index if not exists material_folders_parent_sort_order_idx on public.material_folders(subject_id, parent_folder_id, sort_order);
create index if not exists materials_folder_id_idx on public.materials(folder_id);
create index if not exists materials_folder_sort_order_idx on public.materials(folder_id, sort_order);
