-- Each guru's own booking number (7 October 2026), registered under Slike's WhatsApp Business Account
-- with his display name. whatsapp_number (the digits devotees write to) already existed; these carry
-- Meta's id for the number, how far its setup has come, and the two-step PIN it was registered with.
alter table gurus
  add column whatsapp_phone_number_id text,
  add column whatsapp_display_name    text,
  add column whatsapp_number_pending  text,   -- the digits being set up, until guruji approves and they become whatsapp_number
  add column whatsapp_status          text not null default 'none' check (whatsapp_status in ('none', 'added', 'code_sent', 'verified', 'registered', 'live', 'failed')),
  add column whatsapp_pin_enc         text,
  add column whatsapp_connected_at    timestamptz,
  add column whatsapp_last_error      text;
