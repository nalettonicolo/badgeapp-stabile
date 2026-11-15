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
-- sessione, un dipendente poteva: diventare admin (is_admin = true), approvarsi
-- da solo una richiesta (status = 'approved') e riscrivere le timbrature di
-- giorni passati. Questi trigger chiudono i buchi.
--
-- Regola comune: i controlli valgono solo per chi ha una sessione utente
-- (auth.uid() non nullo) che NON è admin. Restano liberi:
--   - gli admin (public.is_admin(auth.uid()));
--   - le operazioni senza sessione utente: SQL Editor di Supabase, chiave
--     service_role, funzioni interne (auth.uid() è nullo).
--
-- Regole:
--   1) profiles: solo un admin può cambiare is_admin.
--   2) employee_requests: solo un admin può portare status a approved/rejected.
--   3) daily_punches: un non admin può modificare solo le timbrature di OGGI
--      (giorno di Europe/Rome); le correzioni sui giorni passati le fa l'admin.
--   4) audit_log: si registra anche quando un utente MODIFICA i propri orari
--      già inseriti (prima si loggavano solo le modifiche su dati altrui).
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
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.blocca_stato_richieste()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
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
-- 3) daily_punches: un non admin modifica solo il giorno corrente
--    "Giorno corrente" = data di oggi in Europe/Rome (non UTC, altrimenti dopo
--    mezzanotte italiana ma prima di mezzanotte UTC il giorno sarebbe sbagliato).
--    Si controllano sia la data vecchia sia la nuova, così non si può nemmeno
--    "spostare" una timbratura da o verso un giorno passato.
--    Un trigger (e non una policy RLS) dà un errore esplicito: con la sola RLS
--    un UPDATE non consentito sarebbe un'operazione vuota senza avviso.
--    Nota: riguarda solo l'UPDATE; l'INSERT di un giorno mancante resta com'è.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.limita_modifica_timbrature()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
BEGIN
  IF OLD.punch_date = v_oggi AND NEW.punch_date = v_oggi THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NOT NULL AND NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Puoi modificare solo le timbrature di oggi: per correggere un giorno passato rivolgiti a un amministratore.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_punches_limita_modifica ON public.daily_punches;
CREATE TRIGGER daily_punches_limita_modifica
  BEFORE UPDATE ON public.daily_punches
  FOR EACH ROW EXECUTE FUNCTION public.limita_modifica_timbrature();

-- -----------------------------------------------------------------------------
-- 4) audit_log: registra anche le modifiche ai PROPRI orari
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

-- =============================================================================
-- ANNULLAMENTO (non eseguire insieme alla migrazione: copia e lancia solo se
-- serve tornare indietro). Toglie solo i trigger e le funzioni di questa
-- migrazione; non cancella dati. Le righe già scritte in audit_log con
-- action = 'UPDATE_OWN' restano.
--
-- DROP TRIGGER IF EXISTS audit_daily_punches_own ON public.daily_punches;
-- DROP TRIGGER IF EXISTS daily_punches_limita_modifica ON public.daily_punches;
-- DROP TRIGGER IF EXISTS employee_requests_blocca_stato ON public.employee_requests;
-- DROP TRIGGER IF EXISTS profiles_blocca_is_admin ON public.profiles;
-- DROP FUNCTION IF EXISTS public.log_modifica_propri_orari();
-- DROP FUNCTION IF EXISTS public.limita_modifica_timbrature();
-- DROP FUNCTION IF EXISTS public.blocca_stato_richieste();
-- DROP FUNCTION IF EXISTS public.blocca_cambio_is_admin();
-- =============================================================================
