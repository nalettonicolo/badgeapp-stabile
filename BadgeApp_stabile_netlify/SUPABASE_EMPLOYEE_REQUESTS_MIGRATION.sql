-- BadgeApp - Migrazione employee_requests: ore viaggio, ore totali dichiarate, stato "saved"
-- Esegui su DB già creati con la versione precedente dello script.

alter table public.employee_requests
  add column if not exists travel_hours double precision,
  add column if not exists total_hours_declared double precision;

-- Rimuovi vincolo status se presente e ricrea con 'saved'
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'employee_requests_status_check'
      and conrelid = 'public.employee_requests'::regclass
  ) then
    alter table public.employee_requests drop constraint employee_requests_status_check;
  end if;
exception
  when undefined_object then null;
end
$$;

alter table public.employee_requests
  add constraint employee_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'saved'));

alter table public.employee_requests
  alter column status set default 'saved';

-- Utente può aggiornare i propri record (salvataggio modifiche)
do $$
begin
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

comment on column public.employee_requests.travel_hours is 'Ore di viaggio (solo trasferta, monitoraggio).';
comment on column public.employee_requests.total_hours_declared is 'Ore totali dichiarate in trasferta (incluse viaggio), solo monitoraggio.';

-- TI = trasferta Italia, TE = trasferta estera (da modulo / lista orari)
alter table public.employee_requests
  add column if not exists trasferta_scope text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_requests_trasferta_scope_check'
      and conrelid = 'public.employee_requests'::regclass
  ) then
    alter table public.employee_requests
      add constraint employee_requests_trasferta_scope_check
      check (trasferta_scope is null or trasferta_scope in ('TI', 'TE'));
  end if;
end
$$;

comment on column public.employee_requests.trasferta_scope is 'TI trasferta Italia, TE trasferta estera.';
