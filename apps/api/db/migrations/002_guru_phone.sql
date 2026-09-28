-- Guruji's own WhatsApp number, so his team can nudge him and the ten-minute reminder reaches him too.
-- Nullable: a guru with no number simply gets no nudges.
alter table gurus add column if not exists guru_phone text;
