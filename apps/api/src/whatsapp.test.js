// Reading Meta's webhook body. The shapes are from the Cloud API docs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInbound } from './whatsapp.js';

function inbound(message, contacts = [{ profile: { name: 'Priya Nair' }, wa_id: '919829012345' }]) {
  return { entry: [{ changes: [{ value: {
    metadata: { display_phone_number: '15550001234', phone_number_id: '1234567890' },
    contacts,
    messages: [{ from: '919829012345', ...message }],
  } }] }] };
}

test('a text says who wrote, to which number, what, and the name she shows on WhatsApp', () => {
  assert.deepEqual(parseInbound(inbound({ type: 'text', text: { body: 'Hi — from the live' } })),
    { from: '919829012345', to: '15550001234', profileName: 'Priya Nair', kind: 'text', text: 'Hi — from the live' });
});

test('without a profile name the door still knows her number, and the name is null not blank', () => {
  assert.equal(parseInbound(inbound({ type: 'text', text: { body: 'Hi' } }, [])).profileName, null);
  assert.equal(parseInbound(inbound({ type: 'text', text: { body: 'Hi' } }, [{ profile: { name: '   ' } }])).profileName, null);
});

test('a tapped slot button carries the slot id', () => {
  const msg = parseInbound(inbound({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'slot:2026-09-16T16:00', title: 'Wed 4:00 pm' } } }));
  assert.equal(msg.kind, 'button');
  assert.equal(msg.id, 'slot:2026-09-16T16:00');
});

test('a list pick looks the same as a button to the door', () => {
  const msg = parseInbound(inbound({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'more', title: 'Other times' } } }));
  assert.equal(msg.kind, 'list');
  assert.equal(msg.id, 'more');
});

test('a voice note gives the media id to fetch later', () => {
  assert.equal(parseInbound(inbound({ type: 'audio', audio: { id: 'MEDIA123' } })).mediaId, 'MEDIA123');
});

test('delivery and read receipts are ignored', () => {
  const statusUpdate = { entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }] };
  assert.equal(parseInbound(statusUpdate), null);
  assert.equal(parseInbound({}), null);
});
