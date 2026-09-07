-- NFL/26 · Cloudflare D1. Applied by tools/cf-setup.sh (npx wrangler d1 execute nfl26 --remote --file=worker/schema.sql)
create table if not exists users (
  id text primary key,
  email text not null unique,
  pw_hash text,            -- base64 PBKDF2-SHA256, null for Google-only accounts
  pw_salt text,
  google_sub text unique,  -- Google account id when signed in with Google
  created_at text not null default (datetime('now'))
);
create table if not exists sessions (
  token_hash text primary key,   -- sha256 of the bearer token; the raw token only lives in the browser
  user_id text not null references users(id) on delete cascade,
  created_at text not null default (datetime('now')),
  expires_at text not null,
  last_seen text
);
create index if not exists sessions_user on sessions(user_id);
create table if not exists profiles (
  user_id text primary key references users(id) on delete cascade,
  prefs text not null default '{}',   -- JSON: teams, services, tz, layout, theme, focus, filter
  updated_at text not null default (datetime('now'))
);
