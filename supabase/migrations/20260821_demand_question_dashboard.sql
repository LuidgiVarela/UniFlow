create table if not exists public.demand_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  demand_id uuid not null references public.demands(id) on delete cascade,
  label text not null,
  difficulty text not null default 'media' check (difficulty in ('facil', 'media', 'dificil')),
  notes text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.demand_question_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.demand_questions(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.demand_questions enable row level security;
alter table public.demand_question_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_questions'
      and policyname = 'Users can read own demand questions'
  ) then
    create policy "Users can read own demand questions"
      on public.demand_questions for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_questions'
      and policyname = 'Users can insert own demand questions'
  ) then
    create policy "Users can insert own demand questions"
      on public.demand_questions for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.demands
          where demands.id = demand_questions.demand_id
            and demands.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_questions'
      and policyname = 'Users can update own demand questions'
  ) then
    create policy "Users can update own demand questions"
      on public.demand_questions for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.demands
          where demands.id = demand_questions.demand_id
            and demands.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_questions'
      and policyname = 'Users can delete own demand questions'
  ) then
    create policy "Users can delete own demand questions"
      on public.demand_questions for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_question_items'
      and policyname = 'Users can read own demand question items'
  ) then
    create policy "Users can read own demand question items"
      on public.demand_question_items for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_question_items'
      and policyname = 'Users can insert own demand question items'
  ) then
    create policy "Users can insert own demand question items"
      on public.demand_question_items for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.demand_questions
          where demand_questions.id = demand_question_items.question_id
            and demand_questions.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_question_items'
      and policyname = 'Users can update own demand question items'
  ) then
    create policy "Users can update own demand question items"
      on public.demand_question_items for update
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.demand_questions
          where demand_questions.id = demand_question_items.question_id
            and demand_questions.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'demand_question_items'
      and policyname = 'Users can delete own demand question items'
  ) then
    create policy "Users can delete own demand question items"
      on public.demand_question_items for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists demand_questions_demand_id_idx on public.demand_questions(demand_id);
create index if not exists demand_question_items_question_id_idx on public.demand_question_items(question_id);
