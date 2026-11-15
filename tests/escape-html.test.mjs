/**
 * escapeHtml deve neutralizzare l'HTML inserito dagli utenti (es. nome o nota
 * di una richiesta) prima che finisca in innerHTML.
 *
 * STATO: in js/utils.js e in index.html NON esiste ancora nessuna funzione
 * escapeHtml (né equivalenti: cercato "escape", "sanitiz" in index.html), mentre
 * index.html usa innerHTML in molti punti. Il test è quindi marcato "todo":
 * il corpo è già pronto e parte da solo (importando dinamicamente la funzione);
 * quando escapeHtml sarà esportata da js/utils.js basta togliere "todo".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MOTIVO_TODO =
  'escapeHtml non esiste ancora in js/utils.js: va aggiunta (e usata dove index.html costruisce innerHTML con dati utente) prima di togliere il todo.';

async function loadEscapeHtml() {
  const mod = await import('../js/utils.js');
  assert.equal(typeof mod.escapeHtml, 'function', 'js/utils.js non esporta escapeHtml');
  return mod.escapeHtml;
}

test('escapeHtml neutralizza <img onerror>', { todo: MOTIVO_TODO }, async () => {
  const escapeHtml = await loadEscapeHtml();
  const out = escapeHtml('<img src=x onerror=alert(1)>');
  assert.doesNotMatch(out, /</, 'nessun "<" grezzo deve restare');
  assert.doesNotMatch(out, />/, 'nessun ">" grezzo deve restare');
  assert.match(out, /&lt;img/);
});

test('escapeHtml neutralizza virgolette e apici (attributi HTML)', { todo: MOTIVO_TODO }, async () => {
  const escapeHtml = await loadEscapeHtml();
  const out = escapeHtml(`" onmouseover="alert(1)" '`);
  assert.doesNotMatch(out, /"/);
  assert.doesNotMatch(out, /'/);
});

test('escapeHtml gestisce "&" una sola volta e valori nulli', { todo: MOTIVO_TODO }, async () => {
  const escapeHtml = await loadEscapeHtml();
  assert.equal(escapeHtml('Rossi & Figli'), 'Rossi &amp; Figli');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml('Mario Rossi'), 'Mario Rossi');
});
