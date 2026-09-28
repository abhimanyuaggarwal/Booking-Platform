// Everything that talks to Meta's WhatsApp Cloud API lives here.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages

import axios from 'axios';
import { ProviderError } from './errors.js';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export function client(env) {
  const url = `${GRAPH_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` };

  async function send(payload) {
    try {
      await axios.post(url, { messaging_product: 'whatsapp', ...payload }, { headers });
    } catch (err) {
      // Meta's error body says exactly what is wrong (bad token, unverified recipient, ...).
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      throw new ProviderError(`WhatsApp send failed for ${payload.to}: ${detail}`);
    }
  }

  return {
    text(to, body) {
      return send({ to, type: 'text', text: { body } });
    },

    // Up to 3 buttons. Each: { id, title } — title max 20 characters.
    buttons(to, body, buttons) {
      return send({
        to, type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
        },
      });
    },

    // Up to 10 rows across sections. rows: { id, title, description? }
    list(to, body, buttonLabel, sections) {
      return send({
        to, type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: body },
          action: { button: buttonLabel, sections },
        },
      });
    },

    // A single tappable link button, e.g. "Pay ₹500" or "Join session".
    link(to, body, buttonLabel, href) {
      return send({
        to, type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: body },
          action: { name: 'cta_url', parameters: { display_text: buttonLabel, url: href } },
        },
      });
    },
  };
}

/**
 * Pull the one thing we care about out of Meta's nested webhook body.
 * Returns null for status updates (delivered/read) and anything we don't handle.
 * `to` is the business number she wrote to, which tells us which guru.
 * `profileName` is the name she shows on WhatsApp, which Meta sends with every message. It is the
 * only name the door will ever have for her, so guruji sees "Priya" and not "Someone".
 * @returns {{from: string, to: string, profileName: string|null, kind: 'text'|'button'|'list'|'audio', text?: string, id?: string, mediaId?: string} | null}
 */
export function parseInbound(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return null;

  const who = {
    from: msg.from,
    to: value.metadata?.display_phone_number ?? null,
    profileName: value.contacts?.[0]?.profile?.name?.trim() || null,
  };
  if (msg.type === 'text') return { ...who, kind: 'text', text: msg.text.body };
  if (msg.type === 'audio') return { ...who, kind: 'audio', mediaId: msg.audio.id };
  if (msg.type === 'interactive' && msg.interactive.type === 'button_reply') {
    return { ...who, kind: 'button', id: msg.interactive.button_reply.id };
  }
  if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
    return { ...who, kind: 'list', id: msg.interactive.list_reply.id };
  }
  return null;
}
