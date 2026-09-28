// The tokens we hand 100ms. Signed here rather than with a library, so they are worth a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { videoClient, signJwt } from './video.js';

const wired = { HMS_ACCESS_KEY: 'key123', HMS_SECRET: 'shhh', HMS_TEMPLATE_ID: 'tpl123' };

function read(token) {
  const [head, body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', wired.HMS_SECRET).update(`${head}.${body}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { head: JSON.parse(Buffer.from(head, 'base64url')), body: JSON.parse(Buffer.from(body, 'base64url')), signed: mac === expected };
}

test('a signed token is HS256 and its signature checks out', () => {
  const { head, signed } = read(signJwt({ hello: 'there' }, wired.HMS_SECRET));
  assert.deepEqual(head, { alg: 'HS256', typ: 'JWT' });
  assert.equal(signed, true);
});

test('her token names the room, her, and the role that cannot moderate', () => {
  const video = videoClient(wired);
  const { body, signed } = read(video.authToken({ roomId: 'room1', userId: 'devotee-1', who: 'devotee' }));
  assert.equal(signed, true);
  assert.equal(body.room_id, 'room1');
  assert.equal(body.user_id, 'devotee-1');
  assert.equal(body.role, 'guest');
  assert.equal(body.type, 'app');
  assert.ok(body.exp > body.iat, 'it expires');
});

test('guruji joins the same room in the host role', () => {
  const video = videoClient(wired);
  assert.equal(read(video.authToken({ roomId: 'room1', userId: 'guru-1', who: 'guru' })).body.role, 'host');
});

test('the roles can be renamed to match his 100ms template', () => {
  const video = videoClient({ ...wired, HMS_ROLE_GURU: 'guruji', HMS_ROLE_DEVOTEE: 'devotee' });
  assert.equal(read(video.authToken({ roomId: 'r', userId: 'u', who: 'devotee' })).body.role, 'devotee');
});

test('with no credentials nothing is minted, and the message says what to set', () => {
  const video = videoClient({});
  assert.equal(video.isConfigured(), false);
  assert.throws(() => video.authToken({ roomId: 'r', userId: 'u', who: 'devotee' }), /HMS_ACCESS_KEY, HMS_SECRET and HMS_TEMPLATE_ID/);
});

test('the wired client says so', () => {
  assert.equal(videoClient(wired).isConfigured(), true);
});
