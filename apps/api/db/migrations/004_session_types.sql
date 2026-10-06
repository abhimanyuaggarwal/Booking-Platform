-- Session types: a guru offers up to three ways to sit with him (ten minutes for ₹500, twenty for
-- ₹1000...). Every booking snapshots the minutes and the dakshina it was made with, so a later price
-- change never alters an old receipt, refund or credit. The first type of each guru is made from
-- what he had before: one sitting of pattern_json.slotMinutes for dakshina_paise.
create table session_types (
  id             uuid primary key default gen_random_uuid(),
  guru_id        uuid not null references gurus(id),
  name           text not null default '',
  minutes        integer not null check (minutes between 5 and 180),
  dakshina_paise integer not null check (dakshina_paise >= 0),
  position       integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index session_types_guru on session_types (guru_id, position);

alter table bookings
  add column session_type_id uuid references session_types(id),
  add column minutes         integer,
  add column dakshina_paise  integer,
  add column complimentary   boolean not null default false;

insert into session_types (guru_id, name, minutes, dakshina_paise, position)
  select id, '', coalesce((pattern_json->>'slotMinutes')::int, 30), dakshina_paise, 0 from gurus;

update bookings b
   set session_type_id = t.id, minutes = t.minutes, dakshina_paise = t.dakshina_paise
  from session_types t
 where t.guru_id = b.guru_id and b.session_type_id is null;

alter table bookings alter column minutes set not null, alter column dakshina_paise set not null;
