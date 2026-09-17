create table if not exists public.study_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  demand_id uuid not null references public.demands(id) on delete cascade,
  title text not null,
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, demand_id)
);

alter table public.study_documents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_documents'
      and policyname = 'Users can read own study documents'
  ) then
    create policy "Users can read own study documents"
      on public.study_documents for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_documents'
      and policyname = 'Users can insert own study documents'
  ) then
    create policy "Users can insert own study documents"
      on public.study_documents for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.demands
          where demands.id = study_documents.demand_id
            and demands.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_documents'
      and policyname = 'Users can update own study documents'
  ) then
    create policy "Users can update own study documents"
      on public.study_documents for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.demands
          where demands.id = study_documents.demand_id
            and demands.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_documents'
      and policyname = 'Users can delete own study documents'
  ) then
    create policy "Users can delete own study documents"
      on public.study_documents for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists study_documents_user_updated_idx
  on public.study_documents(user_id, updated_at desc);
