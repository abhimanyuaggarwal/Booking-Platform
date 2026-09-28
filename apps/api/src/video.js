// The video room, on 100ms. We create one room per booking and mint the two tokens that let
// guruji and the devotee into it. Nothing else: the room UI itself is 100ms's prebuilt one.
// Docs: https://www.100ms.live/docs/server-side/v2/introduction/basics
//
// Two tokens, both plain HS256 JWTs signed with the app secret, so no JWT library is needed:
//   management token — lets us call their REST api to make a room
//   auth token       — what a browser hands to the SDK to join that room

import crypto from 'node:crypto';
import axios from 'axios';
import { ProviderError } from './errors.js';

const API = 'https://api.100ms.live/v2';
const MANAGEMENT_TOKEN_MINUTES = 10;
const AUTH_TOKEN_HOURS = 2;

export function videoClient(env) {
  const accessKey = env.HMS_ACCESS_KEY;
  const secret = env.HMS_SECRET;
  const templateId = env.HMS_TEMPLATE_ID;
  const roles = { guru: env.HMS_ROLE_GURU || 'host', devotee: env.HMS_ROLE_DEVOTEE || 'guest' };

  /** True when the pilot's 100ms account is wired. Everything else here needs it. */
  function isConfigured() {
    return Boolean(accessKey && secret && templateId);
  }

  function demandConfig() {
    if (!isConfigured()) {
      throw new ProviderError('The video room is not wired yet. Set HMS_ACCESS_KEY, HMS_SECRET and HMS_TEMPLATE_ID in the api .env from the 100ms dashboard (Developer → App credentials, and the template you want rooms made from).');
    }
  }

  /** One room per booking, named after it so it is findable in the 100ms dashboard. */
  async function createRoom({ bookingId, description }) {
    demandConfig();
    try {
      const res = await axios.post(`${API}/rooms`, {
        name: `booking-${bookingId}`,
        description,
        template_id: templateId,
      }, { headers: { Authorization: `Bearer ${managementToken()}` } });
      return { id: res.data.id };
    } catch (err) {
      // A room with this name already exists after a restart mid-session: reuse it rather than fail.
      if (err.response?.status === 409) {
        const found = await findRoom(`booking-${bookingId}`);
        if (found) return found;
      }
      throw new ProviderError(`Could not make the video room for booking ${bookingId}: ${detail(err)}`);
    }
  }

  async function findRoom(name) {
    try {
      const res = await axios.get(`${API}/rooms`, {
        params: { name }, headers: { Authorization: `Bearer ${managementToken()}` },
      });
      const room = res.data?.data?.find((r) => r.name === name);
      return room ? { id: room.id } : null;
    } catch {
      return null; // the caller is already in a failure path; its message is the useful one
    }
  }

  /** What a browser hands to the SDK. `who` is 'guru' or 'devotee'; they get different roles. */
  function authToken({ roomId, userId, who }) {
    demandConfig();
    const role = roles[who];
    if (!role) throw new Error(`No 100ms role for ${who}; expected guru or devotee`);
    return sign({
      access_key: accessKey, room_id: roomId, user_id: userId, role, type: 'app', version: 2,
    }, AUTH_TOKEN_HOURS * 3600);
  }

  function managementToken() {
    return sign({ access_key: accessKey, type: 'management', version: 2 }, MANAGEMENT_TOKEN_MINUTES * 60);
  }

  function sign(claims, lifetimeSeconds) {
    const now = Math.floor(Date.now() / 1000);
    return signJwt({ ...claims, jti: crypto.randomUUID(), iat: now, nbf: now, exp: now + lifetimeSeconds }, secret);
  }

  return { isConfigured, createRoom, authToken, roles };
}

/** HS256, the only algorithm 100ms accepts. Base64url, no padding. */
export function signJwt(payload, secret) {
  const part = (obj) => base64url(Buffer.from(JSON.stringify(obj)));
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}`;
  return `${body}.${base64url(crypto.createHmac('sha256', secret).update(body).digest())}`;
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function detail(err) {
  return err.response ? JSON.stringify(err.response.data) : err.message;
}
