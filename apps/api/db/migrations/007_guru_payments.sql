-- Each guru's own Razorpay account (7 October 2026). The key secret and the webhook secret are stored
-- encrypted with SECRETS_KEY (secrets.js); the key id is plain, it is public anyway. Money-sensitive
-- changes wait for guruji's Yes on WhatsApp: the request is parked in approvals until he taps.
alter table gurus
  add column razorpay_key_id             text,
  add column razorpay_secret_enc         text,
  add column razorpay_webhook_secret_enc text,
  add column razorpay_mode               text check (razorpay_mode in ('test', 'live')),
  add column razorpay_connected_at       timestamptz,
  add column razorpay_verified_at        timestamptz;

create table approvals (
  id           uuid primary key default gen_random_uuid(),
  guru_id      uuid not null references gurus(id),
  kind         text not null check (kind in ('payments', 'whatsapp')),
  payload_enc  text not null,
  summary      text not null default '',
  requested_by text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index approvals_guru_status on approvals (guru_id, status);
