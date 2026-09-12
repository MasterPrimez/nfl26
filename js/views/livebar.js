// Team page → live scoreboard bar for the team's game in progress (or a slim "Final" bar right after).
import { esc } from '../ui.js';
import { state } from '../state.js';
import { primaryNetwork, watchOptions, displayNetwork } from '../networks.js';

export function renderLiveBar(g, myId) {
  if (!g || g.state === 'pre') return '';
  myId = String(myId);
  const meHome = String(g.home.id) === myId;
  const me = meHome ? g.home : g.away, opp = meHome ? g.away : g.home;
  const live = g.state === 'in';
  const lead = (a, b) => (a.score ?? 0) > (b.score ?? 0) ? 'lead' : (a.score ?? 0) < (b.score ?? 0) ? 'trail' : '';
  const poss = t => live && g.situation?.possession && String(g.situation.possession) === String(t.id) ? '<span class="poss" title="Possession"></span>' : '';
  const side = (t, home, cls) => `<div class="side ${cls}"><img src="${esc(t.logo)}" alt=""><div><div class="rk">${t.rank ? '#' + t.rank + ' · ' : ''}${esc(t.record || '')}${t.record ? ' · ' : ''}${home ? 'HOME' : 'AWAY'}${poss(t)}</div><div class="nm">${esc(t.fullName || t.name)}</div>${home && g.venue ? `<div class="rec">${esc(g.venue.name || '')}${g.venue.city ? ' · ' + esc(g.venue.city) + (g.venue.state ? ', ' + esc(g.venue.state) : '') : ''}</div>` : ''}</div></div>`;
  const quarters = (g.away.linescores || []).map((v, i) => `<span>${i < 4 ? ['1ST', '2ND', '3RD', '4TH'][i] : 'OT' + (i > 4 ? i - 3 : '')} <b>${v}–${g.home.linescores?.[i] ?? '—'}</b></span>`).join('') + (g.away.linescores?.length < 4 ? Array.from({ length: 4 - (g.away.linescores?.length || 0) }, (_, k) => `<span>${['1ST', '2ND', '3RD', '4TH'][(g.away.linescores?.length || 0) + k]} <b>—</b></span>`).join('') : '');
  const hw = g.situation?.homeWin;
  const myP = hw != null ? Math.round((meHome ? hw : 1 - hw) * 100) : null;
  const net = primaryNetwork(g.networks);
  const opts = watchOptions(g.networks); const myOpt = opts.find(o => state.myServices.has(o.id)) || opts.find(o => o.kind === 'primary');
  const status = live ? `<div class="status live">LIVE · ${esc(g.detail)}</div>` : `<div class="status">FINAL${/OT/.test(g.detail) ? ' · ' + esc(g.detail) : ''} · ${me.winner ? 'WIN' : 'LOSS'}</div>`;
  return `<div class="livebar${live ? ' on' : ' done'}" style="--a:${esc(g.away.color)};--b:${esc(g.home.color)}">
    <img class="ghost a" src="${esc(g.away.logo)}" alt="" aria-hidden="true"><img class="ghost b" src="${esc(g.home.logo)}" alt="" aria-hidden="true">
    ${side(g.away, false, '')}
    <div class="mid">${status}<div class="sc"><span class="${lead(g.away, g.home)}">${g.away.score ?? 0}</span><span class="sep">–</span><span class="${lead(g.home, g.away)}">${g.home.score ?? 0}</span></div><div class="sit">${live ? esc(g.situation?.text || '') + (g.situation?.possession ? ' · ' + esc((String(g.situation.possession) === String(g.home.id) ? g.home.name : g.away.name).toUpperCase()) + ' BALL' : '') : (g.headline ? esc(g.headline) : '')}</div></div>
    ${side(g.home, true, 'r')}
    <div class="foot">
      <div class="q">${quarters}</div><span class="spacer"></span>
      ${live && myP != null ? `<div class="wpr"><div class="k">WIN PROBABILITY · LIVE FROM ESPN</div><div class="bar"><i style="width:${meHome ? 100 - myP : myP}%"></i><b style="left:${meHome ? 100 - myP : myP}%"></b></div><div class="lbl"><span>${esc(g.away.name.toUpperCase())} ${meHome ? 100 - myP : myP}%</span><span>${esc(g.home.name.toUpperCase())} ${meHome ? myP : 100 - myP}%</span></div></div>` : ''}
      ${net ? `<span class="pill net">${esc(displayNetwork(net))}</span>` : ''}
      ${live && myOpt ? `<a class="pill amber" href="${esc(myOpt.url)}" target="_blank" rel="noopener">▶ WATCH ON ${esc(myOpt.name.toUpperCase())}</a>` : ''}
      <a class="pill" href="#/game/${g.id}">${live ? 'FOLLOW LIVE →' : 'BOX SCORE →'}</a>
    </div>
  </div>`;
}

// The team's game to feature: in progress, or finished within the last 5 hours.
export function featuredGame(ctx, events, teamId) {
  const ev = events.find(e => e.state === 'in') || events.filter(e => e.state === 'post').reverse().find(e => Date.now() - e.date.getTime() < 5 * 3600_000 + 3.5 * 3600_000);
  if (!ev) return null;
  return ctx.allGames?.get(ev.id) || ctx.games?.find(g => g.id === ev.id) || null;
}
