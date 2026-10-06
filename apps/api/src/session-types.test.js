// A guru's kinds of sitting, checked at the edge, and the words a button shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSessionTypes, typeLabel, MAX_SESSION_TYPES } from './session-types.js';

const good = { types: [
  { name: 'Quick guidance', minutes: 10, dakshinaPaise: 50000, active: true },
  { name: '', minutes: 20, dakshinaPaise: 100000, active: true },
] };

test('up to three kinds, each a length and a dakshina, at least one active', () => {
  assert.equal(validateSessionTypes(good), null);
  assert.equal(MAX_SESSION_TYPES, 3);
  assert.match(validateSessionTypes({ types: [...good.types, ...good.types] }), /At most 3/);
  assert.match(validateSessionTypes({ types: [{ ...good.types[0], active: false }] }), /at least one/);
  assert.match(validateSessionTypes({ types: [{ ...good.types[0], minutes: 3 }] }), /5 to 180/);
  assert.match(validateSessionTypes({ types: [] }), /at least one/);
});

test('a button reads as length and dakshina, in her language, within WhatsApp\'s twenty characters', () => {
  const t = { minutes: 10, dakshina_paise: 50000 };
  assert.equal(typeLabel(t, 'en'), '10 min · ₹500');
  assert.equal(typeLabel(t, 'hi'), '10 मिनट · ₹500');
  assert.ok(typeLabel({ minutes: 180, dakshina_paise: 10_000_000 }, 'hi').length <= 20);
});
