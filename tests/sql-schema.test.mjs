/**
 * Guardia di regressione per SUPABASE_SCHEMA.sql: impedisce che si ripresenti
 * il bug del 2026-08-24 (ricorsione infinita nelle RLS di profiles, errore
 * Postgres 42P17). Non è un parser SQL vero — solo controlli testuali
 * mirati, ma bastano a intercettare esattamente il pattern che ha causato
 * l'incidente: una policy CREATA SULLA TABELLA profiles la cui condizione fa
 * "SELECT ... FROM public.profiles" invece di passare da un helper
 * SECURITY DEFINER (public.is_admin(...)) che bypassa la RLS al suo interno.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(join(root, 'SUPABASE_SCHEMA.sql'), 'utf8');

/**
 * Trova l'ULTIMA definizione di una policy nel file (lo script la ricrea più
 * volte in sezioni successive; solo l'ultima esecuzione conta per lo stato
 * finale del DB dopo un run completo) e ne isola il corpo (fino al `;` che
 * chiude lo statement CREATE POLICY).
 */
function lastPolicyBody(name) {
  const marker = `CREATE POLICY ${name}\n`;
  const idx = sql.lastIndexOf(marker);
  assert.ok(idx !== -1, `CREATE POLICY ${name} non trovata nel file`);
  const end = sql.indexOf(';', idx);
  assert.ok(end !== -1, `CREATE POLICY ${name}: manca il ";" di chiusura`);
  return sql.slice(idx, end);
}

test('is_admin(uuid) è una funzione SECURITY DEFINER (bypassa la RLS al suo interno)', () => {
  const idx = sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)');
  assert.ok(idx !== -1, 'funzione public.is_admin(uuid) non trovata');
  const body = sql.slice(idx, sql.indexOf('$$;', sql.indexOf('$$', idx) + 2) + 3);
  assert.match(body, /SECURITY DEFINER/);
});

test('le policy ammin di profiles NON fanno una subquery su profiles stessa (ricorsione RLS)', () => {
  for (const name of ['profiles_select_admin_all', 'profiles_update_admin_all']) {
    const body = lastPolicyBody(name);
    assert.doesNotMatch(
      body,
      /FROM public\.profiles/,
      `${name}: contiene una subquery su profiles nella propria policy — causa ricorsione infinita (42P17). Deve usare public.is_admin(auth.uid()) invece.`
    );
    assert.match(body, /public\.is_admin\(auth\.uid\(\)\)/, `${name}: deve controllare l'admin tramite public.is_admin(auth.uid())`);
  }
});

test('le altre policy "admin" (employee_requests, daily_punches, geofence, audit_log) usano is_admin()', () => {
  const names = [
    'daily_punches_select_own_or_admin',
    'daily_punches_insert_own_or_admin',
    'daily_punches_update_own_or_admin',
    'employee_requests_select_own_or_admin',
    'employee_requests_update_admin',
    'geofence_update_admin',
    'audit_log_select_admin_only',
  ];
  for (const name of names) {
    const body = lastPolicyBody(name);
    assert.match(body, /public\.is_admin\(auth\.uid\(\)\)/, `${name}: deve usare public.is_admin(auth.uid())`);
  }
});

test('la sezione di pulizia funzioni "is admin" ridondanti non droppa più is_admin(uuid)', () => {
  // Regressione specifica: la pulizia iniziale droppava is_admin(uuid) come
  // "ridondante" prima che una sezione successiva lo ricreasse — su un DB
  // dove quella sezione successiva era già stata applicata, il semplice
  // re-run dello script falliva (DROP FUNCTION ... dipendenze in uso).
  assert.doesNotMatch(sql, /DROP FUNCTION IF EXISTS public\.is_admin\(uuid\)/);
});
