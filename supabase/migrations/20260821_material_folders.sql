create table if not exists public.material_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.materials add column if not exists folder_id uuid;

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

alter table public.material_folders enable row level security;

drop policy if exists "Users can insert own materials" on public.materials;
create policy "Users can insert own materials"
  on public.materials for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.subjects
      where subjects.id = materials.subject_id
        and subjects.user_id = auth.uid()
    )
    and (
      folder_id is null
      or exists (
        select 1
        from public.material_folders
        where material_folders.id = materials.folder_id
          and material_folders.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can update own materials" on public.materials;
create policy "Users can update own materials"
  on public.materials for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.subjects
      where subjects.id = materials.subject_id
        and subjects.user_id = auth.uid()
    )
    and (
      folder_id is null
      or exists (
        select 1
        from public.material_folders
        where material_folders.id = materials.folder_id
          and material_folders.user_id = auth.uid()
      )
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'material_folders'
      and policyname = 'Users can read own material folders'
  ) then
    create policy "Users can read own material folders"
      on public.material_folders for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'material_folders'
      and policyname = 'Users can insert own material folders'
  ) then
    create policy "Users can insert own material folders"
      on public.material_folders for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.subjects
          where subjects.id = material_folders.subject_id
            and subjects.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'material_folders'
      and policyname = 'Users can update own material folders'
  ) then
    create policy "Users can update own material folders"
      on public.material_folders for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.subjects
          where subjects.id = material_folders.subject_id
            and subjects.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'material_folders'
      and policyname = 'Users can delete own material folders'
  ) then
    create policy "Users can delete own material folders"
      on public.material_folders for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists material_folders_subject_id_idx on public.material_folders(subject_id);
create index if not exists materials_folder_id_idx on public.materials(folder_id);
