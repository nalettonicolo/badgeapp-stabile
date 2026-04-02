-- =============================================================================
-- BadgeApp / Timbrature Online — schema completo (UN SOLO FILE)
-- Esegui in Supabase → SQL Editor → Run (idempotente, sicuro su dati esistenti)
--
-- Risolve tra l’altro: column employee_requests.travel_hours does not exist
-- (tabelle vecchie senza colonne aggiunte in seguito).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Profili utente (dipende da auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  first_name text DEFAULT '',
  last_name text DEFAULT '',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own
      ON public.profiles FOR SELECT TO authenticated
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_admin_all'
  ) THEN
    CREATE POLICY profiles_select_admin_all
      ON public.profiles FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own
      ON public.profiles FOR UPDATE TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_admin_all'
  ) THEN
    CREATE POLICY profiles_update_admin_all
      ON public.profiles FOR UPDATE TO authenticated
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
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_own'
  ) THEN
    CREATE POLICY profiles_insert_own
      ON public.profiles FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END
$$;

INSERT INTO public.profiles (id, email, first_name, last_name, is_admin)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'first_name', ''),
  COALESCE(u.raw_user_meta_data->>'last_name', ''),
  COALESCE((u.raw_user_meta_data->>'is_admin_requested')::boolean, false)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, is_admin)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE((new.raw_user_meta_data->>'is_admin_requested')::boolean, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    first_name = COALESCE(excluded.first_name, public.profiles.first_name),
    last_name = COALESCE(excluded.last_name, public.profiles.last_name);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 1) Geofence (web + mobile)
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
    WHERE schemaname = 'public' AND tablename = 'geofence_settings' AND policyname = 'geofence_read_authenticated'
  ) THEN
    CREATE POLICY geofence_read_authenticated
      ON public.geofence_settings FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'geofence_settings' AND policyname = 'geofence_update_admin'
  ) THEN
    CREATE POLICY geofence_update_admin
      ON public.geofence_settings FOR UPDATE TO authenticated
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

  -- UPSERT dal client usa anche INSERT se la riga non c’è o in alcuni percorsi RLS
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'geofence_settings' AND policyname = 'geofence_insert_admin'
  ) THEN
    CREATE POLICY geofence_insert_admin
      ON public.geofence_settings FOR INSERT TO authenticated
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
-- 2) Richieste dipendente (trasferta / malattia / ferie)
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

-- Migrazione colonne su DB creati senza queste colonne (causa tipica dell’errore travel_hours)
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS travel_hours double precision;
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS total_hours_declared double precision;
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS trasferta_scope text;
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.employee_requests ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'saved';

-- Vincoli nominati (rinnovabili)
ALTER TABLE public.employee_requests DROP CONSTRAINT IF EXISTS employee_requests_request_type_check;
ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_request_type_check
  CHECK (request_type IN ('trasferta', 'malattia', 'ferie'));

ALTER TABLE public.employee_requests DROP CONSTRAINT IF EXISTS employee_requests_trasferta_scope_check;
ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_trasferta_scope_check
  CHECK (trasferta_scope IS NULL OR trasferta_scope IN ('TI', 'TE'));

ALTER TABLE public.employee_requests DROP CONSTRAINT IF EXISTS employee_requests_status_check;
ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'saved'));

ALTER TABLE public.employee_requests DROP CONSTRAINT IF EXISTS employee_requests_dates_ok;
ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_dates_ok CHECK (end_date >= start_date);

CREATE INDEX IF NOT EXISTS employee_requests_user_created_idx
  ON public.employee_requests (user_id, created_at DESC);

ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.employee_requests.request_type IS 'trasferta | malattia | ferie';
COMMENT ON COLUMN public.employee_requests.trasferta_scope IS 'TI = Italia, TE = estero';
COMMENT ON COLUMN public.employee_requests.travel_hours IS 'Ore di viaggio (trasferta, monitoraggio).';
COMMENT ON COLUMN public.employee_requests.total_hours_declared IS 'Ore totali dichiarate in trasferta (incl. viaggio).';

-- -----------------------------------------------------------------------------
-- 3) RLS employee_requests
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_requests' AND policyname = 'employee_requests_select_own_or_admin'
  ) THEN
    CREATE POLICY employee_requests_select_own_or_admin
      ON public.employee_requests FOR SELECT TO authenticated
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
    WHERE schemaname = 'public' AND tablename = 'employee_requests' AND policyname = 'employee_requests_insert_own'
  ) THEN
    CREATE POLICY employee_requests_insert_own
      ON public.employee_requests FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employee_requests' AND policyname = 'employee_requests_update_admin'
  ) THEN
    CREATE POLICY employee_requests_update_admin
      ON public.employee_requests FOR UPDATE TO authenticated
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
    WHERE schemaname = 'public' AND tablename = 'employee_requests' AND policyname = 'employee_requests_update_own'
  ) THEN
    CREATE POLICY employee_requests_update_own
      ON public.employee_requests FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- =============================================================================
-- Fine
-- =============================================================================
