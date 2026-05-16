#!/usr/bin/env node
/**
 * Smoke / backtest: web HTML sanity + mobile TypeScript check.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function fail(msg) {
  errors.push(msg);
  console.error('FAIL:', msg);
}

function ok(msg) {
  console.log('OK:', msg);
}

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

function checkWebHtml(filePath) {
  if (!existsSync(filePath)) {
    fail(`Missing ${filePath}`);
    return;
  }
  const html = readFileSync(filePath, 'utf8');
  for (const id of REQUIRED_IDS) {
    if (!html.includes(`id="${id}"`)) {
      fail(`${filePath}: missing element #${id}`);
    }
  }
  const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>\s*<\/body>/);
  if (!scriptMatch) {
    fail(`${filePath}: no module script block found`);
    return;
  }
  const js = scriptMatch[1];
  let depth = 0;
  for (const ch of js) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) {
      fail(`${filePath}: unbalanced braces in inline script`);
      return;
    }
  }
  if (depth !== 0) {
    fail(`${filePath}: unbalanced braces (${depth > 0 ? '+' : ''}${depth}) in inline script`);
    return;
  }
  if (!js.includes('function updateAuthUI') || !js.includes('finally')) {
    fail(`${filePath}: updateAuthUI / finally guard missing`);
    return;
  }
  if (!js.includes('goBackFromHistoryToPunch') || !js.includes('goBackFromAdminToPunch')) {
    fail(`${filePath}: back navigation helpers missing`);
    return;
  }
  ok(`Web HTML checks passed: ${filePath}`);
}

checkWebHtml(join(root, 'index.html'));
checkWebHtml(join(root, 'BadgeApp_stabile_netlify', 'index.html'));

const cfgPath = join(root, 'supabase-config.js');
if (existsSync(cfgPath)) {
  const cfg = readFileSync(cfgPath, 'utf8');
  if (!cfg.includes('__BADGEAPP_SUPABASE__')) {
    fail('supabase-config.js: missing __BADGEAPP_SUPABASE__ export');
  } else {
    ok('supabase-config.js present');
  }
}

const mobileDir = join(root, 'badgeapp-mobile');
if (existsSync(join(mobileDir, 'package.json'))) {
  const tsc = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '--noEmit'],
    { cwd: mobileDir, encoding: 'utf8', shell: process.platform === 'win32' }
  );
  if (tsc.status !== 0) {
    fail(`badgeapp-mobile tsc:\n${tsc.stdout || ''}${tsc.stderr || ''}`);
  } else {
    ok('badgeapp-mobile TypeScript check passed');
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll backtests passed.');
