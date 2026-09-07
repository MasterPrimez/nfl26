-- Adds last-activity tracking to sessions (run once on databases created before this column existed).
alter table sessions add column last_seen text;
