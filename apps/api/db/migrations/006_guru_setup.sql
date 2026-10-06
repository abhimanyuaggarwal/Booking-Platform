-- A guru is set up in steps and has a life: draft while Slike creates him, setting up while his team
-- fills in the rest, live when his doors are open, paused when they are shut without losing anything.
-- Slike charges a subscription (not a share), recorded here; business details for receipts are optional.
alter table gurus
  add column status            text not null default 'live' check (status in ('draft', 'setting_up', 'live', 'paused')),
  add column subscription_json jsonb not null default '{}'::jsonb,
  add column business_json     jsonb not null default '{}'::jsonb,
  add column activated_at      timestamptz;

-- Who changed what, when: every admin action and every settings save, readable per guru.
create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  guru_id    uuid references gurus(id),
  user_id    text,
  user_name  text,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_guru_created on audit_log (guru_id, created_at desc);
