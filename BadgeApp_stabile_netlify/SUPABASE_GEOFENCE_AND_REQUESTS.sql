-- BadgeApp - Geofence centralizzata (web/mobile) + richieste trasferte/malattie
-- Non elimina dati esistenti.
--
-- ➜ Versione unica aggiornata (consigliata): SUPABASE_APPLY_ALL.sql

-- 1) Geofence web centralizzata
create table if not exists public.geofence_settings (
  id integer primary key,
  address text default '',
  center_lat double precision not null default 0,
  center_lng double precision not null default 0,
  radius_entry_meters double precision not null default 120,
  radius_exit_meters double precision not null default 120,
  max_accuracy_meters double precision not null default 60,
  polygon_path jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.geofence_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.geofence_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'geofence_settings' and policyname = 'geofence_read_authenticated'
  ) then
    create policy geofence_read_authenticated
      on public.geofence_settings
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'geofence_settings' and policyname = 'geofence_update_admin'
  ) then
    create policy geofence_update_admin
      on public.geofence_settings
      for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and coalesce(p.is_admin, false) = true
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and coalesce(p.is_admin, false) = true
        )
      );
  end if;
end
$$;

-- 2) Richieste trasferte/malattie
create table if not exists public.employee_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('trasferta', 'malattia', 'ferie')),
  start_date date not null,
  end_date date not null,
  note text,
  travel_hours double precision,
  total_hours_declared double precision,
  trasferta_scope text check (trasferta_scope is null or trasferta_scope in ('TI', 'TE')),
  status text not null default 'saved' check (status in ('pending', 'approved', 'rejected', 'saved')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_requests_dates_ok check (end_date >= start_date)
);

create index if not exists employee_requests_user_created_idx
  on public.employee_requests (user_id, created_at desc);

alter table public.employee_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'employee_requests' and policyname = 'employee_requests_select_own_or_admin'
  ) then
    create policy employee_requests_select_own_or_admin
      on public.employee_requests
      for select
      to authenticated
      using (
        auth.uid() = user_id
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and coalesce(p.is_admin, false) = true
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'employee_requests' and policyname = 'employee_requests_insert_own'
  ) then
    create policy employee_requests_insert_own
      on public.employee_requests
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'employee_requests' and policyname = 'employee_requests_update_admin'
  ) then
    create policy employee_requests_update_admin
      on public.employee_requests
      for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and coalesce(p.is_admin, false) = true
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and coalesce(p.is_admin, false) = true
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'employee_requests' and policyname = 'employee_requests_update_own'
  ) then
    create policy employee_requests_update_own
      on public.employee_requests
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
