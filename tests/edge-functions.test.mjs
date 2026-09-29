/**
 * Guardia di regressione per la Edge Function ocr-payslip: non è un runtime
 * Deno vero (qui gira Node), solo controlli testuali mirati sui punti che
 * hanno già causato un bug reale in questo repo — la mancata gestione CORS
 * (supabase.functions.invoke() dal browser è una richiesta cross-origin:
 * senza questi header e senza rispondere alla preflight OPTIONS, la chiamata
 * fallisce sempre lato browser, indipendentemente da ANTHROPIC_API_KEY).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'supabase/functions/ocr-payslip/index.ts'), 'utf8');

test('ocr-payslip gestisce la preflight CORS (OPTIONS) e imposta Access-Control-Allow-Origin su tutte le risposte', () => {
  assert.match(src, /Access-Control-Allow-Origin/);
  assert.match(src, /req\.method === ["']OPTIONS["']/);
  // jsonResponse deve includere gli header CORS su OGNI risposta (successo o errore),
  // non solo sul caso felice, altrimenti gli errori restano invisibili al browser.
  assert.match(src, /function jsonResponse[\s\S]{0,300}corsHeaders/);
});

test('ocr-payslip richiede un Authorization header e usa un client scoped alla RLS dell\'utente, non la service role', () => {
  assert.match(src, /req\.headers\.get\(["']Authorization["']\)/);
  // Deve creare il client Supabase passando l'Authorization dell'utente, non
  // una service_role key: così la RLS resta in vigore (l'utente può leggere/
  // scrivere solo il proprio documento, o qualsiasi se admin).
  assert.match(src, /global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader\s*\}\s*\}/);
  assert.doesNotMatch(src, /SERVICE_ROLE/);
});

test('ocr-payslip non conferma mai da sola i valori letti (verified non viene mai impostato a true qui)', () => {
  assert.doesNotMatch(src, /verified:\s*true/);
});

test('ocr-payslip degrada esplicitamente senza ANTHROPIC_API_KEY, invece di fallire in modo silenzioso', () => {
  assert.match(src, /if\s*\(!ANTHROPIC_API_KEY\)/);
  assert.match(src, /501/);
});
