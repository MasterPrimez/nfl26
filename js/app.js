import { api, normalizeEvent, normalizeDirectory } from './api.js';
import { state, onChange, fmtTime, tzLabel } from './state.js';
import { initAuth, onAuth, currentUser, authEnabled, googleEnabled, isAdmin, signIn, signUp, signOut, mountGoogleButton } from './auth.js';
import { esc, wire } from './ui.js';
import { SERVICES } from './networks.js';
import { renderScores } from './views/scores.js';
import { renderTV, mountTV } from './views/tv.js';
import { renderStandings } from './views/standings.js';
import { renderPlayoff, projectPlayoff } from './views/playoff.js';
import { renderTeams } from './views/teams.js';
import { renderStats } from './views/stats.js';
import { renderTeam } from './views/team.js';
import { renderGame } from './views/game.js';
import { loadHome, unmountStory, homeSignature } from './views/home.js';
import { renderDash } from './views/dash.js';

const $ = s => document.querySelector(s);
const view = $('#view');

const ctx = {
  season: 2026,
  calendar: [],        // [{key, number, seasontype, short, label, detail, start, end, past, current}]
  weekKey: null,       // selected week key
  games: [],           // games for the selected week
  allGames: new Map(), // every game seen this session, by id
  rankings: null,      // {polls, ap, cfp}
  directory: null,     // {teams, confs}
  playoff: null,
  updated: null,
  error: null,
};

// ---- Routing ---------------------------------------------------------------

function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  const parts = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || 'home', id: parts[1], params };
}

let rendering = false;
async function render(opts = {}) {
  const r = route();
  document.querySelectorAll('#nav a, #tabbar a').forEach(a => a.classList.toggle('active', a.dataset.route === r.name || (r.name === 'team' && a.dataset.route === 'teams') || (r.name === 'game' && a.dataset.route === 'scores')));
  if (rendering) return; rendering = true;
  try {
    let html, mount = null;
    unmountStory();
    switch (r.name) {
      case 'home': { const id = state.focusTeam; const d = id && ctx.directory ? await loadHome(ctx, id).catch(e => { console.warn('home', e); return null; }) : null; ctx.homeSig = homeSignature(ctx, d); const out = renderDash(ctx, d); html = out.html; mount = out.mount; break; }
      case 'tv': html = renderTV({ ...ctx, week: ctx.weekKey }, r.params); mount = mountTV; break;
      case 'standings': case 'rankings': html = renderStandings(ctx); break;
      case 'playoff': html = renderPlayoff(ctx); break;
      case 'teams': html = renderTeams(ctx); break;
      case 'stats': { const out = renderStats(ctx); html = out.html; mount = out.mount || null; break; }
      case 'team': html = ctx.directory ? await renderTeam(ctx, { id: r.id }) : '<div class="panel empty">Loading…</div>'; break;
      case 'game': html = await renderGame(ctx, { id: r.id }); break;
      case 'scores': default: html = renderScores({ ...ctx, week: ctx.weekKey });
    }
    const y = window.scrollY;
    view.innerHTML = html;
    if (r.name === route().name) window.scrollTo(0, Math.min(y, document.body.scrollHeight));
    if (mount) mount(view);
    applyTheme();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="panel empty">Something went wrong loading this page.<br><span class="muted">${esc(e.message)}</span></div>`;
  } finally { rendering = false; }
}

function currentWeek() { return ctx.calendar.find(w => w.key === ctx.weekKey); }

// ---- Data ------------------------------------------------------------------

function buildCalendar(sb) {
  const cal = sb.leagues?.[0]?.calendar || [];
  const now = Date.now();
  const out = [];
  cal.forEach(block => {
    const type = Number(block.value); // 1 pre, 2 regular, 3 post
    if (type !== 2 && type !== 3) return;
    (block.entries || []).forEach(en => {
      const number = Number(en.value);
      const start = new Date(en.startDate), end = new Date(en.endDate);
      const label = en.label || en.alternateLabel || `Week ${number}`;
      const short = type === 3 ? (/wild/i.test(label) ? 'WC' : /division/i.test(label) ? 'DIV' : /conference/i.test(label) ? 'CONF' : /super/i.test(label) ? 'SB' : /pro bowl/i.test(label) ? 'PB' : label.replace(/Week\s*/i, '')) : String(number).padStart(2, '0');
      out.push({ key: `${type}-${number}`, number, seasontype: type, label, short, detail: en.detail || '', start, end, past: end.getTime() < now, current: start.getTime() <= now && now <= end.getTime() });
    });
  });
  return out;
}

// Tag every game's teams with their conference (AFC/NFC) from the directory, for filters.
function annotate() {
  const d = ctx.directory; if (!d) return;
  const byId = new Map(d.teams.map(t => [t.id, t]));
  ctx.allGames.forEach(g => [g.home, g.away].forEach(t => { const dt = byId.get(String(t.id)); if (dt) { t.conference = dt.conference.abbr; t.division = dt.conf.abbr; } }));
}

async function loadWeek(key) {
  const w = ctx.calendar.find(x => x.key === key) || currentWeek();
  const sb = await api.scoreboard(w?.number, { seasontype: w?.seasontype, ttl: 20_000 });
  const games = (sb.events || []).map(normalizeEvent);
  games.forEach(g => ctx.allGames.set(g.id, g));
  annotate();
  ctx.games = games;
  ctx.updated = new Date();
}

async function loadCore() {
  const sb = await api.scoreboard(undefined, { ttl: 20_000 });
  ctx.season = sb.season?.year || ctx.season;
  ctx.calendar = buildCalendar(sb);
  const cur = ctx.calendar.find(w => w.current) || ctx.calendar.find(w => !w.past) || ctx.calendar[ctx.calendar.length - 1];
  ctx.weekKey = ctx.weekKey || cur?.key;
  const games = (sb.events || []).map(normalizeEvent);
  games.forEach(g => ctx.allGames.set(g.id, g));
  if (ctx.weekKey === cur?.key) ctx.games = games; else await loadWeek(ctx.weekKey);
  annotate();
  ctx.updated = new Date();
  // Directory in the background; the scoreboard shouldn't wait on them.
  api.standings().then(s => { ctx.directory = normalizeDirectory(s); annotate(); ctx.playoff = projectPlayoff(ctx.directory); renderMyTeams(); render(); }).catch(e => console.warn('standings', e));
}

// ---- Status + refresh ------------------------------------------------------

function setStatus(kind, text) {
  const el = $('#status'); el.className = 'status ' + kind; $('#status-text').textContent = text;
  $('#foot-updated').textContent = ctx.updated ? `Updated ${fmtTime(ctx.updated)} ${tzLabel()}` : '';
}
function statusFromData() {
  const live = ctx.games.filter(g => g.state === 'in').length;
  if (ctx.error) return setStatus('err', 'ESPN FEED ERROR · RETRYING');
  setStatus(live ? 'live' : 'ok', `${live ? live + ' LIVE · ' : ''}UPDATED ${fmtTime(ctx.updated)} · AUTO-REFRESH ${live ? '60S' : '5 MIN'}`);
}

let timer = null;
function scheduleRefresh() {
  clearTimeout(timer);
  const live = ctx.games.some(g => g.state === 'in');
  const w = currentWeek();
  const soon = ctx.games.some(g => g.state === 'pre' && g.date - Date.now() < 15 * 60_000);
  const ms = (live || soon) ? 60_000 : (w && !w.past ? 5 * 60_000 : 30 * 60_000);
  timer = setTimeout(refresh, ms);
}
async function refresh() {
  try {
    await loadWeek(ctx.weekKey);
    ctx.error = null;
    const r = route();
    if (r.name === 'home') { const id = state.focusTeam; if (id && ctx.directory) { delete ctx.home?.[id]; const d = await loadHome(ctx, id).catch(() => null); if (homeSignature(ctx, d) !== ctx.homeSig) await render({ quiet: true }); } }
    else if (r.name === 'team') { if (ctx.games.some(g => g.state === 'in' && (String(g.home.id) === String(r.id) || String(g.away.id) === String(r.id)))) await render({ quiet: true }); }
    else if (r.name !== 'teams' && r.name !== 'standings') await render();
    renderMyTeams();
  } catch (e) { ctx.error = e; console.warn(e); }
  statusFromData();
  scheduleRefresh();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

// ---- My teams strip --------------------------------------------------------

function renderMyTeams() {
  const el = $('#myteams');
  el.hidden = false;
  const ids = state.prefs.teams;
  const d = ctx.directory;
  let colors = {}; try { colors = JSON.parse(localStorage.getItem('nfl26.teamcolor.v1') || '{}'); } catch {}
  const chips = ids.map(id => {
    const t = d?.teams.find(x => x.id === id);
    const g = ctx.games.find(x => x.home.id === id || x.away.id === id);
    const me = g && (g.home.id === id ? g.home : g.away);
    const opp = g && (g.home.id === id ? g.away : g.home);
    const name = t?.name || me?.name || `Team ${id}`;
    const logo = t?.logo || me?.logo || `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${id}.png`;
    const rec = me?.record || t?.overall || '';
    if (me?.color && !/^#(333333|ffffff|000000)$/i.test(me.color)) colors[id] = me.color;
    const color = colors[id] || '#3a3f47';
    let status = '';
    if (g) status = `<span>${g.home.id === id ? 'vs' : 'at'} ${esc((opp.abbr || opp.name).toUpperCase())}</span>` + (g.state === 'in' ? `<span class="live">● ${esc(g.detail)}</span>` : g.state === 'post' ? `<span>${me.winner ? 'W' : 'L'} ${g.away.score}–${g.home.score}</span>` : `<span>${g.tbd ? 'TBA' : fmtTime(g.date)}</span>`);
    return `<a class="slab" href="#/team/${id}" style="--c:${esc(color)}"><img class="bg" src="${esc(logo)}" alt="" aria-hidden="true"><img class="lg" src="${esc(logo)}" alt=""><div class="txt"><div class="nm">${esc(name)}</div><div class="rec"><b>${esc(rec)}</b>${status}</div></div></a>`;
  }).join('');
  try { localStorage.setItem('nfl26.teamcolor.v1', JSON.stringify(colors)); } catch {}
  el.innerHTML = `<span class="label">My Teams</span>${chips}<button class="chip add" id="add-team" type="button">${ids.length ? '+ EDIT' : '+ PICK YOUR TEAMS'}</button>`;
}

// ---- Settings modal --------------------------------------------------------

function openModal() {
  const d = ctx.directory;
  const body = $('#modal-body');
  const draw = (q = '') => {
    const teams = d ? d.teams.filter(t => !q || t.fullName.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q)).sort((a, b) => (state.isMine(b.id) - state.isMine(a.id)) || a.name.localeCompare(b.name)) : [];
    const u = currentUser();
    const mode = body.dataset.authMode || 'in';
    const account = !authEnabled() ? ''
      : u ? `<div class="account on"><div><div class="section-title" style="margin-bottom:2px">Synced</div><div class="sub">Signed in as ${esc(u.email)} · your teams and services follow you to any device.</div></div><div style="display:flex;gap:8px">${isAdmin() ? '<a class="btn btn-amber" href="#/stats" id="btn-stats">Stats</a>' : ''}<button class="btn" id="btn-signout" type="button">Sign out</button></div></div>`
      : `<div class="account"><div><div class="section-title" style="margin-bottom:2px">${mode === 'up' ? 'Create an account' : 'Sign in to sync'}</div><div class="sub">Optional. Your teams and services follow you to your phone and laptop.</div></div>
          <form class="signin" id="signin-form" data-mode="${mode}"><input class="search" id="signin-email" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" required><input class="search" id="signin-pw" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" placeholder="${mode === 'up' ? 'Choose a password (8+ characters)' : 'Password'}" minlength="8" required><button class="btn btn-amber" type="submit">${mode === 'up' ? 'Create account' : 'Sign in'}</button></form>
          <div class="sub" id="signin-msg"></div>
          <div class="signin-alt"><button class="linkish" id="signin-toggle" type="button">${mode === 'up' ? 'Have an account? Sign in' : 'New here? Create an account'}</button>${googleEnabled() ? '<span class="sub">or</span><div id="google-btn"></div>' : ''}</div></div>`;
    body.innerHTML = `
      ${account}
      <div><div class="section-title">My Teams</div>
        <input class="search" id="team-search" placeholder="Search teams…" value="${esc(q)}" autocomplete="off">
        <div class="pick-list">${teams.map(t => `<div class="panel team-tile" data-star="${t.id}"><img src="${esc(t.logo)}" alt="" loading="lazy"><span class="nm">${esc(t.name)} <span class="muted" style="font-size:11px">${esc(t.conf.abbr)}</span></span><span class="star${state.isMine(t.id) ? ' on' : ''}">★</span></div>`).join('') || '<div class="sub">Loading teams…</div>'}</div></div>
      <div><div class="section-title">My Streaming Services</div><div class="sub" style="margin-bottom:8px">Pick what you subscribe to and every game will show you the way you can actually watch it.</div>
        <div class="opts">${Object.values(SERVICES).map(s => `<button class="btn${state.myServices.has(s.id) ? ' on' : ''}" data-service="${s.id}" type="button">${esc(s.name)}</button>`).join('')}</div></div>
      <div><div class="section-title">Layout</div><div class="sub" style="margin-bottom:8px">Desktop shows the full layout (including the TV grid) on a phone — pinch to zoom.</div><div class="opts">${[['auto', 'Phone'], ['desktop', 'Desktop']].map(([v, l]) => `<button class="btn${state.prefs.layout === v ? ' on' : ''}" data-layout="${v}" type="button">${l}</button>`).join('')}</div></div>
      <div><div class="section-title">Theme</div><div class="opts">${[['default', 'Default'], ['team', 'Team colors']].map(([v, l]) => `<button class="btn${state.prefs.theme === v ? ' on' : ''}" data-theme-opt="${v}" type="button">${l}</button>`).join('')}</div></div>
      <div><div class="section-title">Time Zone</div><div class="opts">${['local', 'pt', 'et'].map(t => `<button class="btn${state.prefs.tz === t ? ' on' : ''}" data-tz="${t}" type="button">${t === 'local' ? 'My device' : t.toUpperCase()}</button>`).join('')}</div></div>
      <div><div class="section-title">Share Your Setup</div><div class="sub" style="margin-bottom:8px">Send this link and whoever opens it starts with your teams already picked.</div><div class="share-url" id="share-url">${esc(state.shareUrl())}</div><div style="margin-top:8px"><button class="btn btn-amber" id="copy-url" type="button">Copy link</button></div></div>
      <div class="sub">Saved on this device. Sign-in to sync across devices is coming next.</div>`;
    const inp = $('#team-search'); if (q) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
    mountGoogleButton($('#google-btn'));
  };
  draw();
  body.oninput = e => { if (e.target.id === 'team-search') draw(e.target.value.toLowerCase()); };
  body.onsubmit = async e => {
    if (e.target.id !== 'signin-form') return;
    e.preventDefault();
    const email = $('#signin-email').value.trim(), pw = $('#signin-pw').value; const msg = $('#signin-msg'); const btn = e.target.querySelector('button');
    if (!email || !pw) return;
    btn.disabled = true; msg.textContent = e.target.dataset.mode === 'up' ? 'Creating your account…' : 'Signing in…';
    try { if (e.target.dataset.mode === 'up') await signUp(email, pw); else await signIn(email, pw); }
    catch (err) { msg.innerHTML = `<span class="down">${esc(err.message)}</span>`; btn.disabled = false; }
  };

  body.onclick = e => {
    if (e.target.id === 'btn-signout') { signOut(); return; }
    if (e.target.id === 'btn-stats') { closeModal(); return; }
    if (e.target.id === 'signin-toggle') { body.dataset.authMode = body.dataset.authMode === 'up' ? 'in' : 'up'; draw($('#team-search')?.value.toLowerCase() || ''); return; }
    const s = e.target.closest('[data-service]'); if (s) { state.toggleService(s.dataset.service); draw($('#team-search')?.value.toLowerCase() || ''); return; }
    const st = e.target.closest('[data-star]'); if (st) { state.toggleTeam(st.dataset.star); draw($('#team-search')?.value.toLowerCase() || ''); return; }
    const tz = e.target.closest('[data-tz]'); if (tz) { state.setTz(tz.dataset.tz); draw($('#team-search')?.value.toLowerCase() || ''); return; }
    const to = e.target.closest('[data-theme-opt]'); if (to) { state.setTheme(to.dataset.themeOpt); draw($('#team-search')?.value.toLowerCase() || ''); return; }
    const ly = e.target.closest('[data-layout]'); if (ly) { state.setLayout(ly.dataset.layout); applyLayout(); draw($('#team-search')?.value.toLowerCase() || ''); return; }
    if (e.target.id === 'copy-url') { navigator.clipboard?.writeText(state.shareUrl()).then(() => { e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy link', 1500); }); }
  };
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

// ---- Theme: default instrument look, or the focused team's colors (from ESPN) --------
function hex(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); }
function mix(a, b, w) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v * (1 - w) + B[i] * w).toString(16).padStart(2, '0')).join(''); }
function lum(h) { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
async function applyTheme() {
  const root = document.documentElement;
  document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === state.prefs.theme));
  const id = state.focusTeam;
  if (state.prefs.theme !== 'team' || !id) { root.removeAttribute('data-theme'); return; }
  let c = ctx.teamColors?.[id];
  if (!c) { try { const t = (await api.team(id)).team; c = { color: '#' + (t.color || '333333'), alt: '#' + (t.alternateColor || 'ffffff') }; } catch { c = { color: '#333333', alt: '#ffffff' }; } (ctx.teamColors = ctx.teamColors || {})[id] = c; }
  if (state.focusTeam !== id || state.prefs.theme !== 'team') return;
  const main = lum(c.color) > 200 ? c.alt : c.color; // some teams list white/gold first; theme off the darker one
  const other = main === c.color ? c.alt : c.color;
  const altOk = lum(other) > 120 && lum(other) < 245;
  const accent = altOk ? other : (lum(main) < 90 ? mix(main, '#ffffff', 0.32) : mix(main, '#ffffff', 0.15));
  const vars = { '--team-bg': mix(main, '#000000', 0.86), '--team-bg2': mix(main, '#000000', 0.82), '--team-panel': mix(main, '#000000', 0.76), '--team-line': mix(main, '#000000', 0.58), '--team-line3': mix(main, '#000000', 0.45), '--team-accent': accent, '--team-accent-dim': mix(accent, '#000000', 0.6) };
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', 'team');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', vars['--team-bg2']);
}

// ---- Layout (phone vs forced desktop) --------------------------------------
// 'desktop' widens the viewport to 1200 CSS px so phones render the full desktop layout, zoomed out;
// iOS then lets you pinch to zoom. Changing the meta tag live is honored by Safari and Chrome.
function applyLayout() {
  const meta = document.querySelector('meta[name=viewport]');
  const desktop = state.prefs.layout === 'desktop';
  const want = desktop ? 'width=1200, viewport-fit=cover' : 'width=device-width, initial-scale=1, viewport-fit=cover';
  if (meta && meta.content !== want) meta.content = want;
  document.documentElement.classList.toggle('force-desktop', desktop);
}

// ---- Global wiring ---------------------------------------------------------

wire(view);
view.addEventListener('click', e => {
  const wk = e.target.closest('[data-week]');
  if (wk) { const w = ctx.calendar.find(x => x.key === wk.dataset.week); if (w) { ctx.weekKey = w.key; loadWeek(w.key).then(() => { render(); renderMyTeams(); statusFromData(); scheduleRefresh(); }); } return; }
  const dy = e.target.closest('[data-day]');
  if (dy) { const q = new URLSearchParams(route().params); q.set('day', dy.dataset.day); location.hash = `#/tv?${q}`; return; }
  const vw = e.target.closest('[data-view]');
  if (vw) { const q = new URLSearchParams(route().params); q.set('view', vw.dataset.view); location.hash = `#/tv?${q}`; return; }
  const st = e.target.closest('[data-star]');
  if (st) { e.stopPropagation(); state.toggleTeam(st.dataset.star); return; }
  const sv = e.target.closest('[data-service]');
  if (sv) { state.toggleService(sv.dataset.service); return; }
  const fc = e.target.closest('[data-focus]');
  if (fc) { state.setFocus(fc.dataset.focus); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (e.target.closest('#add-team, #add-team-2')) { openModal(); return; }
  const tt = e.target.closest('[data-team]');
  if (tt && !e.target.closest('[data-star]')) { location.hash = `#/team/${tt.dataset.team}`; return; }
});
$('#btn-settings').onclick = openModal;
document.querySelector('.theme-toggle').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (b) state.setTheme(b.dataset.theme); });
$('#myteams').addEventListener('click', e => { if (e.target.closest('#add-team')) openModal(); });
$('#modal-close').onclick = closeModal; $('#modal-close-2').onclick = closeModal;
$('#btn-signin').onclick = () => openModal();
onAuth(u => { const b = $('#btn-signin'); if (!b) return; b.hidden = !authEnabled(); b.textContent = u ? 'Synced' : 'Sign in'; b.classList.toggle('on', !!u); if (!$('#modal').hidden) openModal(); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
window.addEventListener('hashchange', () => { render(); renderMyTeams(); window.scrollTo(0, 0); });
// Re-render when crossing the phone/desktop breakpoint (rotation, split view).
const mq = window.matchMedia('(max-width: 700px)');
(mq.addEventListener ? mq.addEventListener.bind(mq) : mq.addListener.bind(mq))('change', () => render());
onChange(() => { applyTheme(); render(); renderMyTeams(); });

// ---- Welcome / support (first visit) -----------------------------------------
// One-time "buy me a beer" screen. Honor system: either button dismisses it for good on this device.
const SUPPORT_URL = 'https://venmo.com/Michael-Stine?txn=pay&amount=8&note=NFL%2F26%20beer%20%F0%9F%8D%BA';
const FEEDBACK_URL = 'mailto:michael.stine@gmail.com?subject=NFL%2F26%20feedback';
const WELCOME_KEY = 'nfl26.welcome.v1';
function setupWelcome() {
  const el = $('#welcome'); if (!el) return;
  // Not configured yet (placeholder links) → keep the screen and footer link off until they're filled in.
  if (/YOUR-/.test(SUPPORT_URL) || /YOUR-/.test(FEEDBACK_URL)) { $('#foot-support').hidden = true; $('#btn-beer').hidden = true; return; }
  $('#btn-beer').href = SUPPORT_URL;
  $('#welcome-support').href = SUPPORT_URL;
  $('#welcome-feedback').href = FEEDBACK_URL;
  $('#foot-support').href = SUPPORT_URL; $('#foot-support').target = '_blank'; $('#foot-support').rel = 'noopener';
  let seen = false; try { seen = !!localStorage.getItem(WELCOME_KEY); } catch {}
  if (seen) return;
  const dismiss = () => { el.hidden = true; try { localStorage.setItem(WELCOME_KEY, String(Date.now())); } catch {} if (!state.prefs.teams.length) setTimeout(openModal, 250); };
  $('#welcome-skip').onclick = dismiss;
  $('#welcome-support').addEventListener('click', () => setTimeout(dismiss, 300));
  el.hidden = false;
}

// ---- Boot ------------------------------------------------------------------

(async function boot() {
  setupWelcome();
  initAuth().catch(e => console.warn('auth init', e));
  applyLayout(); applyTheme();
  setStatus('', 'LOADING');
  renderMyTeams();
  view.innerHTML = '<div class="panel empty">Loading this week\'s slate…</div>';
  try {
    await loadCore();
    ctx.playoff = projectPlayoff(ctx.directory);
    await render();
    renderMyTeams();
    statusFromData();
  } catch (e) {
    console.error(e);
    ctx.error = e;
    setStatus('err', 'ESPN FEED UNAVAILABLE');
    view.innerHTML = `<div class="panel empty">Couldn't reach the scoreboard feed.<br><span class="muted">${esc(e.message)}</span><br><br><button class="btn btn-amber" onclick="location.reload()">Retry</button></div>`;
  }
  scheduleRefresh();
})();
