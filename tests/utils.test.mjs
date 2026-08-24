import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isLikelyNetworkError,
  getLocalDateString,
  getTodayDateString,
  isRlsPolicyError,
  normalizeTimeForInput,
  timeToMinutes,
  analyzePunchNonConformity,
  minutesToHHMM,
  calculateWorkMinutes,
  inclusiveCalendarDays,
  overlapDaysInMonthRange,
} from '../js/utils.js';

test('isLikelyNetworkError riconosce errori di rete', () => {
  assert.equal(isLikelyNetworkError(new Error('Failed to fetch')), true);
  assert.equal(isLikelyNetworkError({ message: 'NetworkError when attempting to fetch resource' }), true);
  assert.equal(isLikelyNetworkError('Request timeout'), true);
  assert.equal(isLikelyNetworkError({ message: 'aborted' }), true);
});

test('isLikelyNetworkError non confonde errori applicativi con errori di rete', () => {
  assert.equal(isLikelyNetworkError({ message: 'new row violates row-level security policy' }), false);
  assert.equal(isLikelyNetworkError(null), false);
  assert.equal(isLikelyNetworkError(undefined), false);
});

test('isRlsPolicyError riconosce i due pattern noti di Postgres/Supabase', () => {
  assert.equal(isRlsPolicyError({ message: 'new row violates row-level security policy for table "profiles"' }), true);
  assert.equal(isRlsPolicyError({ message: 'permission denied', details: 'Row-Level Security' }), true);
  assert.equal(isRlsPolicyError({ message: 'Failed to fetch' }), false);
  assert.equal(isRlsPolicyError(null), false);
});

test('getLocalDateString formatta come YYYY-MM-DD in orario locale (non UTC)', () => {
  // 5 gennaio 2026, 23:30 locali: un getTodayDateString basato su ISO/UTC
  // sbaglierebbe giorno per chi è a est di UTC — questa è la regressione che
  // il codice originale evitava esplicitamente usando i getter locali.
  const d = new Date(2026, 0, 5, 23, 30, 0);
  assert.equal(getLocalDateString(d), '2026-01-05');
});

test('getLocalDateString aggiunge lo zero iniziale a mese e giorno', () => {
  const d = new Date(2026, 2, 7); // 7 marzo 2026
  assert.equal(getLocalDateString(d), '2026-03-07');
});

test('getTodayDateString delega a getLocalDateString con la data corrente', () => {
  assert.equal(getTodayDateString(), getLocalDateString());
});

test('normalizeTimeForInput accetta HH:MM e HH:MM:SS e normalizza sempre a HH:MM:SS', () => {
  // I minuti richiedono sempre 2 cifre (formato Postgres "time"); l'ora
  // singola cifra viene invece accettata e riformattata con lo zero iniziale.
  assert.equal(normalizeTimeForInput('8:05'), '08:05:00');
  assert.equal(normalizeTimeForInput('08:05'), '08:05:00');
  assert.equal(normalizeTimeForInput('08:05:30'), '08:05:30');
});

test('normalizeTimeForInput gestisce input vuoti/nulli senza generare errori', () => {
  assert.equal(normalizeTimeForInput(''), '');
  assert.equal(normalizeTimeForInput(null), '');
  assert.equal(normalizeTimeForInput(undefined), '');
});

test('normalizeTimeForInput restituisce l\'input originale se non è un orario riconoscibile', () => {
  assert.equal(normalizeTimeForInput('non-un-orario'), 'non-un-orario');
});

test('timeToMinutes converte HH:MM in minuti dalla mezzanotte', () => {
  assert.equal(timeToMinutes('08:30'), 510);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:59'), 1439);
});

test('timeToMinutes su input assenti/non validi restituisce 0 invece di NaN', () => {
  assert.equal(timeToMinutes(null), 0);
  assert.equal(timeToMinutes(''), 0);
  assert.equal(timeToMinutes(undefined), 0);
});

test('analyzePunchNonConformity non segnala nulla su una giornata regolare', () => {
  const issues = analyzePunchNonConformity({
    iniziomattina: '08:00', finemattina: '12:00',
    iniziopomeriggio: '13:00', finepomeriggio: '17:00',
  });
  assert.deepEqual(issues, []);
});

test('analyzePunchNonConformity non segnala nulla su una giornata parziale valida (buco intermedio)', () => {
  // Pattern esplicitamente supportato dall'app: solo ingresso/uscita, senza pausa.
  const issues = analyzePunchNonConformity({ iniziomattina: '08:00', finepomeriggio: '17:00' });
  assert.deepEqual(issues, []);
});

test('analyzePunchNonConformity rileva orari fuori sequenza', () => {
  const issues = analyzePunchNonConformity({ iniziomattina: '12:00', finemattina: '08:00' });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Fine mattina precedente/);
});

test('analyzePunchNonConformity rileva un\'uscita senza il corrispondente ingresso mattina', () => {
  const issues = analyzePunchNonConformity({ finepomeriggio: '17:00' });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /senza ingresso mattina/);
});

test('analyzePunchNonConformity con nessun dato restituisce array vuoto', () => {
  assert.deepEqual(analyzePunchNonConformity(null), []);
  assert.deepEqual(analyzePunchNonConformity({}), []);
});

test('minutesToHHMM formatta minuti positivi, negativi e zero', () => {
  assert.equal(minutesToHHMM(0), '00:00');
  assert.equal(minutesToHHMM(90), '01:30');
  assert.equal(minutesToHHMM(-45), '-00:45');
});

test('calculateWorkMinutes somma i due segmenti (mattina + pomeriggio) su giornata spezzata', () => {
  const minutes = calculateWorkMinutes({
    iniziomattina: '08:00', finemattina: '12:00',
    iniziopomeriggio: '13:00', finepomeriggio: '17:00',
  });
  assert.equal(minutes, 8 * 60); // 4h + 4h, pausa esclusa
});

test('calculateWorkMinutes calcola la durata lorda su giornata continuata (solo ingresso/uscita)', () => {
  const minutes = calculateWorkMinutes({ iniziomattina: '08:00', finepomeriggio: '17:00' });
  assert.equal(minutes, 9 * 60);
});

test('calculateWorkMinutes non va mai sotto zero anche con orari incoerenti', () => {
  const minutes = calculateWorkMinutes({ iniziomattina: '17:00', finemattina: '08:00' });
  assert.equal(minutes, 0);
});

test('inclusiveCalendarDays conta i giorni includendo entrambi gli estremi', () => {
  assert.equal(inclusiveCalendarDays('2026-03-01', '2026-03-01'), 1);
  assert.equal(inclusiveCalendarDays('2026-03-01', '2026-03-05'), 5);
});

test('inclusiveCalendarDays restituisce 0 su intervallo invertito o date non valide', () => {
  assert.equal(inclusiveCalendarDays('2026-03-05', '2026-03-01'), 0);
  assert.equal(inclusiveCalendarDays('non-una-data', '2026-03-01'), 0);
});

test('overlapDaysInMonthRange calcola correttamente una trasferta interamente nel mese', () => {
  assert.equal(overlapDaysInMonthRange('2026-03-10', '2026-03-15', 2026, 3), 6);
});

test('overlapDaysInMonthRange calcola solo i giorni di sovrapposizione su una trasferta a cavallo di due mesi', () => {
  // Trasferta 28 feb - 3 mar 2026: nel mese di marzo cadono solo 1, 2, 3 marzo.
  assert.equal(overlapDaysInMonthRange('2026-02-28', '2026-03-03', 2026, 3), 3);
  // Nello stesso mese di febbraio cadono solo 28 feb (2026 non bisestile).
  assert.equal(overlapDaysInMonthRange('2026-02-28', '2026-03-03', 2026, 2), 1);
});

test('overlapDaysInMonthRange restituisce 0 se la trasferta non tocca affatto il mese richiesto', () => {
  assert.equal(overlapDaysInMonthRange('2026-01-01', '2026-01-05', 2026, 3), 0);
});
