-- =============================================================================
-- BadgeApp — migrazione 20261115: blocca escalation di privilegi lato database
--
-- NON ancora eseguita su nessun database. Rieseguibile: si può lanciare più
-- volte senza errori (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). Non tocca
-- né cancella dati: aggiunge solo funzioni e trigger. Per annullare tutto vedi
-- il blocco "ANNULLAMENTO" in fondo.
--
-- Perché: le policy RLS "profiles_update_own" e "employee_requests_update_own"
-- consentono a ogni utente di aggiornare la PROPRIA riga, ma la RLS controlla
-- le righe, non le colonne. Quindi, chiamando direttamente l'API con la propria
-- sessione, un dipendente poteva diventare admin (is_admin = true) o approvarsi
-- da solo una richiesta (status = 'approved'). Questi trigger chiudono i buchi.
-- Le timbrature dei giorni passati restano correggibili dal dipendente (scelta
-- di Nicolò): il controllo è la tracciatura nel registro (regola 3).
--
-- Regola comune: i controlli valgono solo per chi ha una sessione utente
-- (auth.uid() non nullo) che NON è admin. Restano liberi:
--   - gli admin (public.is_admin(auth.uid()));
--   - le operazioni senza sessione utente: SQL Editor di Supabase, chiave
--     service_role, funzioni interne (auth.uid() è nullo).
--
-- Regole:
--   1) profiles: solo un admin può cambiare is_admin.
--   2) employee_requests: solo un admin può portare status a approved/rejected,
--      e un non admin non può più modificare una richiesta già approved/rejected.
--   3) audit_log: si registra anche quando un utente MODIFICA i propri orari
--      già inseriti, di qualunque giorno (prima si loggavano solo le modifiche
--      su dati altrui). Nessun blocco sulle date: nessuna regola sul giorno.
--   4) profiles: solo un admin può INSERIRE una riga con is_admin = true.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Controlli preliminari: se manca qualcosa ci si ferma subito, prima di
--    creare qualsiasi cosa, con un messaggio chiaro.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.employee_requests') IS NULL
     OR to_regclass('public.daily_punches') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION 'Migrazione 20261115 interrotta: mancano le tabelle profiles, employee_requests, daily_punches o audit_log. Applica prima SUPABASE_SCHEMA.sql.';
  END IF;

  IF to_regprocedure('public.is_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migrazione 20261115 interrotta: manca la funzione public.is_admin(uuid). Applica prima SUPABASE_SCHEMA.sql (sezione 12).';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1) profiles: solo un admin può cambiare is_admin
--    Un aggiornamento che lascia is_admin invariato passa sempre (il profilo si
--    può modificare normalmente, es. nome e cognome).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.blocca_cambio_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND v_actor IS NOT NULL
     AND NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo un amministratore può cambiare il ruolo di amministratore.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_blocca_is_admin ON public.profiles;
CREATE TRIGGER profiles_blocca_is_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.blocca_cambio_is_admin();

-- -----------------------------------------------------------------------------
-- 2) employee_requests: solo un admin può portare status a approved / rejected
--    Il dipendente continua a creare richieste con status 'saved' (come fanno
--    web e app mobile) e a modificarle senza toccare lo stato di revisione.
--    Il controllo vale anche in INSERT, altrimenti basterebbe creare una
--    richiesta già "approved" per aggirare la regola.
--    Inoltre, una volta che la richiesta è approved o rejected, un non admin
--    non può cambiare più nessuna colonna (date, ore, tipo...): senza questo,
--    dopo l'approvazione il dipendente poteva ancora spostare date e ore.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.blocca_stato_richieste()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('approved', 'rejected')
     AND v_actor IS NOT NULL
     AND NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Una richiesta già approvata o rifiutata non si può più modificare.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IN ('approved', 'rejected')
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
     AND v_actor IS NOT NULL
     AND NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo un amministratore può approvare o rifiutare una richiesta.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_requests_blocca_stato ON public.employee_requests;
CREATE TRIGGER employee_requests_blocca_stato
  BEFORE INSERT OR UPDATE ON public.employee_requests
  FOR EACH ROW EXECUTE FUNCTION public.blocca_stato_richieste();

-- -----------------------------------------------------------------------------
-- 3) audit_log: registra anche le modifiche ai PROPRI orari (anche passati)
--    Il dipendente può correggere i giorni passati dall'app (decisione di
--    Nicolò), quindi non c'è un blocco sulla data: ogni correzione resta però
--    tracciata con vecchio e nuovo valore, e l'admin la vede nel registro.
--    Il trigger esistente (log_on_behalf_of_change) salta i casi in cui chi
--    agisce è il proprietario della riga. Questo trigger copre solo quel caso e
--    scrive una riga con action = 'UPDATE_OWN' quando un orario GIÀ compilato
--    viene cambiato o svuotato. Compilare per la prima volta un orario vuoto
--    (le normali timbrature del giorno) NON genera log, per non riempire la
--    tabella con 3 righe al giorno per dipendente.
--    SECURITY DEFINER: audit_log non ha policy di scrittura per gli utenti.
--    Modifiche fatte da altri o senza sessione restano registrate dal trigger
--    esistente: qui non si duplicano.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_modifica_propri_orari()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR v_actor IS DISTINCT FROM NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF (OLD.iniziomattina    IS NOT NULL AND NEW.iniziomattina    IS DISTINCT FROM OLD.iniziomattina)
     OR (OLD.finemattina      IS NOT NULL AND NEW.finemattina      IS DISTINCT FROM OLD.finemattina)
     OR (OLD.iniziopomeriggio IS NOT NULL AND NEW.iniziopomeriggio IS DISTINCT FROM OLD.iniziopomeriggio)
     OR (OLD.finepomeriggio   IS NOT NULL AND NEW.finepomeriggio   IS DISTINCT FROM OLD.finepomeriggio) THEN
    INSERT INTO public.audit_log (actor_id, action, table_name, row_id, target_user_id, old_data, new_data)
    VALUES (v_actor, 'UPDATE_OWN', TG_TABLE_NAME, NEW.id::text, NEW.user_id, to_jsonb(OLD), to_jsonb(NEW));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_daily_punches_own ON public.daily_punches;
CREATE TRIGGER audit_daily_punches_own
  AFTER UPDATE ON public.daily_punches
  FOR EACH ROW EXECUTE FUNCTION public.log_modifica_propri_orari();

-- -----------------------------------------------------------------------------
-- 4) profiles: solo un admin può INSERIRE una riga con is_admin = true
--    La policy profiles_insert_own lascia a ogni utente creare la propria riga
--    (auth.uid() = id) senza guardare le colonne: senza questo trigger un
--    utente con sessione, se la riga non esiste ancora, la crea già admin.
--    Non rompe la registrazione: handle_new_auth_user inserisce sempre
--    is_admin = false, e l'upsert del form "Aggiungi dipendente" usa la sessione
--    dell'admin (che passa il controllo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.blocca_insert_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF COALESCE(NEW.is_admin, false) = true
     AND v_actor IS NOT NULL
     AND NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo un amministratore può creare un profilo da amministratore.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_blocca_insert_is_admin ON public.profiles;
CREATE TRIGGER profiles_blocca_insert_is_admin
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.blocca_insert_is_admin();

-- =============================================================================
-- ANNULLAMENTO (non eseguire insieme alla migrazione: copia e lancia solo se
-- serve tornare indietro). Toglie solo i trigger e le funzioni di questa
-- migrazione; non cancella dati. Le righe già scritte in audit_log con
-- action = 'UPDATE_OWN' restano.
--
-- DROP TRIGGER IF EXISTS profiles_blocca_insert_is_admin ON public.profiles;
-- DROP TRIGGER IF EXISTS audit_daily_punches_own ON public.daily_punches;
-- DROP TRIGGER IF EXISTS employee_requests_blocca_stato ON public.employee_requests;
-- DROP TRIGGER IF EXISTS profiles_blocca_is_admin ON public.profiles;
-- DROP FUNCTION IF EXISTS public.blocca_insert_is_admin();
-- DROP FUNCTION IF EXISTS public.log_modifica_propri_orari();
-- DROP FUNCTION IF EXISTS public.blocca_stato_richieste();
-- DROP FUNCTION IF EXISTS public.blocca_cambio_is_admin();
-- =============================================================================
