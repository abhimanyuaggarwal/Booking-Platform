-- Every table carries guru_id: the second guru is a row, not a build.
-- Ids are uuids because booking ids travel in links devotees receive.
-- Money is in paise. Times are timestamptz (real instants); slot ids are IST wall-clock, see packages/shared.

create table gurus (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  domain          text unique,
  name            text not null,
  about           text not null default '',
  marketing_json  jsonb not null default '{}'::jsonb,
  dakshina_paise  integer not null check (dakshina_paise >= 0),
  whatsapp_number text,
  pattern_json    jsonb not null,
  closed_dates    date[] not null default '{}',
  created_at      timestamptz not null default now()
);

create table events (
  id         uuid primary key default gen_random_uuid(),
  guru_id    uuid not null references gurus(id),
  title      text not null,
  kind       text not null check (kind in ('satsang', 'live', 'meetup')),
  starts_at  timestamptz not null,
  link       text,
  location   text,
  notes      text,
  created_at timestamptz not null default now()
);
create index events_guru_starts on events (guru_id, starts_at);

create table devotees (
  id         uuid primary key default gen_random_uuid(),
  guru_id    uuid not null references gurus(id),
  phone      text not null,
  name       text,
  for_whom   text,
  created_at timestamptz not null default now(),
  unique (guru_id, phone)
);

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  guru_id             uuid not null references gurus(id),
  devotee_id          uuid not null references devotees(id),
  slot_start          timestamptz not null,
  status              text not null check (status in
                        ('held', 'confirmed', 'completed', 'no_show', 'rescheduled', 'cancelled', 'refunded', 'expired')),
  source              text not null check (source in ('live', 'ashram', 'poster', 'page', 'direct')),
  question_text       text,
  question_media_id   text,
  payment_link_id     text unique,
  rescheduled_from_id uuid references bookings(id),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
-- The invariant: one live booking per slot per guru. holdSlot() inserts and lets this index say no,
-- so two phones tapping the same time at once cannot both win.
create unique index bookings_one_per_slot on bookings (guru_id, slot_start) where status in ('held', 'confirmed');
create index bookings_guru_slot on bookings (guru_id, slot_start);
create index bookings_devotee on bookings (devotee_id);

create table ledger_entries (
  id           uuid primary key default gen_random_uuid(),
  guru_id      uuid not null references gurus(id),
  booking_id   uuid references bookings(id),
  devotee_id   uuid not null references devotees(id),
  kind         text not null check (kind in ('payment', 'refund', 'credit_issued', 'credit_used')),
  amount_paise integer not null check (amount_paise >= 0),
  provider_ref text,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index ledger_guru_created on ledger_entries (guru_id, created_at);
create index ledger_booking on ledger_entries (booking_id);

create table sessions (
  id                uuid primary key default gen_random_uuid(),
  guru_id           uuid not null references gurus(id),
  booking_id        uuid not null unique references bookings(id),
  room_id           text,
  started_at        timestamptz,
  ended_at          timestamptz,
  devotee_joined_at timestamptz,
  guru_joined_at    timestamptz
);

create table messages_log (
  id           uuid primary key default gen_random_uuid(),
  guru_id      uuid not null references gurus(id),
  booking_id   uuid references bookings(id),
  devotee_id   uuid not null references devotees(id),
  direction    text not null check (direction in ('in', 'out')),
  kind         text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index messages_devotee_created on messages_log (devotee_id, created_at);

create table qr_codes (
  id         uuid primary key default gen_random_uuid(),
  guru_id    uuid not null references gurus(id),
  source     text not null,
  label      text not null,
  wa_link    text not null,
  created_at timestamptz not null default now()
);
