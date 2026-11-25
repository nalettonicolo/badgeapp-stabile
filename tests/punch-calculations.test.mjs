/**
 * Casi limite di calculateWorkMinutes e analyzePunchNonConformity (js/utils.js):
 * con e senza pausa, giornata aperta, orari 00:00, valori negativi/incoerenti.
 * Complementare a tests/utils.test.mjs (che copre solo i casi base).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateWorkMinutes, analyzePunchNonConformity } from '../js/utils.js';

// calculateWorkMinutes scrive un console.warn sugli orari fuori sequenza:
// lo silenziamo nei test per non sporcare l'output.
const quiet = (t) => t.mock.method(console, 'warn', () => {});

// -----------------------------------------------------------------------------
// calculateWorkMinutes
// -----------------------------------------------------------------------------

test('calculateWorkMinutes: con pausa la pausa è esclusa (4h + 4h = 8h)', () => {
  assert.equal(
    calculateWorkMinutes({
      iniziomattina: '08:00', finemattina: '12:30',
      iniziopomeriggio: '13:30', finepomeriggio: '17:00',
    }),
    4 * 60 + 30 + 3 * 60 + 30
  );
});

test('calculateWorkMinutes: senza pausa (solo ingresso/uscita) è la durata lorda', () => {
  assert.equal(calculateWorkMinutes({ iniziomattina: '08:00', finepomeriggio: '17:00' }), 540);
});

test('calculateWorkMinutes: accetta orari HH:MM:SS (i secondi vengono ignorati)', () => {
  assert.equal(
    calculateWorkMinutes({ iniziomattina: '08:00:59', finepomeriggio: '17:00:00' }),
    540
  );
});

test('calculateWorkMinutes: solo il segmento mattina completo', () => {
  assert.equal(calculateWorkMinutes({ iniziomattina: '08:00', finemattina: '12:00' }), 240);
});

test('calculateWorkMinutes: solo il segmento pomeriggio completo', () => {
  assert.equal(calculateWorkMinutes({ iniziopomeriggio: '14:00', finepomeriggio: '18:00' }), 240);
});

test('calculateWorkMinutes: giornata aperta (solo ingresso) vale 0, senza NaN', () => {
  const minutes = calculateWorkMinutes({ iniziomattina: '08:00' });
  assert.equal(minutes, 0);
});

test('calculateWorkMinutes: giornata aperta dopo la pausa conta solo la mattina chiusa', () => {
  assert.equal(
    calculateWorkMinutes({ iniziomattina: '08:00', finemattina: '12:00', iniziopomeriggio: '13:00' }),
    240
  );
});

test('calculateWorkMinutes: oggetto vuoto vale 0', () => {
  assert.equal(calculateWorkMinutes({}), 0);
});

test('calculateWorkMinutes: campi null/stringa vuota valgono 0', () => {
  assert.equal(
    calculateWorkMinutes({ iniziomattina: null, finemattina: '', iniziopomeriggio: undefined, finepomeriggio: null }),
    0
  );
});

test('calculateWorkMinutes: mattina fuori sequenza → mai negativo (0)', (t) => {
  quiet(t);
  assert.equal(calculateWorkMinutes({ iniziomattina: '17:00', finemattina: '08:00' }), 0);
});

test('calculateWorkMinutes: pomeriggio fuori sequenza che porta il totale sotto zero → 0', (t) => {
  quiet(t);
  // mattina +240, pomeriggio 13:00-18:00 invertito = -300 → totale -60 → 0.
  assert.equal(
    calculateWorkMinutes({
      iniziomattina: '08:00', finemattina: '12:00',
      iniziopomeriggio: '18:00', finepomeriggio: '13:00',
    }),
    0
  );
});

test('calculateWorkMinutes: orario 00:00 come fine non produce negativi né NaN', (t) => {
  quiet(t);
  const minutes = calculateWorkMinutes({ iniziomattina: '08:00', finepomeriggio: '00:00' });
  assert.ok(Number.isFinite(minutes), `atteso un numero finito, ottenuto ${minutes}`);
  assert.ok(minutes >= 0, `atteso >= 0, ottenuto ${minutes}`);
});

test('calculateWorkMinutes: valori negativi nelle stringhe sono ignorati, risultato 0', (t) => {
  quiet(t);
  // "-01:00" → -60 minuti: il codice richiede > 0 per considerare il campo.
  assert.equal(calculateWorkMinutes({ iniziomattina: '08:00', finemattina: '-01:00' }), 0);
  assert.equal(calculateWorkMinutes({ iniziomattina: '-01:00', finepomeriggio: '17:00' }), 0);
});

test('calculateWorkMinutes: stringhe non orario non producono NaN', (t) => {
  quiet(t);
  const minutes = calculateWorkMinutes({ iniziomattina: 'abc', finepomeriggio: 'xyz' });
  assert.equal(minutes, 0);
});

test(
  'calculateWorkMinutes: ingresso alle 00:00 (turno di notte) dovrebbe contare le ore',
  {
    todo:
      'oggi "startMorning > 0" scarta 00:00 perché 0 = "assente" (js/utils.js, calculateWorkMinutes): ' +
      'iniziomattina 00:00 + finepomeriggio 08:00 restituisce 0 invece di 480. ' +
      'Va deciso se 00:00 è un orario valido (serve distinguere "vuoto" da 0) prima di togliere il todo.',
  },
  () => {
    assert.equal(calculateWorkMinutes({ iniziomattina: '00:00', finepomeriggio: '08:00' }), 480);
  }
);

test(
  'calculateWorkMinutes: punch null/undefined dovrebbe restituire 0',
  {
    todo:
      'oggi lancia TypeError (accesso a punch.iniziomattina senza controllo): ' +
      'analyzePunchNonConformity e computePresenceStatus invece accettano null. Serve un "if (!punch) return 0".',
  },
  () => {
    assert.equal(calculateWorkMinutes(null), 0);
    assert.equal(calculateWorkMinutes(undefined), 0);
  }
);

// -----------------------------------------------------------------------------
// analyzePunchNonConformity
// -----------------------------------------------------------------------------

test('analyzePunchNonConformity: giornata continuata senza pausa è conforme', () => {
  assert.deepEqual(analyzePunchNonConformity({ iniziomattina: '08:00', finepomeriggio: '17:00' }), []);
});

test('analyzePunchNonConformity: giornata aperta (solo ingresso) è conforme', () => {
  assert.deepEqual(analyzePunchNonConformity({ iniziomattina: '08:00' }), []);
  assert.deepEqual(
    analyzePunchNonConformity({ iniziomattina: '08:00', finemattina: '12:00' }),
    []
  );
});

test('analyzePunchNonConformity: con pausa, inizio pomeriggio prima della fine mattina', () => {
  const issues = analyzePunchNonConformity({
    iniziomattina: '08:00', finemattina: '13:00', iniziopomeriggio: '12:00',
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Inizio pomeriggio precedente/);
});

test('analyzePunchNonConformity: uscita prima dell\'ingresso del pomeriggio', () => {
  const issues = analyzePunchNonConformity({
    iniziomattina: '08:00', finemattina: '12:00',
    iniziopomeriggio: '17:00', finepomeriggio: '13:00',
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Uscita precedente/);
});

test('analyzePunchNonConformity: più incoerenze insieme vengono tutte segnalate', () => {
  const issues = analyzePunchNonConformity({
    iniziomattina: '12:00', finemattina: '08:00',
    iniziopomeriggio: '07:00', finepomeriggio: '06:00',
  });
  assert.equal(issues.length, 3);
});

test('analyzePunchNonConformity: 00:00 è un orario presente (non "vuoto") → ingresso a mezzanotte è conforme', () => {
  assert.deepEqual(analyzePunchNonConformity({ iniziomattina: '00:00', finepomeriggio: '08:00' }), []);
});

test('analyzePunchNonConformity: fine mattina a 00:00 dopo un ingresso alle 08:00 è fuori sequenza', () => {
  const issues = analyzePunchNonConformity({ iniziomattina: '08:00', finemattina: '00:00' });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Fine mattina precedente/);
});

test('analyzePunchNonConformity: campi con soli spazi sono trattati come assenti', () => {
  assert.deepEqual(analyzePunchNonConformity({ iniziomattina: '   ' }), []);
  const issues = analyzePunchNonConformity({ iniziomattina: '   ', finepomeriggio: '17:00' });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /senza ingresso mattina/);
});

test('analyzePunchNonConformity: valori negativi non fanno crollare la funzione e vengono segnalati', () => {
  const issues = analyzePunchNonConformity({ iniziomattina: '08:00', finemattina: '-01:00' });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Fine mattina precedente/);
});

test('analyzePunchNonConformity: orari uguali (durata zero) non sono una non conformità', () => {
  assert.deepEqual(
    analyzePunchNonConformity({ iniziomattina: '08:00', finemattina: '08:00' }),
    []
  );
});
