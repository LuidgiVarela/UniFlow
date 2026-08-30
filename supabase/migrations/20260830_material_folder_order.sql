alter table public.material_folders
  add column if not exists sort_order integer;

create index if not exists material_folders_subject_sort_order_idx
  on public.material_folders(subject_id, sort_order);
