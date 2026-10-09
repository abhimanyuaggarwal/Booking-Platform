// Every module must at least load: a name missing from a re-export list (packages/shared/index.js) is a
// crash at startup, and no route test imports the routers. This one does. (server.js is left out: it listens.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const skip = new Set(['server.js', 'seed.js', 'demo.js', 'migrate.js']);
const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && !skip.has(f));

test('every api module imports cleanly, so a missing export is caught here and not at deploy', async () => {
  for (const f of files) await assert.doesNotReject(() => import(`./${f}`), `${f} failed to load`);
  assert.ok(files.includes('console-routes.js') && files.includes('site-routes.js'));
});
