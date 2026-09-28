import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingFor, waLink } from './qr-codes.js';

test('the three known sources have fixed greetings the WhatsApp door recognises', () => {
  assert.equal(greetingFor('live', 'anything'), 'Hi — from the live');
  assert.equal(greetingFor('ashram', ''), 'Hi — ashram');
  assert.equal(greetingFor('poster', ''), 'Hi — poster');
});

test('the button on his own page is attributed to the page', () => {
  assert.equal(greetingFor('page', ''), 'Hi — from his page');
});

test('a custom label becomes its own greeting', () => {
  assert.equal(greetingFor('custom', 'Jaipur satsang hall'), 'Hi — Jaipur satsang hall');
});

test('the wa.me link uses digits only and URL-encodes the greeting', () => {
  assert.equal(waLink('+1 555-000-1234', 'Hi — poster'), 'https://wa.me/15550001234?text=Hi%20%E2%80%94%20poster');
});
