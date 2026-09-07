// NFL/26 API — Cloudflare Worker + D1.
// Accounts (email + password, or Google), sessions, and one prefs row per person.
//
//   POST /auth/signup   {email, password}        → {token, user}
//   POST /auth/login    {email, password}        → {token, user}
//   POST /auth/google   {credential}             → {token, user}   (Google ID token from the sign-in button)
//   POST /auth/logout   (Bearer)                 → {ok}
//   GET  /auth/me       (Bearer)                 → {user}
//   GET  /prefs         (Bearer)                 → {prefs, updated_at}
//   PUT  /prefs         (Bearer) {prefs}         → {ok, updated_at}
//   GET  /config                                 → {googleClientId, adminEmails}
//   POST /admin/stats   (Bearer) {password}      → stats   (admins only; password re-checked)
//
// Passwords: PBKDF2-SHA256, 100k iterations, per-user salt. Sessions: 32-byte random bearer token,
// only its SHA-256 is stored, 90-day expiry. All rows are scoped to the signed-in user.

const SESSION_DAYS = 90;
const PBKDF2_ITER = 100000; // Cloudflare Workers cap PBKDF2 at 100k iterations

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      const status = e.status || 500;
      const body = { error: status === 500 ? 'Something went wrong.' : e.message };
      if (status === 500) console.error(e);
      return json(body, status, cors);
    }
  },
};

async function route(req, env) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;

  if (m === 'GET' && p === '/') return json({ ok: true, service: 'nfl26-api' });
  if (m === 'GET' && p === '/config') return json({ googleClientId: env.GOOGLE_CLIENT_ID || null, adminEmails: admins(env) });

  if (m === 'POST' && p === '/auth/signup') return signup(req, env);
  if (m === 'POST' && p === '/auth/login') return login(req, env);
  if (m === 'POST' && p === '/auth/google') return googleSignIn(req, env);

  // Everything below needs a session.
  const session = await requireSession(req, env);
  if (m === 'POST' && p === '/auth/logout') { await env.DB.prepare('delete from sessions where token_hash = ?').bind(session.token_hash).run(); return json({ ok: true }); }
  if (m === 'GET' && p === '/auth/me') return json({ user: session.user });
  if (m === 'GET' && p === '/prefs') {
    const row = await env.DB.prepare('select prefs, updated_at from profiles where user_id = ?').bind(session.user.id).first();
    return json({ prefs: row ? JSON.parse(row.prefs) : null, updated_at: row?.updated_at || null });
  }
  if (m === 'POST' && p === '/admin/stats') return adminStats(req, env, session);
  if (m === 'PUT' && p === '/prefs') {
    const body = await readJson(req);
    const prefs = sanitizePrefs(body.prefs);
    const now = new Date().toISOString();
    await env.DB.prepare('insert into profiles (user_id, prefs, updated_at) values (?, ?, ?) on conflict(user_id) do update set prefs = excluded.prefs, updated_at = excluded.updated_at')
      .bind(session.user.id, JSON.stringify(prefs), now).run();
    return json({ ok: true, updated_at: now });
  }
  throw httpError(404, 'Not found');
}

// ---- auth ------------------------------------------------------------------

async function signup(req, env) {
  const { email, password } = await readJson(req);
  const em = normEmail(email);
  if (!em) throw httpError(400, 'Enter a valid email address.');
  if (!password || password.length < 8) throw httpError(400, 'Password needs at least 8 characters.');
  const existing = await env.DB.prepare('select id from users where email = ?').bind(em).first();
  if (existing) throw httpError(409, 'There is already an account with that email. Sign in instead.');
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt);
  const id = crypto.randomUUID();
  await env.DB.prepare('insert into users (id, email, pw_hash, pw_salt) values (?, ?, ?, ?)').bind(id, em, b64(hash), b64(salt)).run();
  return json(await issueSession(env, { id, email: em }), 201);
}

async function login(req, env) {
  const { email, password } = await readJson(req);
  const em = normEmail(email);
  const user = em ? await env.DB.prepare('select id, email, pw_hash, pw_salt from users where email = ?').bind(em).first() : null;
  if (!user || !user.pw_hash) {
    // Same message whether the account exists or not.
    throw httpError(401, user ? 'This account signs in with Google.' : 'Wrong email or password.');
  }
  const hash = await pbkdf2(password || '', unb64(user.pw_salt));
  if (!timingSafeEqual(b64(hash), user.pw_hash)) throw httpError(401, 'Wrong email or password.');
  return json(await issueSession(env, { id: user.id, email: user.email }));
}

// Verifies a Google ID token (from Google Identity Services) and signs the person in, creating the account if needed.
async function googleSignIn(req, env) {
  if (!env.GOOGLE_CLIENT_ID) throw httpError(400, 'Google sign-in is not enabled.');
  const { credential } = await readJson(req);
  if (!credential) throw httpError(400, 'Missing Google credential.');
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) throw httpError(401, 'Google sign-in failed. Try again.');
  const info = await r.json();
  if (info.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw httpError(401, 'Google sign-in failed.');
  if (info.email_verified !== 'true' && info.email_verified !== true) throw httpError(401, 'Google account email is not verified.');
  const em = normEmail(info.email);
  let user = await env.DB.prepare('select id, email, google_sub from users where google_sub = ? or email = ?').bind(info.sub, em).first();
  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare('insert into users (id, email, google_sub) values (?, ?, ?)').bind(id, em, info.sub).run();
    user = { id, email: em };
  } else if (!user.google_sub) {
    await env.DB.prepare('update users set google_sub = ? where id = ?').bind(info.sub, user.id).run(); // link Google to an existing email account
  }
  return json(await issueSession(env, { id: user.id, email: user.email }));
}

async function issueSession(env, user) {
  const raw = randomBytes(32);
  const token = b64url(raw);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(tokenHash, user.id, expires).run();
  return { token, user: { id: user.id, email: user.email }, expires_at: expires };
}

async function requireSession(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw httpError(401, 'Sign in required.');
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare('select s.token_hash, s.expires_at, u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = ?').bind(tokenHash).first();
  if (!row || row.expires_at < new Date().toISOString()) {
    if (row) await env.DB.prepare('delete from sessions where token_hash = ?').bind(tokenHash).run();
    throw httpError(401, 'Session expired. Sign in again.');
  }
  const now = new Date().toISOString();
  if (!row.last_seen || row.last_seen < new Date(Date.now() - 36e5).toISOString()) {
    try { await env.DB.prepare('update sessions set last_seen = ? where token_hash = ?').bind(now, tokenHash).run(); } catch {}
  }
  return { token_hash: row.token_hash, user: { id: row.id, email: row.email } };
}

// ---- admin ------------------------------------------------------------------

function admins(env) { return (env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }

// Private stats. Only listed admins, and they must re-enter their password (step-up) each time.
async function adminStats(req, env, session) {
  if (!admins(env).includes(session.user.email)) throw httpError(403, 'Not available.');
  const { password } = await readJson(req);
  const u = await env.DB.prepare('select pw_hash, pw_salt from users where id = ?').bind(session.user.id).first();
  if (!u?.pw_hash) throw httpError(403, 'Set a password on this account first.');
  const hash = await pbkdf2(password || '', unb64(u.pw_salt));
  if (!timingSafeEqual(b64(hash), u.pw_hash)) throw httpError(401, 'Wrong password.');

  const day = n => new Date(Date.now() - n * 864e5).toISOString();
  const one = async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).first())?.n ?? 0;
  const totals = {
    users: await one('select count(*) n from users'),
    new7: await one('select count(*) n from users where created_at >= ?', day(7).slice(0, 19).replace('T', ' ')),
    new30: await one('select count(*) n from users where created_at >= ?', day(30).slice(0, 19).replace('T', ' ')),
    active7: await one('select count(distinct user_id) n from sessions where coalesce(last_seen, created_at) >= ?', day(7)),
    active1: await one('select count(distinct user_id) n from sessions where coalesce(last_seen, created_at) >= ?', day(1)),
    google: await one('select count(*) n from users where google_sub is not null'),
  };
  const rows = (await env.DB.prepare(`select u.email, u.created_at, (u.google_sub is not null) as google,
      (select max(coalesce(s.last_seen, s.created_at)) from sessions s where s.user_id = u.id) as last_seen,
      (select count(*) from sessions s where s.user_id = u.id and s.expires_at > ?) as devices,
      p.prefs from users u left join profiles p on p.user_id = u.id order by u.created_at desc limit 500`).bind(new Date().toISOString()).all()).results || [];
  const teamCount = {}, serviceCount = {};
  const users = rows.map(r => {
    let prefs = {}; try { prefs = JSON.parse(r.prefs || '{}'); } catch {}
    (prefs.teams || []).forEach(t => { teamCount[t] = (teamCount[t] || 0) + 1; });
    (prefs.services || []).forEach(t => { serviceCount[t] = (serviceCount[t] || 0) + 1; });
    return { email: r.email, created_at: r.created_at, last_seen: r.last_seen, devices: r.devices, google: !!r.google, teams: prefs.teams || [], services: prefs.services || [], theme: prefs.theme || 'default' };
  });
  const top = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, n]) => ({ id, n }));
  return json({ totals, users, topTeams: top(teamCount), topServices: top(serviceCount), generated_at: new Date().toISOString() });
}

// ---- helpers ---------------------------------------------------------------

function sanitizePrefs(p) {
  if (!p || typeof p !== 'object') throw httpError(400, 'Missing prefs.');
  const str = v => (typeof v === 'string' && v.length <= 40 ? v : null);
  const ids = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string' && /^[\w.-]{1,24}$/.test(x)).slice(0, 50) : []);
  return {
    teams: ids(p.teams), services: ids(p.services),
    tz: str(p.tz) || 'local', filter: str(p.filter) || 'all', layout: str(p.layout) || 'auto',
    focus: str(p.focus), theme: str(p.theme) || 'default',
  };
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^https:\/\/nfl26[\w-]*\.vercel\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function readJson(req) { try { return await req.json(); } catch { throw httpError(400, 'Expected JSON.'); } }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } }); }
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function normEmail(e) { const s = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254 ? s : null; }
function randomBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function sha256Hex(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return new Uint8Array(bits);
}
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
