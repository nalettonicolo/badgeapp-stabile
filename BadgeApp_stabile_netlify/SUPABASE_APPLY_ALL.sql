-- =============================================================================
-- BadgeApp / Timbrature Online — schema aggiornato (un solo file da eseguire)
-- Progetto Supabase: pobrjdrqpzerjlcqnpra
--
-- Supabase → SQL Editor → incolla tutto → Run (una volta, o dopo aggiornamenti)
-- Idempotente: non cancella dati; aggiunge tabelle/colonne/vincoli mancanti.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Geofence centralizzata (web + mobile)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geofence_settings (
  id integer PRIMARY KEY,
  address text DEFAULT '',
  center_lat double precision NOT NULL DEFAULT 0,
  center_lng double precision NOT NULL DEFAULT 0,
  radius_entry_meters double precision NOT NULL DEFAULT 120,
  radius_exit_meters double precision NOT NULL DEFAULT 120,
  max_accuracy_meters double precision NOT NULL DEFAULT 60,
  polygon_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.geofence_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.geofence_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geofence_settings'
      AND policyname = 'geofence_read_authenticated'
  ) THEN
    CREATE POLICY geofence_read_authenticated
      ON public.geofence_settings
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geofence_settings'
      AND policyname = 'geofence_update_admin'
  ) THEN
    CREATE POLICY geofence_update_admin
      ON public.geofence_settings
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
        )
      );
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2) Richieste dipendente: trasferta, malattia, ferie
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  request_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  travel_hours double precision,
  total_hours_declared double precision,
  trasferta_scope text,
  status text NOT NULL DEFAULT 'saved',
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_requests_dates_ok CHECK (end_date >= start_date)
);

-- Migrazione: database creati con versioni vecchie (solo colonne / vincoli mancanti)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employee_requests'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'employee_requests'
        AND column_name = 'trasferta_scope'
    ) THEN
      ALTER TABLE public.employee_requests ADD COLUMN trasferta_scope text;
    END IF;
  END IF;
END
$$;

-- Vincoli check (nome stabile) — aggiorna anche tabelle già esistenti
ALTER TABLE public.employee_requests
  DROP CONSTRAINT IF EXISTS employee_requests_request_type_check;

ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_request_type_check
  CHECK (request_type IN ('trasferta', 'malattia', 'ferie'));

ALTER TABLE public.employee_requests
  DROP CONSTRAINT IF EXISTS employee_requests_trasferta_scope_check;

ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_trasferta_scope_check
  CHECK (trasferta_scope IS NULL OR trasferta_scope IN ('TI', 'TE'));

ALTER TABLE public.employee_requests
  DROP CONSTRAINT IF EXISTS employee_requests_status_check;

ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'saved'));

CREATE INDEX IF NOT EXISTS employee_requests_user_created_idx
  ON public.employee_requests (user_id, created_at DESC);

ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.employee_requests.request_type IS 'trasferta | malattia | ferie';
COMMENT ON COLUMN public.employee_requests.trasferta_scope IS 'TI = Italia, TE = estero';

-- -----------------------------------------------------------------------------
-- 3) RLS employee_requests
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_requests'
      AND policyname = 'employee_requests_select_own_or_admin'
  ) THEN
    CREATE POLICY employee_requests_select_own_or_admin
      ON public.employee_requests
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_requests'
      AND policyname = 'employee_requests_insert_own'
  ) THEN
    CREATE POLICY employee_requests_insert_own
      ON public.employee_requests
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_requests'
      AND policyname = 'employee_requests_update_admin'
  ) THEN
    CREATE POLICY employee_requests_update_admin
      ON public.employee_requests
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_requests'
      AND policyname = 'employee_requests_update_own'
  ) THEN
    CREATE POLICY employee_requests_update_own
      ON public.employee_requests
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- =============================================================================
-- Fine. Verifica in Table Editor: geofence_settings, employee_requests
-- =============================================================================
