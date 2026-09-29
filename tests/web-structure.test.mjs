/**
 * Smoke test strutturale sul sito web statico: verifica che index.html non
 * sia rotto (elementi chiave presenti, script bilanciato, funzioni critiche
 * ancora cablate) senza dover avviare un browser reale.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const REQUIRED_IDS = [
  'loading-view',
  'login-view',
  'punch-view',
  'history-view',
  'admin-view',
  'back-from-history-btn',
  'back-from-history-footer-btn',
  'back-from-admin-btn',
  'back-from-admin-footer-btn',
  'month-select',
  'timbraBtn',
  'geo-autopunch-toggle',
  'geofence-map',
  'geofence-save-btn',
  'geofence-clear-btn',
  'pending-requests-ul',
];

for (const id of REQUIRED_IDS) {
  test(`index.html contiene l'elemento #${id}`, () => {
    assert.ok(html.includes(`id="${id}"`), `manca #${id}`);
  });
}

test('index.html collega styles.css', () => {
  assert.match(html, /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/);
});

test('index.html importa le funzioni pure da js/utils.js', () => {
  assert.match(html, /from ['"]\.\/js\/utils\.js['"]/);
});

function extractInlineModuleScript() {
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(m, 'nessun blocco <script type="module"> trovato prima di </body>');
  return m[1];
}

test('lo script inline ha le parentesi graffe bilanciate', () => {
  const js = extractInlineModuleScript();
  let depth = 0;
  for (const ch of js) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    assert.ok(depth >= 0, 'parentesi graffa di chiusura in eccesso: script probabilmente rotto a metà');
  }
  assert.equal(depth, 0, `parentesi graffe non bilanciate (${depth > 0 ? '+' : ''}${depth})`);
});

test('le funzioni/guardie critiche dell\'app sono ancora presenti', () => {
  const js = extractInlineModuleScript();
  assert.match(js, /function updateAuthUI/);
  assert.match(js, /finally/);
  assert.match(js, /function goBackFromHistoryToPunch/);
  assert.match(js, /function goBackFromAdminToPunch/);
});

test('supabase-config.js espone la configurazione attesa', () => {
  const cfg = readFileSync(join(root, 'supabase-config.js'), 'utf8');
  assert.match(cfg, /__BADGEAPP_SUPABASE__/);
});

test('index.html collega il manifest PWA e registra il service worker', () => {
  assert.match(html, /<link\s+rel="manifest"\s+href="manifest\.webmanifest"\s*\/?>/);
  assert.match(html, /navigator\.serviceWorker\.register\(['"]\/sw\.js['"]\)/);
});

test('manifest.webmanifest è JSON valido con i campi PWA minimi', () => {
  const raw = readFileSync(join(root, 'manifest.webmanifest'), 'utf8');
  const manifest = JSON.parse(raw); // lancia se il JSON è malformato
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length > 0);
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  for (const icon of manifest.icons) {
    const iconPath = join(root, icon.src.replace(/^\//, ''));
    assert.ok(existsSync(iconPath), `icona mancante su disco: ${icon.src}`);
  }
});

test('sw.js non intercetta mai richieste cross-origin (Supabase/CDN)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /url\.origin\s*!==\s*self\.location\.origin/);
});

test('sw.js usa network-first per l\'app shell (mai stale-while-revalidate)', () => {
  // Regressione osservata durante lo sviluppo: con "cached || network" un
  // tester online continuava a vedere una versione vecchia della pagina.
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /cached \|\| network/);
  assert.match(sw, /\.catch\(\(\) => caches\.match\(req\)\)/);
});

test('sw.js bypassa anche la cache HTTP del browser, non solo la Cache Storage', () => {
  // Regressione osservata durante lo sviluppo: "network-first" a livello di
  // service worker non basta da solo — un fetch() senza cache:'no-store' può
  // comunque ricevere un 304 Not Modified dalla cache HTTP del browser e
  // mostrare contenuto vecchio anche quando il server ne ha uno nuovo.
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /fetch\(req,\s*\{\s*cache:\s*['"]no-store['"]\s*\}\)/);
});

test('il conteggio giorni delle ferie esclude sabato e domenica, non i giorni di calendario', () => {
  const js = extractInlineModuleScript();
  assert.match(js, /countBusinessDays\(row\.start_date, row\.end_date\)/);
  assert.match(js, /countBusinessDays\(req\.start_date, req\.end_date\)/);
});

test('index.html carica Leaflet e Leaflet.draw (mappa area geofence)', () => {
  assert.match(html, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
  assert.match(html, /leaflet-draw@1\.0\.4\/dist\/leaflet\.draw\.js/);
});

test('index.html importa le funzioni geofence da js/utils.js', () => {
  assert.match(html, /isInsideGeofence/);
  assert.match(html, /hasUsableGeofence/);
});

test('la timbratura automatica per posizione copre tutti i movimenti (ingresso mattutino, uscita pausa, rientro pomeridiano, uscita fine giornata), non solo l\'ingresso mattutino', () => {
  // Richiesta esplicita dell'utente ("TUTTI I MOVIMENTI IN INGRESSO E
  // USCITA"): nextAutoPunchField() sceglie il campo in base a cosa manca
  // ancora oggi per la direzione data, non un indice fisso — così una
  // timbratura già fatta a mano non viene mai duplicata né saltata.
  const js = extractInlineModuleScript();
  assert.match(js, /function nextAutoPunchField\(direction, state\)/);
  assert.match(js, /if\s*\(direction === "in"\)\s*\{\s*if\s*\(!s\.iniziomattina\)\s*return "iniziomattina";\s*if\s*\(!s\.iniziopomeriggio\)\s*return "iniziopomeriggio";/);
  assert.match(js, /if\s*\(s\.iniziomattina\s*&&\s*!s\.finemattina\)\s*return "finemattina";/);
  assert.match(js, /if\s*\(s\.iniziopomeriggio\s*&&\s*!s\.finepomeriggio\)\s*return "finepomeriggio";/);
  assert.match(js, /async function attemptAutoPunchForTransition\(direction\)/);
});

test('la timbratura automatica scatta SOLO su una transizione vera (fuori→dentro O dentro→fuori), con base persistita in localStorage (non in una variabile in memoria)', () => {
  // Scelta esplicita dell'utente: mai timbrare sulla semplice "sono dentro/
  // fuori adesso" senza una base nota. Per restare comunque robusta a iOS
  // Safari (che sospende il JS in background e farebbe perdere una semplice
  // variabile in memoria), la base "ero fuori/dentro" è letta e scritta su
  // localStorage, che sopravvive sia alla sospensione in background sia
  // alla chiusura completa dell'app nella stessa giornata.
  const js = extractInlineModuleScript();
  assert.match(js, /function loadGeofenceTransitionState/);
  assert.match(js, /function saveGeofenceTransitionState/);
  assert.match(js, /localStorage\.getItem\(GEOFENCE_TRANSITION_STORAGE_KEY\)/);
  assert.match(js, /localStorage\.setItem\(GEOFENCE_TRANSITION_STORAGE_KEY/);
  assert.match(js, /if\s*\(\s*wasInside\s*===\s*false\s*&&\s*insideNow\s*===\s*true\s*\)\s*\{/);
  assert.match(js, /attemptAutoPunchForTransition\("in"\)\.then\(\s*\(settled\)\s*=>\s*\{\s*saveGeofenceTransitionState\(settled\);/);
  assert.match(js, /else if\s*\(\s*wasInside\s*===\s*true\s*&&\s*insideNow\s*===\s*false\s*\)\s*\{/);
  assert.match(js, /attemptAutoPunchForTransition\("out"\)\.then\(\s*\(settled\)\s*=>\s*\{\s*saveGeofenceTransitionState\(!settled\);/);
});

test('la timbratura automatica non promette una timbratura imminente quando non c\'è una transizione rilevata (evita il messaggio fuorviante segnalato in review)', () => {
  const js = extractInlineModuleScript();
  // Se wasInside non è "false" (nessuna base nota, es. prima lettura del
  // giorno già dentro l'area) il messaggio non deve promettere una
  // timbratura automatica che non scatterà mai senza un movimento reale.
  assert.match(js, /wasInside === false\s*\?\s*"Sei entrato nell'area/);
  assert.match(js, /transizione dall'esterno.*registrala manualmente/);
  assert.match(js, /wasInside === true\s*\?\s*"Sei uscito dall'area/);
});

test('attemptAutoPunchForTransition segnala l\'esito (timbrato/nulla da fare vs da ritentare) invece di essere fire-and-forget', () => {
  const js = extractInlineModuleScript();
  // Un errore transitorio in lettura o scrittura deve restituire false, così
  // la transizione NON viene marcata come "gestita" e la prossima lettura
  // nella stessa direzione può ritentare, invece di perdere silenziosamente
  // la timbratura.
  assert.match(js, /async function attemptAutoPunchForTransition\(direction\)[\s\S]{0,2000}return false;[\s\S]{0,600}return true;/);
});

test('il flusso di approvazione richieste esiste ed esclude le rifiutate dal calendario', () => {
  const js = extractInlineModuleScript();
  assert.match(js, /async function loadPendingRequests/);
  assert.match(js, /async function updateRequestStatus/);
  // Le richieste rifiutate non devono comparire come assenza nello storico.
  assert.match(js, /\.neq\(\s*["']status["'],\s*["']rejected["']\s*\)/);
});

test('la dashboard "Presenze di oggi" esiste, usa lo stato derivato (mai posizione GPS) e si aggiorna solo mentre l\'admin la guarda', () => {
  assert.ok(html.includes('id="today-presence-ul"'), 'manca #today-presence-ul');
  assert.ok(html.includes('id="today-presence-summary"'), 'manca #today-presence-summary');
  const js = extractInlineModuleScript();
  assert.match(js, /async function loadTodayPresence/);
  assert.match(js, /computePresenceStatus\(punch\)/);
  // Auto-refresh legato al ciclo di vita della vista admin (mai in background altrove).
  assert.match(js, /function startTodayPresenceAutoRefresh/);
  assert.match(js, /function stopTodayPresenceAutoRefresh/);
  assert.match(js, /viewToShow === adminView/);
});

test('export CSV storico: bottone presente, esporta la tabella già a schermo (nessuna nuova query)', () => {
  assert.ok(html.includes('id="export-history-csv-btn"'), 'manca #export-history-csv-btn');
  const js = extractInlineModuleScript();
  assert.match(js, /function exportHistoryToCsv/);
  assert.match(js, /function extractVisibleTableRows/);
  assert.match(js, /rowsToCsv\(rows\)/);
  assert.match(js, /punchesTableContainer\.querySelector\(['"]#punches-table['"]\)/);
});

test('pannello admin "Monte ore ferie/ROL/permessi": selettore dipendente/anno, righe per tipo, carico/salvataggio', () => {
  for (const id of ['leave-balance-employee-select', 'leave-balance-year-input', 'leave-balance-load-btn', 'leave-balance-save-btn']) {
    assert.ok(html.includes(`id="${id}"`), `manca #${id}`);
  }
  for (const type of ['ferie', 'rol', 'permesso']) {
    assert.ok(html.includes(`data-leave-type="${type}"`), `manca la riga monte ore per "${type}"`);
  }
  const js = extractInlineModuleScript();
  assert.match(js, /async function loadLeaveBalanceForSelection/);
  assert.match(js, /async function saveLeaveBalanceForSelection/);
  // Upsert su tutti e tre i tipi in un colpo, coerente con la UNIQUE(user_id, year, leave_type).
  assert.match(js, /supabase\.from\(['"]leave_balances['"]\)\.upsert\(rows/);
  assert.match(js, /onConflict:\s*['"]user_id,year,leave_type['"]/);
});

test('prospetto ferie/ROL/permessi lato dipendente usa le funzioni pure computeLeaveUsage/computeLeaveProspectus', () => {
  assert.ok(html.includes('id="leave-prospectus-body"'), 'manca #leave-prospectus-body');
  const js = extractInlineModuleScript();
  assert.match(js, /async function loadLeaveProspectus/);
  assert.match(js, /computeLeaveUsage\(requests \|\| \[\], leaveType, year\)/);
  assert.match(js, /computeLeaveProspectus\(balance, used\)/);
});

test('upload busta paga: file su Storage privato, ore dichiarate confrontate con quelle calcolate dall\'app, OCR degrada senza bloccare', () => {
  for (const id of ['payslip-month-select', 'payslip-file-input', 'payslip-upload-btn', 'payslip-ocr-btn', 'payslip-save-declared-btn']) {
    assert.ok(html.includes(`id="${id}"`), `manca #${id}`);
  }
  for (const type of ['ferie', 'rol', 'permesso']) {
    assert.ok(html.includes(`data-leave-type="${type}"`) && html.match(new RegExp(`payslip-declared-row[^>]*data-leave-type="${type}"`)), `manca la riga confronto busta paga per "${type}"`);
  }
  const js = extractInlineModuleScript();
  assert.match(js, /async function uploadPayslipFile/);
  assert.match(js, /supabase\.storage\.from\(["']payslips["']\)\.upload\(/);
  assert.match(js, /supabase\.from\(["']payslip_documents["']\)\.upsert\(/);
  assert.match(js, /async function computeMonthlyLeaveAmount|function computeMonthlyLeaveAmount/);
  // L'OCR è opzionale: un errore/funzione non deployata non deve bloccare l'inserimento manuale.
  assert.match(js, /async function requestPayslipOcr/);
  assert.match(js, /catch\s*\(err\)\s*\{\s*console\.warn\(["']OCR busta paga non disponibile/);
});

test('upload busta paga: l\'estensione del path Storage è sanificata (niente slash/punti dal nome file scelto dall\'utente)', () => {
  const js = extractInlineModuleScript();
  // Un nome file senza punto (es. "IMG12345") non deve finire per intero
  // nel path come "estensione" — e comunque solo caratteri alfanumerici
  // possono comporre l'estensione usata nel path Storage.
  assert.match(js, /lastIndexOf\(["']\.["']\)/);
  assert.match(js, /replace\(\/\[\^a-z0-9\]\/g, ["']["']\)/);
});

test('ROL è una categoria di richiesta separata da permesso, con pulsanti, campo ore e colore propri', () => {
  for (const id of ['req-rol-head', 'req-rol-btn', 'req-rol-fields', 'req-rol-hours']) {
    assert.ok(html.includes(`id="${id}"`), `manca #${id}`);
  }
  const js = extractInlineModuleScript();
  // Etichetta e colore dedicati, distinti da malattia/trasferta/ferie/permesso.
  assert.match(js, /REQUEST_TYPE_LABELS\s*=\s*\{[^}]*\brol:\s*["']ROL["']/);
  assert.match(js, /REQUEST_TYPE_COLORS\s*=\s*\{[^}]*\brol:\s*['"]#[0-9a-fA-F]{6}['"]/);
  // Il tipo "rol" apre il modale con il proprio campo ore (non riusa i campi trasferta/ferie).
  assert.match(js, /type === "rol"/);
  // Il submit salva le ore ROL dichiarate in total_hours_declared (stessa colonna del prospetto).
  assert.match(js, /currentEmployeeRequestType === "rol"[\s\S]{0,400}total_hours_declared\s*=\s*parseFloat\(reqRolHours\.value\)/);
});
