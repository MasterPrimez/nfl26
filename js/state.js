// Layer 1 personalization: saved per device (localStorage) and shareable via the URL (?teams=194,2483&tz=pt).
// Layer 2 (sign in to sync) plugs in here later — same shape, different store.

const KEY = 'nfl26.prefs.v1';

const defaults = () => ({
  teams: [],          // ESPN team ids, as strings
  services: [],       // service ids from networks.js
  tz: 'local',        // 'local' | 'pt' | 'et'
  filter: 'all',      // 'all' | 'mine' | 'top25' | 'p4' | conference id
  layout: 'auto',     // 'auto' (phone layout on phones) | 'desktop' (force desktop layout, pinch to zoom)
  focus: null,        // team id the home story is about (defaults to first favorite)
  theme: 'default',   // 'default' | 'team' (focused team's colors)
});

let prefs = load();

function load() {
  // ?fresh → forget everything this device knows (teams, welcome flag, rank history) and reload as a first visit.
  if (new URLSearchParams(location.search).has('fresh')) {
    try { Object.keys(localStorage).filter(k => k.startsWith('nfl26.')).forEach(k => localStorage.removeItem(k)); } catch {}
    history.replaceState(null, '', location.pathname + location.hash);
  }
  let p = defaults();
  try { const raw = localStorage.getItem(KEY); if (raw) p = { ...p, ...JSON.parse(raw) }; } catch {}
  // URL overrides (a shared link) win and are then saved.
  const q = new URLSearchParams(location.search);
  if (q.has('teams')) p.teams = q.get('teams').split(',').map(s => s.trim()).filter(Boolean);
  if (q.has('tz')) p.tz = q.get('tz');
  if (q.has('services')) p.services = q.get('services').split(',').filter(Boolean);
  if (q.has('layout')) p.layout = q.get('layout');
  if (q.has('theme')) p.theme = q.get('theme');
  if (q.has('focus')) p.focus = q.get('focus');
  if (q.has('teams') || q.has('tz') || q.has('services') || q.has('layout') || q.has('theme') || q.has('focus')) {
    save(p);
    history.replaceState(null, '', location.pathname + location.hash);
  }
  return p;
}

function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { save(prefs); listeners.forEach(fn => fn(prefs)); }

export const state = {
  get prefs() { return prefs; },
  get myTeams() { return new Set(prefs.teams); },
  get myServices() { return new Set(prefs.services); },
  isMine(teamId) { return prefs.teams.includes(String(teamId)); },
  toggleTeam(id) {
    id = String(id);
    prefs.teams = prefs.teams.includes(id) ? prefs.teams.filter(t => t !== id) : [...prefs.teams, id];
    emit();
  },
  toggleService(id) {
    prefs.services = prefs.services.includes(id) ? prefs.services.filter(s => s !== id) : [...prefs.services, id];
    emit();
  },
  setTz(tz) { prefs.tz = tz; emit(); },
  setLayout(l) { prefs.layout = l; emit(); },
  setTheme(t) { prefs.theme = t; emit(); },
  setFocus(id) { prefs.focus = id ? String(id) : null; emit(); },
  get focusTeam() { return prefs.focus && prefs.teams.includes(prefs.focus) ? prefs.focus : (prefs.teams[0] || null); },
  setFilter(f) { prefs.filter = f; emit(); },
  // Layer 2: replace the whole prefs object (from the account store) without echoing back to the sync listener.
  importPrefs(p, { silent = false } = {}) {
    prefs = { ...defaults(), ...p };
    save(prefs);
    if (!silent) listeners.forEach(fn => fn(prefs));
  },
  // Merge a remote copy with this device: union of teams/services, remote wins on scalar settings it has set.
  mergePrefs(remote) {
    const r = remote || {};
    const teams = [...new Set([...(r.teams || []), ...prefs.teams])];
    const services = [...new Set([...(r.services || []), ...prefs.services])];
    return { ...prefs, ...Object.fromEntries(Object.entries(r).filter(([k, v]) => ['tz', 'filter', 'layout', 'focus', 'theme'].includes(k) && v != null)), teams, services };
  },
  shareUrl() {
    const q = new URLSearchParams();
    if (prefs.teams.length) q.set('teams', prefs.teams.join(','));
    if (prefs.tz !== 'local') q.set('tz', prefs.tz);
    if (prefs.theme !== 'default') q.set('theme', prefs.theme);
    const base = location.origin + location.pathname;
    return q.toString() ? `${base}?${q}` : base;
  },
};

// ---- Time formatting -------------------------------------------------------

const TZ = { pt: 'America/Los_Angeles', et: 'America/New_York' };
export function tzName() { return prefs.tz === 'local' ? undefined : TZ[prefs.tz]; }
export function tzLabel() {
  if (prefs.tz === 'pt') return 'PT';
  if (prefs.tz === 'et') return 'ET';
  try { return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || ''; } catch { return ''; }
}
export function fmtTime(d) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzName() }).format(d).replace(' ', ' ');
}
export function fmtDay(d) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: tzName() }).format(d);
}
export function fmtShortDate(d) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: tzName() }).format(d);
}
export function dayKey(d) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tzName() }).format(d);
}
// Hour-of-day (decimal) in the display timezone, for the TV grid.
export function hourOf(d) {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: tzName() }).formatToParts(d);
  const h = Number(parts.find(p => p.type === 'hour').value) % 24;
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h + m / 60;
}
