alter table public.materials
  add column if not exists sort_order integer;

with ordered as (
  select
    id,
    row_number() over (
      partition by subject_id, folder_id
      order by created_at desc
    ) as position
  from public.materials
)
update public.materials
set sort_order = ordered.position
from ordered
where public.materials.id = ordered.id
  and public.materials.sort_order is null;

create index if not exists materials_folder_sort_order_idx
  on public.materials(folder_id, sort_order);
