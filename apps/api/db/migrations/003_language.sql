-- The language every WhatsApp sentence to this guru's devotees is written in. His team sets it once.
alter table gurus add column if not exists language text not null default 'en' check (language in ('en', 'hi'));
