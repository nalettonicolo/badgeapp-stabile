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
