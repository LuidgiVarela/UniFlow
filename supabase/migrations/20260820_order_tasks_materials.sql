alter table public.subjects add column if not exists sort_order integer;

with ordered as (
  select id, row_number() over (partition by user_id order by created_at) as rn
  from public.subjects
)
update public.subjects
set sort_order = ordered.rn
from ordered
where public.subjects.id = ordered.id
  and public.subjects.sort_order is null;

alter table public.demands alter column due_date drop not null;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  type text not null check (type in ('file', 'link')),
  file_path text,
  url text,
  created_at timestamptz not null default now()
);

alter table public.materials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'materials' and policyname = 'Users can read own materials'
  ) then
    create policy "Users can read own materials"
      on public.materials for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'materials' and policyname = 'Users can insert own materials'
  ) then
    create policy "Users can insert own materials"
      on public.materials for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.subjects
          where subjects.id = materials.subject_id
          and subjects.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'materials' and policyname = 'Users can update own materials'
  ) then
    create policy "Users can update own materials"
      on public.materials for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.subjects
          where subjects.id = materials.subject_id
          and subjects.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'materials' and policyname = 'Users can delete own materials'
  ) then
    create policy "Users can delete own materials"
      on public.materials for delete
      using (auth.uid() = user_id);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('subject-materials', 'subject-materials', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can read own subject material files'
  ) then
    create policy "Users can read own subject material files"
      on storage.objects for select
      using (bucket_id = 'subject-materials' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can upload own subject material files'
  ) then
    create policy "Users can upload own subject material files"
      on storage.objects for insert
      with check (bucket_id = 'subject-materials' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can delete own subject material files'
  ) then
    create policy "Users can delete own subject material files"
      on storage.objects for delete
      using (bucket_id = 'subject-materials' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;

create index if not exists subjects_user_id_sort_order_idx on public.subjects(user_id, sort_order);
create index if not exists materials_subject_id_idx on public.materials(subject_id);
