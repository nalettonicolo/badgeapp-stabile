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
-- 1) Richieste dipendente (trasferta / malattia / ferie)
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
-- 2) RLS employee_requests
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

-- -----------------------------------------------------------------------------
-- 3) Timbrature giornaliere (daily_punches)
-- Tabella usata da web (index.html) e app mobile per registrare le 4 timbrature
-- del giorno (ingresso/uscita mattina, ingresso/uscita pomeriggio) e la pausa.
-- Mancava in questo file (che pure si dichiara "schema completo"): il file non
-- bastava a ricreare da zero un progetto Supabase funzionante.
-- Colonne/tipi allineati allo schema realmente in produzione (id bigint, FK su
-- profiles) per evitare una migrazione di tipo distruttiva.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_punches (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  punch_date date NOT NULL,
  iniziomattina time,
  finemattina time,
  iniziopomeriggio time,
  finepomeriggio time,
  pausa_minuti integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Migrazione colonne su DB creati senza queste colonne
ALTER TABLE public.daily_punches ADD COLUMN IF NOT EXISTS iniziomattina time;
ALTER TABLE public.daily_punches ADD COLUMN IF NOT EXISTS finemattina time;
ALTER TABLE public.daily_punches ADD COLUMN IF NOT EXISTS iniziopomeriggio time;
ALTER TABLE public.daily_punches ADD COLUMN IF NOT EXISTS finepomeriggio time;
ALTER TABLE public.daily_punches ADD COLUMN IF NOT EXISTS pausa_minuti integer;
ALTER TABLE public.daily_punches ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.daily_punches ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- user_id/punch_date sono sempre valorizzati dagli upsert web/mobile: rende la
-- colonna coerente con il resto dello schema (era rimasta nullable).
ALTER TABLE public.daily_punches ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.daily_punches ALTER COLUMN punch_date SET NOT NULL;

-- Una sola riga di timbrature per utente/giorno: richiesta dagli upsert web/mobile
-- con onConflict: "user_id,punch_date".
ALTER TABLE public.daily_punches DROP CONSTRAINT IF EXISTS daily_punches_user_date_unique;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_punches'::regclass
      AND conname = 'daily_punches_user_id_punch_date_key'
  ) THEN
    ALTER TABLE public.daily_punches
      ADD CONSTRAINT daily_punches_user_id_punch_date_key UNIQUE (user_id, punch_date);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS daily_punches_user_date_idx
  ON public.daily_punches (user_id, punch_date DESC);

ALTER TABLE public.daily_punches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.daily_punches IS 'Timbrature giornaliere: 4 orari (mattina/pomeriggio) + pausa pranzo in minuti.';
COMMENT ON COLUMN public.daily_punches.pausa_minuti IS 'Durata pausa pranzo in minuti, calcolata da finemattina/iniziopomeriggio.';

-- -----------------------------------------------------------------------------
-- 4) RLS daily_punches (set unico e pulito)
-- Il dipendente vede/inserisce/aggiorna solo le proprie timbrature; l'admin può
-- vedere e correggere le timbrature di tutti (usato dallo storico e dall'inserimento
-- timbrature mancanti in pannello admin).
--
-- Sul progetto Supabase in uso si erano accumulate 14 policy duplicate/ridondanti
-- su questa tabella (create da script diversi in momenti diversi: "Gli admin
-- vedono tutto", "Punches: Allow authenticated self-insert", "punches_select_own",
-- ecc. — stessi permessi, nomi diversi). Vengono rimosse per evitare che ogni
-- query venga valutata contro decine di policy permissive sovrapposte.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Gli admin vedono tutto" ON public.daily_punches;
DROP POLICY IF EXISTS "Gli utenti gestiscono i propri dati" ON public.daily_punches;
DROP POLICY IF EXISTS "Gli utenti vedono solo i propri dati" ON public.daily_punches;
DROP POLICY IF EXISTS "Punches: Allow authenticated self-insert" ON public.daily_punches;
DROP POLICY IF EXISTS "Punches: Allow authenticated self-update" ON public.daily_punches;
DROP POLICY IF EXISTS "Punches: Allow read self and admin read all" ON public.daily_punches;
DROP POLICY IF EXISTS "Users can insert own punches" ON public.daily_punches;
DROP POLICY IF EXISTS "Users can update own punches" ON public.daily_punches;
DROP POLICY IF EXISTS "Users can view own punches" ON public.daily_punches;
DROP POLICY IF EXISTS punches_insert_admin_all ON public.daily_punches;
DROP POLICY IF EXISTS punches_insert_own ON public.daily_punches;
DROP POLICY IF EXISTS punches_select_admin_all ON public.daily_punches;
DROP POLICY IF EXISTS punches_select_own ON public.daily_punches;
DROP POLICY IF EXISTS punches_update_admin_all ON public.daily_punches;
DROP POLICY IF EXISTS punches_update_own ON public.daily_punches;
DROP POLICY IF EXISTS daily_punches_select_own_or_admin ON public.daily_punches;
DROP POLICY IF EXISTS daily_punches_insert_own_or_admin ON public.daily_punches;
DROP POLICY IF EXISTS daily_punches_update_own_or_admin ON public.daily_punches;

CREATE POLICY daily_punches_select_own_or_admin
  ON public.daily_punches FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
    )
  );

CREATE POLICY daily_punches_insert_own_or_admin
  ON public.daily_punches FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
    )
  );

CREATE POLICY daily_punches_update_own_or_admin
  ON public.daily_punches FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
    )
  );

-- -----------------------------------------------------------------------------
-- 5) Pulizia policy duplicate su profiles + funzioni "is admin" ridondanti
-- Stesso problema del punto 4 ma su public.profiles: 13 policy accumulate nel
-- tempo (stesso permesso, nomi/implementazioni diverse: "Users can view own
-- profile", "Enable read access to own profile", funzioni is_admin()/is_admin(uuid)
-- /is_admin_check()/is_admin_user(), RPC get_all_profiles() mai usata dal client).
-- Si riportano a un unico set coerente con il resto del file (già presente sopra
-- al punto 0: profiles_select_own, profiles_select_admin_all, profiles_update_own,
-- profiles_update_admin_all, profiles_insert_own).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable read access to own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Allow authenticated self-insert or admin-insert" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Allow authenticated self-update or admin-update" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Allow read self and admin read all" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY profiles_select_admin_all
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
    )
  );

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

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

CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Funzioni helper "is admin" ridondanti: nessuna policy le referenzia più dopo
-- la pulizia sopra, e nessun'altra tabella/RPC lato client le usa.
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.is_admin_check();
DROP FUNCTION IF EXISTS public.is_admin_user();
DROP FUNCTION IF EXISTS public.get_all_profiles();

-- -----------------------------------------------------------------------------
-- 6) employee_requests: tipo "permesso" già in uso in produzione
-- Non presente nell'UI attuale (solo trasferta/malattia/ferie), ma già ammesso
-- dal vincolo esistente sul DB: lo si conserva per non rompere righe già salvate.
-- -----------------------------------------------------------------------------
ALTER TABLE public.employee_requests DROP CONSTRAINT IF EXISTS employee_requests_request_type_check;
ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_request_type_check
  CHECK (request_type IN ('trasferta', 'malattia', 'ferie', 'permesso'));

-- -----------------------------------------------------------------------------
-- 7) Geofence (legacy, tabella non più usata)
-- La geolocalizzazione/geotimbratura è stata rimossa dall'app (vedi README), ma
-- la tabella con le impostazioni resta nel DB. Viene solo documentata/resa
-- idempotente qui: nessuna riga viene toccata.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.geofence_settings (
  id integer PRIMARY KEY,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  address text DEFAULT '',
  center_lat double precision NOT NULL DEFAULT 0,
  center_lng double precision NOT NULL DEFAULT 0,
  radius_entry_meters double precision NOT NULL DEFAULT 120,
  radius_exit_meters double precision NOT NULL DEFAULT 120,
  max_accuracy_meters double precision NOT NULL DEFAULT 60,
  polygon_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geofence_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.geofence_settings IS 'Legacy: geolocalizzazione rimossa dall''app, tabella non più letta/scritta dal client.';

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
END
$$;

-- -----------------------------------------------------------------------------
-- 8) FIX SICUREZZA CRITICO: escalation di privilegi in fase di signup
--
-- Il form admin "Aggiungi dipendente" chiama direttamente l'endpoint pubblico
-- POST {supabaseUrl}/auth/v1/signup con la anon key (pubblica, presente nel
-- codice client) passando is_admin_requested nei metadata dell'utente.
-- La versione precedente di handle_new_auth_user() copiava quel valore in
-- public.profiles.is_admin SENZA ALCUN CONTROLLO server-side: chiunque avesse
-- la anon key poteva chiamare l'endpoint direttamente (bypassando del tutto
-- l'app e il suo controllo isAdmin, che è solo lato client) e ottenere un
-- profilo con is_admin = true.
--
-- Fix: il trigger ora ignora sempre is_admin_requested e crea il profilo con
-- is_admin = false. Il flusso "admin crea un altro admin" nell'app continua a
-- funzionare senza modifiche al client: dopo la signup, il form esegue già un
-- upsert su public.profiles con is_admin = true usando la SESSIONE
-- DELL'ADMIN — upsert soggetto alla RLS profiles_update_admin_all, che
-- verifica server-side che il chiamante sia davvero un admin. Solo quel
-- percorso, verificato, può ora impostare is_admin = true.
-- -----------------------------------------------------------------------------
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
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    first_name = COALESCE(excluded.first_name, public.profiles.first_name),
    last_name = COALESCE(excluded.last_name, public.profiles.last_name);
  RETURN new;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9) Integrità dati: pausa_minuti non può essere negativa
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_punches DROP CONSTRAINT IF EXISTS daily_punches_pausa_minuti_check;
ALTER TABLE public.daily_punches
  ADD CONSTRAINT daily_punches_pausa_minuti_check CHECK (pausa_minuti IS NULL OR pausa_minuti >= 0);

-- -----------------------------------------------------------------------------
-- 10) FASE 2 — Integrità dati: vincoli di plausibilità aggiuntivi
--
-- daily_punches: gli orari possono essere parziali ("buchi intermedi" inseriti
-- dall'admin sono ammessi di proposito), quindi i vincoli confrontano solo le
-- coppie in cui ENTRAMBI i valori sono presenti — non bloccano mai un inserimento
-- parziale, ma rifiutano ordini temporalmente impossibili quando i dati ci sono.
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_punches DROP CONSTRAINT IF EXISTS daily_punches_order_mattina_check;
ALTER TABLE public.daily_punches
  ADD CONSTRAINT daily_punches_order_mattina_check
  CHECK (iniziomattina IS NULL OR finemattina IS NULL OR finemattina >= iniziomattina);

ALTER TABLE public.daily_punches DROP CONSTRAINT IF EXISTS daily_punches_order_pausa_check;
ALTER TABLE public.daily_punches
  ADD CONSTRAINT daily_punches_order_pausa_check
  CHECK (finemattina IS NULL OR iniziopomeriggio IS NULL OR iniziopomeriggio >= finemattina);

ALTER TABLE public.daily_punches DROP CONSTRAINT IF EXISTS daily_punches_order_pomeriggio_check;
ALTER TABLE public.daily_punches
  ADD CONSTRAINT daily_punches_order_pomeriggio_check
  CHECK (iniziopomeriggio IS NULL OR finepomeriggio IS NULL OR finepomeriggio >= iniziopomeriggio);

ALTER TABLE public.daily_punches DROP CONSTRAINT IF EXISTS daily_punches_order_giornata_check;
ALTER TABLE public.daily_punches
  ADD CONSTRAINT daily_punches_order_giornata_check
  CHECK (iniziomattina IS NULL OR finepomeriggio IS NULL OR finepomeriggio >= iniziomattina);

-- employee_requests: le ore dichiarate non possono essere negative.
ALTER TABLE public.employee_requests DROP CONSTRAINT IF EXISTS employee_requests_travel_hours_check;
ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_travel_hours_check CHECK (travel_hours IS NULL OR travel_hours >= 0);

ALTER TABLE public.employee_requests DROP CONSTRAINT IF EXISTS employee_requests_total_hours_check;
ALTER TABLE public.employee_requests
  ADD CONSTRAINT employee_requests_total_hours_check CHECK (total_hours_declared IS NULL OR total_hours_declared >= 0);

-- -----------------------------------------------------------------------------
-- 11) FASE 2 — Audit log delle modifiche "per conto di" (admin su dati altrui)
--
-- Oggi nessuna azione admin è tracciata: se un admin corregge le timbrature di
-- un dipendente, promuove un altro utente ad admin, o modifica lo stato di una
-- richiesta altrui, non resta traccia di chi/quando/cosa. Questo introduce un
-- log append-only, popolato solo da trigger SECURITY DEFINER (il client non ha
-- alcuna policy di scrittura diretta: non può né falsificare né cancellare voci).
--
-- Si registra una riga SOLO quando chi esegue l'operazione (auth.uid()) non
-- coincide con il proprietario della riga toccata (user_id, o id per profiles) —
-- cioè esattamente i casi "qualcuno sta agendo per conto di qualcun altro" che
-- oggi sfuggono a qualunque controllo.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id text NOT NULL,
  target_user_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_user_idx ON public.audit_log (target_user_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.audit_log IS 'Log append-only (scritto solo da trigger SECURITY DEFINER) delle modifiche fatte da un utente su dati di un altro utente.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_select_admin_only'
  ) THEN
    CREATE POLICY audit_log_select_admin_only
      ON public.audit_log FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
        )
      );
  END IF;
END
$$;
-- Nessuna policy INSERT/UPDATE/DELETE per "authenticated": solo il trigger
-- (SECURITY DEFINER, gira come proprietario della funzione) può scrivere qui.

CREATE OR REPLACE FUNCTION public.log_on_behalf_of_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id text;
  v_target_user uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    v_target_user := COALESCE(NEW.id, OLD.id);
  ELSE
    v_target_user := COALESCE(NEW.user_id, OLD.user_id);
  END IF;

  -- Logga solo se qualcuno sta agendo su dati non propri (o se non c'è sessione,
  -- es. operazioni interne): un utente che tocca solo i propri dati non genera log.
  IF v_actor IS NOT NULL AND v_actor = v_target_user THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_row_id := COALESCE(NEW.id, OLD.id)::text;

  INSERT INTO public.audit_log (actor_id, action, table_name, row_id, target_user_id, old_data, new_data)
  VALUES (
    v_actor,
    TG_OP,
    TG_TABLE_NAME,
    v_row_id,
    v_target_user,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_daily_punches ON public.daily_punches;
CREATE TRIGGER audit_daily_punches
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_punches
  FOR EACH ROW EXECUTE FUNCTION public.log_on_behalf_of_change();

DROP TRIGGER IF EXISTS audit_employee_requests ON public.employee_requests;
CREATE TRIGGER audit_employee_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_on_behalf_of_change();

DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_on_behalf_of_change();

-- =============================================================================
-- Fine
-- =============================================================================
