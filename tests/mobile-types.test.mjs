/**
 * Type-check dell'app mobile (badgeapp-mobile) con tsc --noEmit.
 * Richiede `npm ci` già eseguito in badgeapp-mobile/ (in CI è uno step
 * dedicato prima di questo test). In locale, se node_modules manca, il test
 * viene saltato con un messaggio esplicito invece di fallire rumorosamente.
 */
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobileDir = join(root, 'badgeapp-mobile');

test('badgeapp-mobile passa il type-check TypeScript', (t) => {
  if (!existsSync(join(mobileDir, 'node_modules'))) {
    t.skip('badgeapp-mobile/node_modules assente: esegui `npm ci` in badgeapp-mobile/ prima di questo test.');
    return;
  }
  const tsc = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '--noEmit'],
    { cwd: mobileDir, encoding: 'utf8', shell: process.platform === 'win32' }
  );
  if (tsc.status !== 0) {
    throw new Error(`tsc --noEmit fallito:\n${tsc.stdout || ''}${tsc.stderr || ''}`);
  }
});
