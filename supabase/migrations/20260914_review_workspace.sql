create table if not exists public.review_queue_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  queue_date date not null,
  target_key text not null,
  target_type text not null check (target_type in ('topic', 'material')),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete cascade,
  material_id uuid references public.materials(id) on delete cascade,
  state text not null default 'available'
    check (state in ('available', 'planned', 'dismissed', 'completed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, queue_date, target_key),
  check (
    (target_type = 'topic' and topic_id is not null and material_id is null)
    or (target_type = 'material' and material_id is not null and topic_id is null)
  )
);

create table if not exists public.topic_prerequisites (
  topic_id uuid not null references public.topics(id) on delete cascade,
  prerequisite_topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_id, prerequisite_topic_id),
  check (topic_id <> prerequisite_topic_id)
);

create table if not exists public.subject_class_progress (
  subject_id uuid primary key references public.subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  page_number integer check (page_number is null or page_number >= 1),
  note text,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_queue_items enable row level security;
alter table public.topic_prerequisites enable row level security;
alter table public.subject_class_progress enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_queue_items'
      and policyname = 'Users can read own review queue items'
  ) then
    create policy "Users can read own review queue items"
      on public.review_queue_items for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_queue_items'
      and policyname = 'Users can insert own review queue items'
  ) then
    create policy "Users can insert own review queue items"
      on public.review_queue_items for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.subjects
          where subjects.id = review_queue_items.subject_id
            and subjects.user_id = auth.uid()
        )
        and (
          topic_id is null
          or exists (
            select 1 from public.topics
            where topics.id = review_queue_items.topic_id
              and topics.subject_id = review_queue_items.subject_id
              and topics.user_id = auth.uid()
          )
        )
        and (
          assessment_id is null
          or exists (
            select 1 from public.assessments
            where assessments.id = review_queue_items.assessment_id
              and assessments.subject_id = review_queue_items.subject_id
              and assessments.user_id = auth.uid()
          )
        )
        and (
          material_id is null
          or exists (
            select 1 from public.materials
            where materials.id = review_queue_items.material_id
              and materials.subject_id = review_queue_items.subject_id
              and materials.user_id = auth.uid()
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_queue_items'
      and policyname = 'Users can update own review queue items'
  ) then
    create policy "Users can update own review queue items"
      on public.review_queue_items for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.subjects
          where subjects.id = review_queue_items.subject_id
            and subjects.user_id = auth.uid()
        )
        and (
          topic_id is null
          or exists (
            select 1 from public.topics
            where topics.id = review_queue_items.topic_id
              and topics.subject_id = review_queue_items.subject_id
              and topics.user_id = auth.uid()
          )
        )
        and (
          assessment_id is null
          or exists (
            select 1 from public.assessments
            where assessments.id = review_queue_items.assessment_id
              and assessments.subject_id = review_queue_items.subject_id
              and assessments.user_id = auth.uid()
          )
        )
        and (
          material_id is null
          or exists (
            select 1 from public.materials
            where materials.id = review_queue_items.material_id
              and materials.subject_id = review_queue_items.subject_id
              and materials.user_id = auth.uid()
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'topic_prerequisites'
      and policyname = 'Users can read own topic prerequisites'
  ) then
    create policy "Users can read own topic prerequisites"
      on public.topic_prerequisites for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'topic_prerequisites'
      and policyname = 'Users can insert own topic prerequisites'
  ) then
    create policy "Users can insert own topic prerequisites"
      on public.topic_prerequisites for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.topics topic
          join public.topics prerequisite
            on prerequisite.id = topic_prerequisites.prerequisite_topic_id
          where topic.id = topic_prerequisites.topic_id
            and topic.user_id = auth.uid()
            and prerequisite.user_id = auth.uid()
            and topic.subject_id = prerequisite.subject_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'topic_prerequisites'
      and policyname = 'Users can delete own topic prerequisites'
  ) then
    create policy "Users can delete own topic prerequisites"
      on public.topic_prerequisites for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subject_class_progress'
      and policyname = 'Users can read own class progress'
  ) then
    create policy "Users can read own class progress"
      on public.subject_class_progress for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subject_class_progress'
      and policyname = 'Users can insert own class progress'
  ) then
    create policy "Users can insert own class progress"
      on public.subject_class_progress for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.subjects
          where subjects.id = subject_class_progress.subject_id
            and subjects.user_id = auth.uid()
        )
        and (
          material_id is null
          or exists (
            select 1 from public.materials
            where materials.id = subject_class_progress.material_id
              and materials.user_id = auth.uid()
              and materials.subject_id = subject_class_progress.subject_id
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subject_class_progress'
      and policyname = 'Users can update own class progress'
  ) then
    create policy "Users can update own class progress"
      on public.subject_class_progress for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.subjects
          where subjects.id = subject_class_progress.subject_id
            and subjects.user_id = auth.uid()
        )
        and (
          material_id is null
          or exists (
            select 1 from public.materials
            where materials.id = subject_class_progress.material_id
              and materials.user_id = auth.uid()
              and materials.subject_id = subject_class_progress.subject_id
          )
        )
      );
  end if;
end $$;

create index if not exists review_queue_items_user_date_state_idx
  on public.review_queue_items(user_id, queue_date, state, sort_order);

create index if not exists topic_prerequisites_prerequisite_idx
  on public.topic_prerequisites(prerequisite_topic_id);

create index if not exists subject_class_progress_user_idx
  on public.subject_class_progress(user_id);
