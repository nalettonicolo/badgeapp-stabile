-- Solo colonna TI/TE (Italia / Estera) per employee_requests — se hai già eseguito le migrazioni precedenti.

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

comment on column public.employee_requests.trasferta_scope is 'TI = trasferta Italia, TE = trasferta estera.';
