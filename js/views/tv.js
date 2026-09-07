import { esc, filterBar, applyFilter, isMobile, gameRowMobile } from '../ui.js';
import { fmtDay, dayKey, hourOf, tzLabel, state } from '../state.js';
import { NETWORK_ORDER, networkClass, primaryNetwork, watchSummary } from '../networks.js';

const GAME_HOURS = 3.5;

export function renderTV(ctx, params) {
  const { games, week, calendar } = ctx;
  const weekBtns = calendar.map(w => `<button class="${w.key === week ? "on" : (w.past ? "past" : "")}" data-week="${w.key}" title="${esc(w.detail)}">${esc(w.short)}</button>`).join('');

  const days = [...new Set(games.map(g => dayKey(g.date)))].sort();
  const today = dayKey(new Date());
  // Default day: today if it's in this week; otherwise the busiest day of the week (Saturday, normally).
  const count = d => games.filter(g => dayKey(g.date) === d).length;
  const busiest = days.reduce((a, d) => (count(d) > count(a) ? d : a), days[0]);
  const day = params.day && days.includes(params.day) ? params.day : (days.includes(today) ? today : busiest);
  const view = params.view || (isMobile() ? 'list' : 'grid');
  const dayBtns = days.map(d => { const g = games.find(x => dayKey(x.date) === d); return `<button class="btn${d === day ? ' on' : ''}" data-day="${d}">${esc(fmtDay(g.date).split(',')[0].slice(0, 3))} ${esc(fmtDay(g.date).split(', ')[1] || '')}</button>`; }).join('');

  const dayGames = applyFilter(games.filter(g => dayKey(g.date) === day && !g.tbd));
  if (!dayGames.length) return header() + `<div class="panel empty">No games on this day for the current filter.</div>`;

  if (view === 'list') {
    const nets = new Map();
    dayGames.forEach(g => { const n = primaryNetwork(g.networks) || 'TBA'; if (!nets.has(n)) nets.set(n, []); nets.get(n).push(g); });
    const order = n => { const i = NETWORK_ORDER.indexOf(n); return i < 0 ? 100 + n.charCodeAt(0) : i; };
    const list = [...nets.keys()].sort((a, b) => order(a) - order(b)).map(n => {
      const gs = nets.get(n).sort((a, b) => a.date - b.date);
      return `<div class="net-h"><div class="disp ${networkClass(n) === 'espn' ? 'amber' : networkClass(n) === 'minor' ? 'muted' : ''}">${esc(n)}</div><span class="sub">${gs.length} GAME${gs.length === 1 ? '' : 'S'}</span></div><div class="panel">${gs.map(gameRowMobile).join('')}</div>`;
    }).join('');
    return header() + `<div class="tvlist">${list}</div><div class="legend"><span>TIMES IN ${tzLabel()} · GROUPED BY NETWORK · TAP A GAME FOR WATCH OPTIONS</span></div>`;
  }

  // Grid bounds: floor of earliest kickoff to ceil of latest kickoff + game length, in half-hour slots.
  const now = new Date();
  const nowSameDay = dayKey(now) === day;
  const nowH = hourOf(now);
  const starts = dayGames.map(g => hourOf(g.date));
  const startH = Math.floor(Math.min(...starts) * 2) / 2;
  let endH = Math.max(...starts.map((s, i) => Math.max(s + GAME_HOURS, blockEnd(dayGames[i], s, nowSameDay, nowH))));
  endH = Math.min(Math.ceil(endH * 2) / 2, startH + 17);
  const slots = Math.round((endH - startH) * 2);
  const cols = `grid-template-columns:118px repeat(${slots},minmax(0,1fr))`;

  // Rows: one per network, in a sensible order.
  const nets = new Map();
  dayGames.forEach(g => { const n = primaryNetwork(g.networks) || 'TBA'; if (!nets.has(n)) nets.set(n, []); nets.get(n).push(g); });
  const order = n => { const i = NETWORK_ORDER.indexOf(n); return i < 0 ? 100 + n.charCodeAt(0) : i; };
  const netList = [...nets.keys()].sort((a, b) => order(a) - order(b));

  const nowSlot = nowSameDay ? Math.floor((nowH - startH) * 2) : -1;
  const head = `<div class="tv-row head" style="${cols}"><div class="label" style="padding:8px 10px;align-self:end">Network</div>${Array.from({ length: slots }, (_, i) => `<div class="tv-slot">${slotLabel(startH + i / 2)}</div>`).join('')}</div>`;

  const rows = netList.map(n => {
    const gs = nets.get(n).sort((a, b) => a.date - b.date);
    // Overlapping games on the same network → extra sub-rows.
    const lanes = [];
    gs.forEach(g => { const s = hourOf(g.date); let lane = lanes.find(l => l.end <= s + 0.01); if (!lane) { lane = { end: 0, games: [] }; lanes.push(lane); } lane.games.push(g); lane.end = s + GAME_HOURS; });
    return lanes.map((lane, li) => `<div class="tv-row" style="${cols}">
      <div class="tv-net ${networkClass(n)}">${li === 0 ? esc(n) : ''}</div>
      ${Array.from({ length: slots }, (_, i) => `<div class="tv-cell${i === nowSlot ? ' now' : ''}" style="grid-column:${i + 2}"></div>`).join('')}
      ${lane.games.map(g => block(g, startH, slots, nowSameDay, nowH)).join('')}
    </div>`).join('');
  }).join('');

  return header() + `<div class="tvwrap"><div class="tvgrid">${head}${rows}</div></div>
    <div class="legend"><span><i style="display:inline-block;width:10px;height:10px;border:1px solid var(--live);border-radius:2px;vertical-align:middle;margin-right:6px"></i>LIVE NOW</span><span><i style="display:inline-block;width:10px;height:10px;background:rgba(245,165,36,0.25);vertical-align:middle;margin-right:6px"></i>CURRENT HALF-HOUR</span><span>FINALS DIMMED · COLOR BAR = AWAY (TOP) / HOME (BOTTOM) · BLOCKS RUN ${GAME_HOURS} HRS AND EXTEND WHILE LIVE · TIMES IN ${tzLabel()}</span></div>`;

  function header() {
    const w = calendar.find(x => x.key === week);
    return `<div class="toolbar"><span class="label">Week</span><div class="weeks">${weekBtns}</div>${w && !w.current ? `<span class="sub" style="white-space:nowrap">${esc(w.label)} · ${esc(w.detail)}${w.past ? '' : ' · times/TV firm up ~6 days out'}</span>` : ''}</div>
      <div class="toolbar"><div class="disp h2">${esc(fmtDay(new Date(day + 'T12:00:00')))}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${dayBtns}</div><span class="sep"></span><span class="label">View</span><button class="btn${view === 'grid' ? ' on' : ''}" data-view="grid">Grid</button><button class="btn${view === 'list' ? ' on' : ''}" data-view="list">By network</button></div>
      <div class="toolbar">${filterBar()}</div>`;
  }
}

function blockEnd(g, s, nowSameDay, nowH) {
  if (g.state === 'in' && nowSameDay) return Math.max(s + GAME_HOURS, nowH + 0.5);
  return s + GAME_HOURS;
}

function block(g, startH, slots, nowSameDay, nowH) {
  const s = hourOf(g.date);
  const e = blockEnd(g, s, nowSameDay, nowH);
  const c0 = Math.max(0, Math.round((s - startH) * 2));
  const span = Math.max(2, Math.min(slots - c0, Math.round((e - s) * 2)));
  const cls = g.state === 'in' ? ' live' : g.state === 'post' ? ' done' : '';
  const st = g.state === 'in' ? `<span class="st live">● ${esc(g.detail)}</span>` : g.state === 'post' ? `<span class="st">FINAL ${g.away.score}–${g.home.score}</span>` : `<span class="st">${esc(watchSummary(g.networks, state.myServices).split(' · ')[0])}</span>`;
  const ln = (t, home) => `<div class="ln${state.isMine(t.id) ? ' mine' : ''}"><img src="${esc(t.logo)}" alt="" loading="lazy">${home ? '<span class="muted" style="font-size:10px">@</span>' : ''}${t.rank ? `<span class="rank">#${t.rank}</span>` : ''}<span style="overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</span>${g.state !== 'pre' && t.score != null ? `<span class="mono muted" style="font-size:10px;margin-left:auto;padding-left:6px">${t.score}</span>` : ''}</div>`;
  return `<div class="tv-block${cls}" style="grid-column:${c0 + 2} / span ${span}" data-game="${g.id}" title="${esc(g.name)}">
    <div class="bar" style="background:linear-gradient(180deg,${g.away.color} 0%,${g.away.color} 50%,${g.home.color} 50%,${g.home.color} 100%)"></div>
    <div class="lines">${ln(g.away, false)}${ln(g.home, true)}</div>${st}
  </div>`;
}

function slotLabel(h) {
  const hh = Math.floor(h) % 24; const m = h % 1 ? '30' : '00';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m}<br><span>${hh < 12 ? 'AM' : 'PM'}</span>`;
}
