-- People who sign in to the console (6 October 2026 decision: two roles, phone + password).
-- An admin belongs to Slike and sees every guru; a team member belongs to one guru and sees only him.
-- Passwords are set on first sign-in through a WhatsApp code and reset the same way.
create table console_users (
  id            uuid primary key default gen_random_uuid(),
  guru_id       uuid references gurus(id),
  name          text not null default '',
  phone         text not null unique,
  role          text not null check (role in ('admin', 'team')),
  password_hash text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  check ((role = 'admin') = (guru_id is null))
);

-- One live code per phone. The code itself is never stored, only its hash; five guesses, ten minutes.
create table login_codes (
  phone      text primary key,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  created_at timestamptz not null default now()
);
