alter table public.material_folders
  add column if not exists parent_folder_id uuid;

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

drop policy if exists "Users can insert own material folders" on public.material_folders;
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

drop policy if exists "Users can update own material folders" on public.material_folders;
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

create index if not exists material_folders_parent_folder_id_idx
  on public.material_folders(parent_folder_id);

create index if not exists material_folders_parent_sort_order_idx
  on public.material_folders(subject_id, parent_folder_id, sort_order);
