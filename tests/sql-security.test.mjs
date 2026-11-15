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

test('esiste un trigger BEFORE UPDATE su profiles che protegge is_admin', { todo: MOTIVO_TRIGGER_PROFILES }, () => {
  const triggers = beforeUpdateTriggers('profiles');
  assert.ok(triggers.length > 0, 'nessun trigger BEFORE UPDATE su public.profiles');
  const protects = triggers.some((t) => /is_admin/i.test(triggerFunctionBody(t)) || /OF\s+[^;]*is_admin/i.test(t));
  assert.ok(protects, 'nessun trigger BEFORE UPDATE su profiles fa riferimento a is_admin');
});

test('esiste un trigger BEFORE UPDATE su employee_requests che protegge status', { todo: MOTIVO_TRIGGER_REQUESTS }, () => {
  const triggers = beforeUpdateTriggers('employee_requests');
  assert.ok(triggers.length > 0, 'nessun trigger BEFORE UPDATE su public.employee_requests');
  const protects = triggers.some((t) => /\bstatus\b/i.test(triggerFunctionBody(t)) || /OF\s+[^;]*\bstatus\b/i.test(t));
  assert.ok(protects, 'nessun trigger BEFORE UPDATE su employee_requests fa riferimento a status');
});

test(
  'la funzione del trigger su is_admin lascia passare gli admin e blocca gli altri',
  { todo: MOTIVO_TRIGGER_PROFILES },
  () => {
    const trig = beforeUpdateTriggers('profiles')[0];
    assert.ok(trig, 'nessun trigger BEFORE UPDATE su public.profiles');
    const body = triggerFunctionBody(trig);
    assert.match(body, /is_admin\(\s*auth\.uid\(\)\s*\)/i, 'deve consentire la modifica a chi è già admin (public.is_admin(auth.uid()))');
    assert.match(body, /RAISE\s+EXCEPTION|NEW\.is_admin\s*:=\s*OLD\.is_admin/i, 'deve bloccare (RAISE EXCEPTION) o ripristinare OLD.is_admin');
  }
);

test(
  'nessuna policy *_update_own senza una protezione BEFORE UPDATE sulla stessa tabella',
  {
    todo:
      'oggi profiles_update_own ed employee_requests_update_own non hanno trigger BEFORE UPDATE di protezione ' +
      '(vedi gli altri due test todo di questo file). Si toglie il todo quando entrambi i trigger esistono.',
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

test.todo(
  'migrazione SQL dedicata (supabase/migrations/…) con i trigger is_admin/status: non presente nel repo, oggi esiste solo SUPABASE_SCHEMA.sql'
);
