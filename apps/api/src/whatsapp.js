import crypto from 'node:crypto';
// Everything that talks to Meta's WhatsApp Cloud API lives here.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages

import axios from 'axios';
import { ProviderError } from './errors.js';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

/**
 * The client that speaks as this guru: his own number when it is live, the platform's number
 * otherwise. Every number lives under Slike's WhatsApp Business Account, so the token is one.
 */
export function clientFor(guru, env) {
  if (guru?.whatsapp_status === 'live' && guru.whatsapp_phone_number_id) {
    return client({ ...env, WHATSAPP_PHONE_NUMBER_ID: guru.whatsapp_phone_number_id });
  }
  return client(env);
}

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
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,   // which number speaks, for tests and the console
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
 * Putting a new number under Slike's WhatsApp Business Account, the way Meta's dashboard does it,
 * step by step: add the number with its display name, have Meta send a code to the SIM, verify it,
 * then register the number with a two-step PIN. Each call answers with Meta's own error text when it
 * fails, so the panel can show the admin what to fix. Needs WHATSAPP_BUSINESS_ACCOUNT_ID in .env.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers
 */
export function numbers(env) {
  const headers = { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` };
  async function call(path, body) {
    try {
      const res = await axios.post(`${GRAPH_URL}/${path}`, body, { headers });
      return res.data;
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      throw new ProviderError(`Meta refused ${path}: ${detail}`);
    }
  }
  return {
    /** @returns {{id: string}} Meta's id for the number */
    add({ countryCode, nationalNumber, displayName }) {
      if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) throw new ProviderError('WHATSAPP_BUSINESS_ACCOUNT_ID is not set in .env; it is the WhatsApp Business Account id in Meta Business Manager');
      return call(`${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers`, { cc: countryCode, phone_number: nationalNumber, verified_name: displayName });
    },
    requestCode({ phoneNumberId, method = 'SMS', language = 'en_US' }) {
      return call(`${phoneNumberId}/request_code`, { code_method: method, language });
    },
    verifyCode({ phoneNumberId, code }) {
      return call(`${phoneNumberId}/verify_code`, { code });
    },
    register({ phoneNumberId, pin }) {
      return call(`${phoneNumberId}/register`, { messaging_product: 'whatsapp', pin });
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

/** Meta signs each webhook delivery: `sha256=` + HMAC-SHA256 of the raw body with the app secret. */
export function isSignedByMeta(rawBody, header, appSecret) {
  if (!rawBody || !header || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return expected.length === header.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}
