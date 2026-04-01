-- Estende employee_requests con tipo "ferie" (giorni di ferie registrati).
-- Esegui su Supabase dopo SUPABASE_GEOFENCE_AND_REQUESTS.sql
--
-- ➜ Usa invece SUPABASE_APPLY_ALL.sql (include già questo aggiornamento).

alter table public.employee_requests
  drop constraint if exists employee_requests_request_type_check;

alter table public.employee_requests
  add constraint employee_requests_request_type_check
  check (request_type in ('trasferta', 'malattia', 'ferie'));

comment on column public.employee_requests.request_type is 'trasferta | malattia | ferie';
