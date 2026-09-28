// The api serves the built web app in production: assets as files, every page as index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { serveWeb, isApiPath } from './static.js';

function fakeDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-dist-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Expert Sessions</title>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  return dir;
}

async function get(server, urlPath) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, cache: res.headers['cache-control'] }));
    }).on('error', reject);
  });
}

test('pages come back as index.html, assets as themselves, api paths pass through', async () => {
  const app = express();
  app.use(serveWeb(fakeDist()));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    for (const page of ['/', '/console', '/guru', '/join/abc', '/s/guruji/sessions']) {
      const r = await get(server, page);
      assert.equal(r.status, 200, page);
      assert.match(r.body, /Expert Sessions/);
      assert.equal(r.cache, 'no-cache');
    }
    const asset = await get(server, '/assets/app-abc123.js');
    assert.equal(asset.body, 'console.log(1)');
    assert.match(asset.cache, /immutable/);
    const api = await get(server, '/api/health');
    assert.deepEqual(JSON.parse(api.body), { ok: true });
  } finally {
    server.close();
  }
});

test('refuses to start when the web app has not been built', () => {
  assert.throws(() => serveWeb(path.join(os.tmpdir(), 'es-no-such-dist')), /pnpm --filter web build/);
});

test('knows which paths belong to the api and the providers', () => {
  for (const p of ['/api/health', '/socket.io/?EIO=4', '/webhook', '/razorpay/webhook']) assert.equal(isApiPath(p), true, p);
  for (const p of ['/', '/console', '/join/x', '/apiary']) assert.equal(isApiPath(p), false, p);
});
