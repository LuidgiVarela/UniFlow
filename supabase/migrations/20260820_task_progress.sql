alter table public.demands add column if not exists total_items integer;
alter table public.demands add column if not exists completed_items integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demands_total_items_non_negative'
  ) then
    alter table public.demands
      add constraint demands_total_items_non_negative
      check (total_items is null or total_items >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'demands_completed_items_non_negative'
  ) then
    alter table public.demands
      add constraint demands_completed_items_non_negative
      check (completed_items is null or completed_items >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'demands_completed_items_not_greater_than_total'
  ) then
    alter table public.demands
      add constraint demands_completed_items_not_greater_than_total
      check (
        total_items is null
        or completed_items is null
        or completed_items <= total_items
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'demands_total_positive_when_completed_exists'
  ) then
    alter table public.demands
      add constraint demands_total_positive_when_completed_exists
      check (
        completed_items is null
        or total_items is null
        or total_items > 0
      );
  end if;
end $$;
