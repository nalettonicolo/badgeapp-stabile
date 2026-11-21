/**
 * Controlli testuali di sicurezza su SUPABASE_SCHEMA.sql (e su eventuali
 * migrazioni in supabase/migrations/ o migrations/, se esistono).
 *
 * Non è un parser SQL: cerca i pattern che contano. Il rischio coperto è
 * l'escalation di privilegi lato client: una policy "*_update_own" con
 * USING/WITH CHECK (auth.uid() = id) permette all'utente di aggiornare QUALSIASI
 * colonna della propria riga, quindi anche profiles.is_admin = true o
 * employee_requests.status = 'approved'. Una policy RLS non può confrontare
 * vecchio e nuovo valore: serve un trigger BEFORE UPDATE che blocchi la modifica.
 *
 * STATO ATTUALE: in SUPABASE_SCHEMA.sql non c'è nessun trigger BEFORE UPDATE su
 * profiles o employee_requests (ci sono solo i trigger di audit AFTER). I test
 * che lo verificano sono marcati "todo": il corpo è pronto e fallirebbe oggi;
 * quando il trigger viene aggiunto, basta togliere "todo".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Schema + eventuali migrazioni .sql (cartelle comuni), concatenati.
function loadSqlSources() {
  const files = ['SUPABASE_SCHEMA.sql'];
  for (const dir of ['supabase/migrations', 'migrations']) {
    const full = join(root, dir);
    if (existsSync(full)) {
      for (const f of readdirSync(full).sort()) {
        if (f.endsWith('.sql')) files.push(join(dir, f));
      }
    }
  }
  return files.map((f) => ({ file: f, text: readFileSync(join(root, f), 'utf8') }));
}

const sources = loadSqlSources();
const sql = sources.map((s) => s.text).join('\n;\n');

/** Corpo (fino al ";" di chiusura) di ogni CREATE TRIGGER ... BEFORE UPDATE su `table`. */
function beforeUpdateTriggers(table) {
  const re = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+\\w+\\s+BEFORE\\s+(?:INSERT\\s+OR\\s+)?UPDATE[^;]*?ON\\s+public\\.${table}\\b[^;]*;`,
    'gi'
  );
  return sql.match(re) ?? [];
}

/** Corpo di una funzione trigger referenziata da "EXECUTE FUNCTION|PROCEDURE public.nome(". */
function triggerFunctionBody(triggerSql) {
  const m = triggerSql.match(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?(\w+)\s*\(/i);
  if (!m) return '';
  const start = sql.search(new RegExp(`FUNCTION\\s+(?:public\\.)?${m[1]}\\s*\\(`, 'i'));
  if (start === -1) return '';
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return open === -1 || close === -1 ? '' : sql.slice(open, close);
}

const MOTIVO_TRIGGER_PROFILES =
  'manca un trigger BEFORE UPDATE su public.profiles che impedisca a un non-admin di cambiare is_admin: ' +
  'oggi profiles_update_own (USING/WITH CHECK auth.uid() = id) lascia a ogni utente la possibilità di auto-promuoversi admin.';
const MOTIVO_TRIGGER_REQUESTS =
  'manca un trigger BEFORE UPDATE su public.employee_requests che impedisca a un non-admin di cambiare status: ' +
  'oggi employee_requests_update_own (USING/WITH CHECK auth.uid() = user_id) lascia al dipendente la possibilità di auto-approvarsi ferie/permessi.';

// -----------------------------------------------------------------------------
// Test che passano già oggi (guardie di base)
// -----------------------------------------------------------------------------

test('lo schema SQL è presente e non vuoto', () => {
  assert.ok(sql.length > 1000);
  assert.ok(sources.some((s) => s.file === 'SUPABASE_SCHEMA.sql'));
});

test('il trigger di creazione profilo non si fida di is_admin_requested (solo is_admin = false)', () => {
  // Ultima definizione di handle_new_auth_user (quella del punto 8): l'INSERT deve forzare is_admin a false.
  const idx = sql.lastIndexOf('FUNCTION public.handle_new_auth_user');
  assert.ok(idx !== -1, 'public.handle_new_auth_user non trovata');
  const body = sql.slice(idx, sql.indexOf('$$;', sql.indexOf('$$', idx) + 2) + 3);
  assert.doesNotMatch(
    body,
    /is_admin_requested/i,
    'handle_new_auth_user legge is_admin_requested dai metadata: chiunque può registrarsi come admin'
  );
  assert.match(body, /VALUES\s*\([\s\S]*?\bfalse\s*\)/i, 'l\'INSERT deve impostare is_admin = false');
});

test('esistono i trigger di audit su profiles, daily_punches ed employee_requests', () => {
  for (const name of ['audit_profiles', 'audit_daily_punches', 'audit_employee_requests']) {
    assert.match(sql, new RegExp(`CREATE TRIGGER ${name}\\b`), `trigger ${name} non trovato`);
  }
});

// -----------------------------------------------------------------------------
// Trigger di protezione (todo finché non esistono)
// -----------------------------------------------------------------------------

// "todo" solo finché il trigger manca: appena esiste (schema o migrazione) il test diventa un controllo vero.
const todoProfiles = beforeUpdateTriggers('profiles').length === 0 ? MOTIVO_TRIGGER_PROFILES : false;
const todoRequests = beforeUpdateTriggers('employee_requests').length === 0 ? MOTIVO_TRIGGER_REQUESTS : false;

test('esiste un trigger BEFORE UPDATE su profiles che protegge is_admin', { todo: todoProfiles }, () => {
  const triggers = beforeUpdateTriggers('profiles');
  assert.ok(triggers.length > 0, 'nessun trigger BEFORE UPDATE su public.profiles');
  const protects = triggers.some((t) => /is_admin/i.test(triggerFunctionBody(t)) || /OF\s+[^;]*is_admin/i.test(t));
  assert.ok(protects, 'nessun trigger BEFORE UPDATE su profiles fa riferimento a is_admin');
});

test('esiste un trigger BEFORE UPDATE su employee_requests che protegge status', { todo: todoRequests }, () => {
  const triggers = beforeUpdateTriggers('employee_requests');
  assert.ok(triggers.length > 0, 'nessun trigger BEFORE UPDATE su public.employee_requests');
  const protects = triggers.some((t) => /\bstatus\b/i.test(triggerFunctionBody(t)) || /OF\s+[^;]*\bstatus\b/i.test(t));
  assert.ok(protects, 'nessun trigger BEFORE UPDATE su employee_requests fa riferimento a status');
});

test(
  'la funzione del trigger su is_admin lascia passare gli admin e blocca gli altri',
  { todo: todoProfiles },
  () => {
    const trig = beforeUpdateTriggers('profiles')[0];
    assert.ok(trig, 'nessun trigger BEFORE UPDATE su public.profiles');
    const body = triggerFunctionBody(trig);
    assert.ok(chiamaIsAdminSuUtenteCorrente(body), 'deve consentire la modifica a chi è già admin: public.is_admin(auth.uid()) oppure public.is_admin(v_actor) con v_actor := auth.uid()');
    assert.match(body, /RAISE\s+EXCEPTION|NEW\.is_admin\s*:=\s*OLD\.is_admin/i, 'deve bloccare (RAISE EXCEPTION) o ripristinare OLD.is_admin');
  }
);

/** Vero se `body` chiama is_admin(auth.uid()) oppure is_admin(<variabile>) con <variabile> := auth.uid(). */
function chiamaIsAdminSuUtenteCorrente(body) {
  if (/is_admin\(\s*auth\.uid\(\)\s*\)/i.test(body)) return true;
  for (const m of body.matchAll(/is_admin\(\s*(\w+)\s*\)/gi)) {
    const v = m[1];
    if (new RegExp(`\\b${v}\\s+uuid\\s*(?::=|=|DEFAULT)\\s*auth\\.uid\\(\\)`, 'i').test(body)) return true;
    if (new RegExp(`\\b${v}\\s*:=\\s*auth\\.uid\\(\\)`, 'i').test(body)) return true;
  }
  return false;
}

test(
  'nessuna policy *_update_own senza una protezione BEFORE UPDATE sulla stessa tabella',
  {
    todo:
      todoProfiles || todoRequests
        ? 'oggi profiles_update_own ed employee_requests_update_own non hanno trigger BEFORE UPDATE di protezione ' +
          '(vedi gli altri due test todo di questo file). Il todo cade da solo quando entrambi i trigger esistono.'
        : false,
  },
  () => {
    // Nome policy → tabella, da tutte le CREATE POLICY *_update_own (esclude *_or_admin: quelle ammettono già l'admin).
    const re = /CREATE\s+POLICY\s+(\w+_update_own)\s+ON\s+public\.(\w+)/gi;
    const found = new Map();
    for (const m of sql.matchAll(re)) found.set(m[1], m[2]);
    assert.ok(found.size > 0, 'nessuna policy *_update_own trovata: il test non verifica nulla');

    const senzaProtezione = [];
    for (const [policy, table] of found) {
      if (beforeUpdateTriggers(table).length === 0) senzaProtezione.push(`${policy} (public.${table})`);
    }
    assert.deepEqual(senzaProtezione, [], `policy senza trigger BEFORE UPDATE di protezione: ${senzaProtezione.join(', ')}`);
  }
);

// -----------------------------------------------------------------------------
// Sezione 15 di SUPABASE_SCHEMA.sql = migrazione 20261115_blocca_privilegi.sql
// -----------------------------------------------------------------------------

const schemaText = readFileSync(join(root, 'SUPABASE_SCHEMA.sql'), 'utf8');
const sezione15 = (schemaText.match(/^--\s*15\)[\s\S]*$/m) ?? [''])[0];
const migrazioneFile = sources.find((s) => /blocca_privilegi.*\.sql$/i.test(s.file));

/** Toglie i commenti "--" e riduce gli spazi, per confrontare il codice e non la formattazione. */
const normalizza = (t) => t.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

/** Mappa nome → testo normalizzato di ogni CREATE FUNCTION e CREATE TRIGGER di `text`. */
function funzioniETrigger(text) {
  const pulito = text.replace(/--[^\n]*/g, '');
  const funzioni = new Map();
  for (const m of pulito.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\([\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi)) {
    funzioni.set(m[1], normalizza(m[0]));
  }
  const trigger = new Map();
  for (const m of pulito.matchAll(/CREATE\s+TRIGGER\s+(\w+)[\s\S]*?;/gi)) trigger.set(m[1], normalizza(m[0]));
  return { funzioni, trigger };
}

const MOTIVO_ALLINEAMENTO =
  'la sezione 15 di SUPABASE_SCHEMA.sql o supabase/migrations/20261115_blocca_privilegi.sql non esiste su questo ramo ' +
  '(stanno su sicurezza/blocca-privilegi): il test si attiva da solo quando i due file ci sono.';

test(
  'sezione 15 di SUPABASE_SCHEMA.sql e migrazione 20261115 hanno le stesse funzioni e gli stessi trigger',
  { todo: sezione15 && migrazioneFile ? false : MOTIVO_ALLINEAMENTO },
  () => {
    assert.ok(sezione15, 'sezione "-- 15)" non trovata in SUPABASE_SCHEMA.sql');
    assert.ok(migrazioneFile, 'migrazione *blocca_privilegi*.sql non trovata in supabase/migrations/');
    const a = funzioniETrigger(sezione15);
    const b = funzioniETrigger(migrazioneFile.text);
    assert.ok(a.funzioni.size > 0 && a.trigger.size > 0, 'la sezione 15 non contiene funzioni o trigger: il test non verificherebbe nulla');

    assert.deepEqual([...a.funzioni.keys()].sort(), [...b.funzioni.keys()].sort(), 'funzioni diverse tra sezione 15 e migrazione');
    assert.deepEqual([...a.trigger.keys()].sort(), [...b.trigger.keys()].sort(), 'trigger diversi tra sezione 15 e migrazione');
    for (const [nome, testo] of a.funzioni) assert.equal(testo, b.funzioni.get(nome), `corpo della funzione ${nome} diverso tra sezione 15 e migrazione`);
    for (const [nome, testo] of a.trigger) assert.equal(testo, b.trigger.get(nome), `definizione del trigger ${nome} diversa tra sezione 15 e migrazione`);
  }
);

// -----------------------------------------------------------------------------
// Nuove regole richieste dall'azione di devdb (todo motivati finché il codice non c'è)
// -----------------------------------------------------------------------------

/** Testo delle funzioni dei trigger BEFORE (INSERT e/o UPDATE) su `table` che coprono `evento`. */
function corpiTriggerBefore(table, evento) {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+\\w+\\s+BEFORE\\s+[^;]*?\\b${evento}\\b[^;]*?ON\\s+public\\.${table}\\b[^;]*;`, 'gi');
  return (sql.match(re) ?? []).map(triggerFunctionBody);
}

const bodiesRichiesteUpdate = corpiTriggerBefore('employee_requests', 'UPDATE');
const regolaApprovata = bodiesRichiesteUpdate.some((b) => /OLD\.status\s*(?:=|IN)\s*\(?\s*'approved'/i.test(b) && /is_admin\(/i.test(b));
const bodiesProfiliInsert = corpiTriggerBefore('profiles', 'INSERT');
const regolaIsAdminInsert = bodiesProfiliInsert.some((b) => /NEW\.is_admin/i.test(b) && /is_admin\(/i.test(b) && /RAISE\s+EXCEPTION|NEW\.is_admin\s*:=\s*false/i.test(b));

test(
  'una richiesta già approvata non è modificabile da un non-admin (date, ore, tipo)',
  {
    todo: regolaApprovata
      ? false
      : 'employee_requests_update_own (SUPABASE_SCHEMA.sql, USING/WITH CHECK auth.uid() = user_id) lascia al dipendente modificare date e ore di una richiesta già approvata, ' +
        'e blocca_stato_richieste controlla solo il passaggio A approved/rejected, non una richiesta che è GIÀ approved. Serve una regola nuova (azione devdb).',
  },
  () => {
    assert.ok(bodiesRichiesteUpdate.length > 0, 'nessun trigger BEFORE UPDATE su public.employee_requests');
    assert.ok(regolaApprovata, "nessun trigger BEFORE UPDATE su employee_requests blocca la modifica quando OLD.status = 'approved' per un non-admin (is_admin)");
    // Il blocco deve valere per le colonne dati, non solo per status.
    const b = bodiesRichiesteUpdate.find((x) => /OLD\.status\s*(?:=|IN)\s*\(?\s*'approved'/i.test(x)) ?? '';
    assert.match(b, /RAISE\s+EXCEPTION/i, "il trigger deve sollevare un errore (RAISE EXCEPTION) su una richiesta approved modificata da un non-admin");
  }
);

test(
  'is_admin non può essere impostato a true in INSERT su profiles da un non-admin',
  {
    todo: regolaIsAdminInsert
      ? false
      : 'profiles_insert_own (SUPABASE_SCHEMA.sql, WITH CHECK auth.uid() = id) non controlla le colonne e il trigger blocca_cambio_is_admin è solo BEFORE UPDATE: ' +
        'un INSERT con is_admin = true passa se la riga del profilo manca. Serve la stessa regola anche in INSERT (azione devdb).',
  },
  () => {
    assert.ok(bodiesProfiliInsert.length > 0, 'nessun trigger BEFORE INSERT su public.profiles');
    assert.ok(regolaIsAdminInsert, 'nessun trigger BEFORE INSERT su profiles controlla NEW.is_admin con is_admin(<attore>) e blocca o forza a false');
  }
);
