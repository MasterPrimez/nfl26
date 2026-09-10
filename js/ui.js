import { state, fmtTime, tzLabel } from './state.js';
import { primaryNetwork, watchSummary } from './networks.js';

export const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function statusBadge(g) {
  if (g.state === 'in') return `<span class="badge live">● ${esc(g.detail)}</span>`;
  if (g.state === 'post') return `<span class="badge final">${esc(g.detail || 'Final')}</span>`;
  if (g.tbd) return `<span class="badge">TBA</span>`;
  return `<span class="badge">${fmtTime(g.date)} ${tzLabel()}</span>`;
}

function teamRow(t, g, isHome) {
  const leading = g.state !== 'pre' && t.score != null && t.score > (isHome ? g.away.score : g.home.score);
  const poss = g.state === 'in' && g.situation && g.situation.possession === t.id ? '<span class="poss">◀</span>' : '';
  const cls = ['team-row', g.state === 'post' && t.winner ? 'winner' : '', g.state === 'in' && leading ? 'leading' : ''].join(' ');
  const mine = state.isMine(t.id) ? ' mine' : '';
  return `<div class="${cls}">
    <img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="tn">
      <div class="name${mine}">${t.rank ? `<span class="rank">#${t.rank}</span>` : ''}<a href="#/team/${t.id}" onclick="event.stopPropagation()">${esc(t.name)}</a></div>
      <div class="rec">${esc(t.record)}${t.confRecord ? ' · ' + esc(t.confRecord) + ' conf' : ''}</div>
    </div>
    <div class="score">${g.state === 'pre' ? '—' : (t.score ?? '—')}${poss}</div>
  </div>`;
}

export function gameCard(g) {
  const net = primaryNetwork(g.networks);
  const venue = g.venue ? `${esc(g.venue.name)}${g.venue.city ? ' · ' + esc(g.venue.city) + (g.venue.state ? ', ' + esc(g.venue.state) : '') : ''}` : '';
  const watch = g.state === 'post' ? 'Box score →' : 'Watch: ' + esc(watchSummary(g.networks, state.myServices));
  const line = g.odds?.details ? esc(g.odds.details) : '';
  const sit = g.state === 'in' && g.situation?.text ? `<span class="sub">${esc(g.situation.text)}</span>` : '';
  return `<div class="panel card${g.state === 'in' ? ' live' : ''}" data-game="${g.id}">
    <div class="card-top">${statusBadge(g)}${sit}<span class="spacer"></span>${net ? `<span class="badge net">${esc(net)}</span>` : ''}</div>
    ${teamRow(g.away, g, false)}
    ${teamRow(g.home, g, true)}
    <div class="hr"></div>
    <div class="card-foot"><span>${venue}${g.neutral ? ' · Neutral' : ''}</span><span>${watch}</span>${line ? `<span class="r">${line}</span>` : ''}</div>
  </div>`;
}

export function gameRow(g) {
  const net = primaryNetwork(g.networks);
  const venue = g.venue ? `${esc(g.venue.name)}${g.venue.city ? ' · ' + esc(g.venue.city) + ', ' + esc(g.venue.state || '') : ''}` : '';
  const score = g.state === 'pre' ? '<span class="muted">—</span>' : `${g.away.score ?? ''}–${g.home.score ?? ''}`;
  const tm = t => `${t.rank ? `<span class="amber mono" style="font-size:11px">#${t.rank}</span> ` : ''}<span${state.isMine(t.id) ? ' class="mine"' : ''}>${esc(t.name)}</span>`;
  return `<tr class="rowlink" data-game="${g.id}">
    <td>${statusBadge(g)}</td>
    <td>${tm(g.away)} <span class="muted">${g.neutral ? 'vs' : 'at'}</span> ${tm(g.home)}</td>
    <td class="mono">${score}</td>
    <td class="muted">${venue}</td>
    <td class="mono">${esc(net)}</td>
    <td class="muted">${g.state === 'post' ? 'Box score →' : esc(watchSummary(g.networks, state.myServices))}</td>
    <td class="mono muted">${esc(g.odds?.details || '')}</td>
  </tr>`;
}

// Slim one-line-per-game rows for phones.
export function gameRowMobile(g) {
  const st = g.state === 'in' ? `<span class="st live">● ${esc(g.detail.replace(/ - /, ' '))}</span>` : g.state === 'post' ? '<span class="st">Final</span>' : g.tbd ? '<span class="st">TBA</span>' : `<span class="st">${fmtTime(g.date)}</span>`;
  const tm = (t, home) => `<div class="tm"><img src="${esc(t.logo)}" alt="" loading="lazy">${home ? '<span class="muted" style="font-size:10px">@</span>' : ''}${t.rank ? `<span class="rank mono amber" style="font-size:10px">#${t.rank}</span>` : ''}<span class="nm${state.isMine(t.id) ? ' mine' : ''}">${esc(t.name)}</span></div>`;
  const sc = (t, other) => g.state === 'pre' ? '<div class="sc"></div>' : `<div class="sc${t.score != null && t.score >= (other.score ?? 0) ? ' w' : ''}">${t.score ?? ''}</div>`;
  const net = primaryNetwork(g.networks);
  const meta = [net || '', g.state === 'post' ? '' : watchSummary(g.networks, state.myServices).split(' · ')[0], g.odds?.details || ''].filter(Boolean).join(' · ');
  return `<div class="mrow" data-game="${g.id}">${st}${tm(g.away, false)}${sc(g.away, g.home)}${tm(g.home, true)}${sc(g.home, g.away)}<div class="meta">${esc(meta)}</div></div>`;
}

export function rowsTable(games) {
  if (isMobile()) return `<div class="panel">${games.map(gameRowMobile).join('')}</div>`;
  return `<div class="panel rows"><table>
    <thead><tr><th style="width:110px">Status</th><th>Matchup</th><th style="width:80px">Score</th><th>Venue</th><th style="width:70px">TV</th><th style="width:170px">Watch</th><th style="width:80px">Line</th></tr></thead>
    <tbody>${games.map(gameRow).join('')}</tbody></table></div>`;
}

export function filterBar(extra = '') {
  const f = state.prefs.filter;
  const b = (id, label) => `<button class="btn${f === id ? ' on' : ''}" data-filter="${id}">${label}</button>`;
  return `<span class="label">Show</span>${b('all', 'All games')}${b('mine', 'My Teams')}${b('prime', 'Primetime')}${b('afc', 'AFC')}${b('nfc', 'NFC')}
    <span class="sep"></span><span class="label">Time</span>${['local', 'pt', 'et'].map(t => `<button class="btn${state.prefs.tz === t ? ' on' : ''}" data-tz="${t}">${t === 'local' ? 'Local' : t.toUpperCase()}</button>`).join('')}${extra}`;
}

export function applyFilter(games) {
  const f = state.prefs.filter;
  const mine = state.myTeams;
  if (f === 'mine') return games.filter(g => mine.has(g.home.id) || mine.has(g.away.id));
  if (f === 'prime') return games.filter(isPrimetime);
  if (f === 'afc') return games.filter(g => g.home.conference === 'AFC' || g.away.conference === 'AFC');
  if (f === 'nfc') return games.filter(g => g.home.conference === 'NFC' || g.away.conference === 'NFC');
  return games;
}

export function isFeatured(g) {
  const mine = state.myTeams;
  return mine.has(g.home.id) || mine.has(g.away.id) || isPrimetime(g);
}

// Wire clicks inside a view: game rows/cards → game page, filter/tz buttons → state.
export function wire(root) {
  root.addEventListener('click', e => {
    const gm = e.target.closest('[data-game]');
    if (gm && !e.target.closest('a')) { location.hash = `#/game/${gm.dataset.game}`; return; }
    const fb = e.target.closest('[data-filter]');
    if (fb) { state.setFilter(fb.dataset.filter); return; }
    const tb = e.target.closest('[data-tz]');
    if (tb) { state.setTz(tb.dataset.tz); return; }
  });
}

// Standalone-window games: anything not in the Sunday 1pm / 4pm ET waves (TNF, SNF, MNF, holiday games, London mornings).
export function isPrimetime(g) {
  const et = new Date(g.date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(), h = et.getHours();
  if (day !== 0) return true;
  return h >= 19 || h < 12;
}

// Segmented view switch with icons: items = [{key, label, icon, href|data}]; current = key.
const ICONS = {
  list: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2.6" rx=".8"/><rect x="1" y="6.7" width="14" height="2.6" rx=".8"/><rect x="1" y="11.4" width="14" height="2.6" rx=".8"/></svg>',
  chart: '<svg viewBox="0 0 16 16"><path d="M1.5 12.5 6 7.5l3 3 5.5-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="7.5" r="1.6"/><circle cx="9" cy="10.5" r="1.6"/><circle cx="14.5" cy="3.5" r="1.6"/></svg>',
  grid: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="6" height="3" rx=".8"/><rect x="8.5" y="2" width="6.5" height="3" rx=".8"/><rect x="1" y="6.5" width="9" height="3" rx=".8"/><rect x="11.5" y="6.5" width="3.5" height="3" rx=".8"/><rect x="1" y="11" width="4" height="3" rx=".8"/><rect x="6.5" y="11" width="8" height="3" rx=".8"/></svg>',
  rows: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="3" height="3" rx=".8"/><rect x="5.5" y="2.4" width="9.5" height="2.2" rx=".8"/><rect x="1" y="6.5" width="3" height="3" rx=".8"/><rect x="5.5" y="6.9" width="9.5" height="2.2" rx=".8"/><rect x="1" y="11" width="3" height="3" rx=".8"/><rect x="5.5" y="11.4" width="9.5" height="2.2" rx=".8"/></svg>',
};
export function viewSwitch(items, current) {
  return `<div class="viewseg" role="tablist">${items.map(it => it.href
    ? `<a class="vs${it.key === current ? ' on' : ''}" href="${it.href}" role="tab">${ICONS[it.icon] || ''}<span>${esc(it.label)}</span></a>`
    : `<button class="vs${it.key === current ? ' on' : ''}" type="button" role="tab" ${it.data}>${ICONS[it.icon] || ''}<span>${esc(it.label)}</span></button>`).join('')}</div>`;
}

// Pinch-to-zoom (and +/−) for a wide element inside a scrolling wrapper. Uses CSS zoom so scroll extents stay right.
export function pinchZoom(wrap, target, key, opts = {}) {
  if (!wrap || !target) return;
  let z = opts.initial ?? 1; try { z = Number(localStorage.getItem(key)) || z; } catch {}
  const label = opts.label;
  const base = opts.width ? wrap.clientWidth - (opts.pad || 0) : 0;
  const apply = () => { if (opts.width) { target.style.width = Math.round(base * z) + 'px'; target.style.maxWidth = 'none'; } else target.style.zoom = z; if (label) label.textContent = Math.round(z * 100) + '%'; try { localStorage.setItem(key, String(z)); } catch {} };
  const set = n => { z = Math.min(opts.max || 2.5, Math.max(opts.min || 0.45, n)); apply(); };
  apply();
  (opts.buttons || []).forEach(b => b.addEventListener('click', () => set(z * (b.dataset.zoom === '+' ? 1.2 : 1 / 1.2))));
  let d0 = 0, z0 = 1, lastTap = 0;
  const dist = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  wrap.addEventListener('touchstart', e => { if (e.touches.length === 2) { d0 = dist(e); z0 = z; } }, { passive: true });
  wrap.addEventListener('touchmove', e => { if (e.touches.length === 2 && d0) { e.preventDefault(); set(z0 * dist(e) / d0); } }, { passive: false });
  wrap.addEventListener('touchend', e => { d0 = 0; const t = Date.now(); if (t - lastTap < 300 && e.touches.length === 0 && !e.target.closest('a, button, [data-team]')) set(z === 1 ? (opts.alt || 0.6) : 1); lastTap = t; });
}
export function zoomControl(id) { return `<div class="tvzoom mono" id="${id}"><button type="button" data-zoom="-">−</button><span class="zv">100%</span><button type="button" data-zoom="+">+</button><span class="hint">PINCH TO ZOOM</span></div>`; }
