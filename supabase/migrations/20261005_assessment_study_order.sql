create table if not exists public.assessment_study_orders (
  assessment_id uuid primary key references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_keys text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.assessment_study_orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_study_orders'
      and policyname = 'Users can read own assessment study order'
  ) then
    create policy "Users can read own assessment study order"
      on public.assessment_study_orders for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_study_orders'
      and policyname = 'Users can insert own assessment study order'
  ) then
    create policy "Users can insert own assessment study order"
      on public.assessment_study_orders for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.assessments
          where assessments.id = assessment_study_orders.assessment_id
            and assessments.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_study_orders'
      and policyname = 'Users can update own assessment study order'
  ) then
    create policy "Users can update own assessment study order"
      on public.assessment_study_orders for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.assessments
          where assessments.id = assessment_study_orders.assessment_id
            and assessments.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assessment_study_orders'
      and policyname = 'Users can delete own assessment study order'
  ) then
    create policy "Users can delete own assessment study order"
      on public.assessment_study_orders for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists assessment_study_orders_user_updated_idx
  on public.assessment_study_orders(user_id, updated_at desc);
