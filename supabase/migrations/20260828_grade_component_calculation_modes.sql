alter table public.grade_components
  drop constraint if exists grade_components_calculation_check;

alter table public.grade_components
  add constraint grade_components_calculation_check
  check (calculation in ('average', 'weighted'));
