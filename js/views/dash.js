// Dashboard home: one screen, every tile live and tappable. Uses the same data loader as the story home (loadHome).
import { esc, isMobile, isPrimetime } from '../ui.js';
import { api, logoUrl } from '../api.js';
import { state, fmtTime, fmtDay, fmtShortDate, dayKey, tzLabel } from '../state.js';
import { SERVICES, primaryNetwork, watchOptions, watchSummary, displayNetwork } from '../networks.js';

const GREEN = '#4fc98a', RED = '#ff5a4a';

// Tile catalog: what the customizer offers. Sizes: s = quarter, m = half, l = three-quarters, f = full width.
export const TILE_CATALOG = [
  { id: 'rank',      name: 'Playoff picture',       blurb: 'Your seed, division place, net points trend.' },
  { id: 'stride',    name: 'Season stride',         blurb: 'Margin of every game so far, bars by week.' },
  { id: 'tv',        name: 'TV tonight',            blurb: 'The biggest games today, mapped to your services.' },
  { id: 'stand',     name: 'Division standings',    blurb: 'Your division, top to bottom.' },
  { id: 'cfp',       name: 'Playoff seeds',         blurb: 'AFC and NFC seeds 1–7.' },
  { id: 'mov',       name: 'Hot & cold',            blurb: 'Longest win and losing streaks in the league.' },
  { id: 'next3',     name: 'Next 3 games',          blurb: 'Who\'s up next, when, and how to watch.' },
  { id: 'form',      name: 'Streak & form',         blurb: 'Last five results and the current streak.' },
  { id: 'line',      name: 'Betting line',          blurb: 'Spread and over/under for your next game.' },
  { id: 'leaders',   name: 'Leaders',               blurb: 'Passing, rushing, receiving from your last game.' },
  { id: 'upset',     name: 'Primetime',             blurb: 'This week\'s standalone games: TNF, SNF, MNF.' },
  { id: 'close',     name: 'Closest games',         blurb: 'Live games inside one score.' },
  { id: 'countdown', name: 'Countdown',             blurb: 'A big clock to kickoff.' },
  { id: 'livegrid',  name: 'Live scoreboard',       blurb: 'Every game in progress: big scores, clock and quarter. Close games glow red.' },
];
export const DEFAULT_LAYOUT = [{ id: 'livegrid', size: 'f' }, { id: 'rank', size: 's' }, { id: 'stride', size: 'm' }, { id: 'tv', size: 's' }, { id: 'stand', size: 's' }, { id: 'cfp', size: 'm' }, { id: 'mov', size: 's' }];
const SIZES = ['s', 'm', 'l', 'f'];
export function currentLayout() { const l = state.prefs.dash; return Array.isArray(l) && l.length ? l.filter(t => TILE_CATALOG.some(c => c.id === t.id)) : DEFAULT_LAYOUT; }
const cols = size => ({ s: 3, m: 6, l: 9, f: 12 })[size] || 3;

export function renderDash(ctx, d) {
  const teams = state.prefs.teams;
  const dir = ctx.directory;
  if (!teams.length || !d) {
    return { html: `<div class="dashboard"><div class="dt hero empty" style="grid-column:1/-1"><div class="k">WELCOME</div><div class="disp big">Pick your team.</div><div class="lede">Choose the teams you follow and this screen becomes their dashboard: the game right now, the odds, TV, division standings and the playoff picture.</div><div><button class="btn primary" id="add-team-2" type="button">Choose my teams</button></div></div></div>`, mount: null };
  }
  const { team, opp, next, game, past, prob, apRank, cfpSeed, cfpOfficial, confPlace, rankHist, events } = d;
  const mine = new Set(teams);
  const focus = `<div class="dash-focus">${teams.length > 1 ? teams.map(id => { const t = dir?.teams.find(x => x.id === id); return `<button type="button" class="df${id === team.id ? ' on' : ''}" data-focus="${id}"><img src="${esc(t?.logo || logoUrl(id))}" alt=""><span>${esc(t?.name || 'Team')}</span></button>`; }).join('') : ''}<button type="button" class="df cust" id="dash-customize">⚙ Customize</button></div>`;

  // ---- Hero
  const live = game?.state === 'in', final = game?.state === 'post';
  let hero;
  const myScore = game && next ? (next.home ? game.home.score : game.away.score) : null, oppScore = game && next ? (next.home ? game.away.score : game.home.score) : null;
  if (next && opp) {
    const g = game;
    const net = g ? primaryNetwork(g.networks) : (next.network || '');
    const opts = g ? watchOptions(g.networks) : [];
    const myOpt = opts.find(o => state.myServices.has(o.id)) || opts.find(o => o.kind === 'primary');
    const when = next.tbd ? `${fmtDay(next.date).toUpperCase()} · TIME TBA` : `${fmtDay(next.date).toUpperCase()} · ${fmtTime(next.date)} ${tzLabel()}`;
    const eyebrow = live ? `<span class="live">LIVE · ${esc(g.detail)}</span>` : final ? `<span>FINAL${g.detail && /OT/.test(g.detail) ? ' · ' + esc(g.detail) : ''}</span>` : `<span class="amber">NEXT · ${esc(when)}</span>`;
    const ph = d.photos || {};
    const bg = `<div class="bg" aria-hidden="true">${ph.mine ? `<div class="l" style="background-image:url('${esc(ph.mine)}')"></div>` : ''}${ph.opp ? `<div class="r" style="background-image:url('${esc(ph.opp)}')"></div>` : ''}<div class="tint" style="--cl:${esc(team.color)};--cr:${esc(opp.color)}"></div><div class="fade"></div></div>`;
    const side = (t, rank, rec, cls) => `<div class="side ${cls}"><img src="${esc(t.logo)}" alt=""><div><div class="rk">${rank ? '#' + rank + ' · ' : ''}${esc(rec || '')}</div><div class="nm">${esc(t.fullName || t.name)}</div></div></div>`;
    const center = (live || final) && g ? `<div class="sc"><span data-n="${myScore}">${myScore}</span><span class="dash-sep">–</span><span data-n="${oppScore}">${oppScore}</span></div>` : `<div class="sc pre"><span class="vs">${next.home || next.neutral ? 'VS' : '@'}</span><small>${esc(next.venue || '')}${next.city ? ' · ' + esc(next.city).toUpperCase() : ''}</small></div>`;
    const probRow = prob ? `<div class="wpr"><div class="k">WIN PROBABILITY · ${prob.src === 'live' ? 'LIVE FROM ESPN' : prob.src === 'vegas' ? 'FROM THE BETTING LINE' : 'OUR MODEL'}</div><div class="bar" style="--a:${esc(team.color)};--b:${esc(opp.color)}"><i style="width:${prob.p}%"></i><b style="left:${prob.p}%"></b></div><div class="lbl"><span>${esc(team.name.toUpperCase())} ${prob.p}%</span><span>${esc(opp.name.toUpperCase())} ${100 - prob.p}%</span></div></div>` : `<div class="wpr"><div class="k">${final ? (myScore > oppScore ? 'WIN' : 'LOSS') + ' · ' + esc(team.record) : ''}</div></div>`;
    const cta = final ? `<a class="pill amber" href="#/game/${next.id}">BOX SCORE</a>` : myOpt ? `<a class="pill amber" href="${esc(myOpt.url)}" target="_blank" rel="noopener">▶ WATCH ON ${esc(myOpt.name.toUpperCase())}</a><a class="pill" href="#/game/${next.id}">${live ? 'FOLLOW LIVE' : 'HOW TO WATCH'}</a>` : `<a class="pill amber" href="#/game/${next.id}">${live ? 'FOLLOW LIVE' : 'HOW TO WATCH'}</a>`;
    hero = `<div class="dt hero" data-href="#/game/${next.id}" style="--c:${esc(team.color)}">${bg}
      <div class="top">${eyebrow}<span class="dim">${live || final ? esc((next.venue || '').toUpperCase()) : ''}</span>${net ? `<span class="pill net">${esc(displayNetwork(net))}</span>` : ''}</div>
      <div class="mid">${side(team, apRank, team.record, 'me')}${center}${side(opp, opp.rank, opp.record, 'r')}</div>
      <div class="bot">${probRow}<div class="ctas">${cta}</div></div>
    </div>`;
  } else {
    hero = `<div class="dt hero" style="--c:${esc(team.color)}"><div class="top"><span class="amber">SEASON COMPLETE</span></div><div class="mid"><div class="side me"><img src="${esc(team.logo)}" alt=""><div><div class="rk">${esc(team.record)}</div><div class="nm">${esc(team.fullName || team.name)}</div></div></div></div><div class="bot"></div></div>`;
  }

  const layout = currentLayout();

  // ---- Live rail: my teams first, then ranked games, live before upcoming before finals.
  const pri = g => (mine.has(g.home.id) || mine.has(g.away.id) ? 0 : 100) + (g.state === 'in' ? 0 : g.state === 'pre' ? 10 : 20) + (isPrimetime(g) ? 0 : 0.5);
  const railGames = [...ctx.games].filter(g => !g.tbd || g.state !== 'pre').sort((a, b) => pri(a) - pri(b)).slice(0, isMobile() ? 4 : 6);
  const tm = (t, g) => `<span><img src="${esc(t.logo)}" alt="">${t.rank ? `<small>#${t.rank}</small>` : ''}<em class="${g.state === 'post' && t.winner ? 'w' : ''}">${esc(t.name)}</em></span>`;
  const rail = railGames.map(g => {
    const st = g.state === 'in' ? `<span class="li">● ${esc(g.detail)}</span>` : g.state === 'post' ? 'FINAL' : (g.tbd ? 'TBA' : fmtTime(g.date));
    const s = g.state === 'pre' ? '<span></span><span></span>' : `<span class="${g.away.winner && g.state === 'post' ? 'w' : ''}">${g.away.score}</span><span class="${g.home.winner && g.state === 'post' ? 'w' : ''}">${g.home.score}</span>`;
    return `<a class="g${g.state === 'post' ? ' done' : ''}" href="#/game/${g.id}"><i class="bar" style="--a:${esc(g.away.color)};--b:${esc(g.home.color)}"></i><div class="tm">${tm(g.away, g)}${tm(g.home, g)}</div><div class="s">${s}</div><div class="st">${st}<br><span class="net">${esc(displayNetwork(primaryNetwork(g.networks) || ''))}</span></div></a>`;
  }).join('') || '<div class="g muted mono" style="padding:16px">No games on the board this week.</div>';

  // ---- Playoff picture tile: seed (or OUT), division place, conference rank, cumulative point-margin sparkline.
  const confRank = d.confRank;
  const seedHtml = cfpSeed ? `<i>#</i>${cfpSeed}` : `<span class="nr">${team.gp ? 'OUT' : '—'}</span>`;
  const cum = []; let run = 0; past.forEach(g => { run += (g.score - g.oppScore); cum.push(run); });
  const spark = cum.length >= 2 ? (() => { const W = 300, H = 70, n = cum.length; const mx = Math.max(10, ...cum.map(Math.abs)); const x = i => (i / (n - 1)) * W; const y = v => H / 2 - (v / mx) * (H / 2 - 8); const pts = cum.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`); return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="dg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--amber)" stop-opacity=".35"/><stop offset="1" stop-color="var(--amber)" stop-opacity="0"/></linearGradient></defs><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="rgba(255,255,255,.1)"/><path d="M0 ${H / 2} L${pts.join(' L')} L${W} ${H / 2}Z" fill="url(#dg)"/><path d="M${pts.join(' L')}" fill="none" stroke="var(--amber)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`; })() : '';
  const rankTile = `<a class="dt rank pad" href="#/playoff"><div class="k">PLAYOFF ${cfpOfficial ? 'SEED' : 'PICTURE'}<span class="svc"> · ${esc(team.conf?.conference?.abbr || '')}</span><span class="more">BRACKET</span></div>
    <div class="big">${seedHtml} ${cfpSeed ? `<span class="mv ${cfpSeed <= 4 ? 'up' : ''}">${cfpSeed <= 4 ? 'DIVISION LEADER' : 'WILD CARD'}${cfpOfficial ? '' : ' · PROJ.'}</span>` : ''}</div>
    <div class="sub2">${confPlace ? `${ord(confPlace)} IN ${esc((team.conf?.name || 'DIVISION').toUpperCase())}` : ''}${confRank ? ` · ${ord(confRank)} IN ${esc((team.conf?.conference?.abbr || 'CONF').toUpperCase())}` : ''}${cum.length ? ` · NET ${run > 0 ? '+' : ''}${run} PTS` : ''}</div>${spark}</a>`;

  // ---- Season stride
  const sched = (events || []).filter(e => e.week);
  const maxm = Math.max(21, ...past.map(g => Math.abs(g.score - g.oppScore)));
  const bars = sched.map(e => e.state === 'post' && e.score != null
    ? (() => { const m = e.score - e.oppScore; return `<a href="#/game/${e.id}" class="b ${m >= 0 ? 'w' : 'l'}" style="height:${Math.max(8, Math.abs(m) / maxm * 100)}%"><span>${m > 0 ? '+' : ''}${m}</span><b>${esc(short(e))}</b></a>`; })()
    : `<a href="#/game/${e.id}" class="b n${e.state === 'in' ? ' li' : ''}"><b>${esc(short(e))}</b></a>`).join('');
  const avg = team.gp ? team.diff / team.gp : 0;
  const strideTile = `<div class="dt stride pad" data-href="#/team/${team.id}"><div class="k">SEASON STRIDE<span class="svc"> · MARGIN BY GAME</span><span class="more">SCHEDULE</span></div><div class="bars">${bars || '<div class="muted mono" style="font-size:11px">Schedule not posted yet.</div>'}</div><div class="sub2">${esc(team.record)}${team.gp ? ` · AVG MARGIN ${avg >= 0 ? '+' : ''}${avg.toFixed(1)}` : ''}</div></div>`;

  // ---- TV tonight: the biggest games today (or the next game day), mapped to the user's services.
  const today = dayKey(new Date());
  const days = [...new Set(ctx.games.filter(g => !g.tbd).map(g => dayKey(g.date)))].sort();
  const tvDay = days.includes(today) ? today : (days.find(x => x > today) || days[days.length - 1]);
  const tvSize = layout.find(t => t.id === 'tv')?.size || 's';
  const tvGames = ctx.games.filter(g => dayKey(g.date) === tvDay && g.state !== 'post' && !g.tbd).sort((a, b) => pri(a) - pri(b)).slice(0, isMobile() ? 3 : ({ s: 2, m: 4, l: 6, f: 8 })[tvSize]);
  const tv = tvGames.map(g => { const n = primaryNetwork(g.networks) || 'TBA'; const w = watchSummary(g.networks, state.myServices).split(' · ')[0]; return `<a class="c${g.state === 'in' ? ' now' : ''}" href="#/game/${g.id}"><div class="n">${esc(displayNetwork(n))}</div><div class="m">${g.away.rank ? '#' + g.away.rank + ' ' : ''}${esc(g.away.name)} @ ${g.home.rank ? '#' + g.home.rank + ' ' : ''}${esc(g.home.name)}</div><div class="t2">${g.state === 'in' ? '● LIVE' : fmtTime(g.date)} · ${esc(w.toUpperCase())}</div></a>`; }).join('');
  const svcNames = [...state.myServices].map(id => SERVICES[id]?.name || id.toUpperCase()).slice(0, 3);
  const tvTile = `<div class="dt tv pad"><div class="k">TV ${tvDay === today ? 'TONIGHT' : esc(fmtDay(new Date(tvDay + 'T12:00:00')).toUpperCase())}${svcNames.length ? '<span class="svc"> · YOUR SERVICES: ' + esc(svcNames.join(' · ')) + '</span>' : ''}<a class="more" href="#/tv">TV GUIDE</a></div><div class="tvs">${tv || '<div class="muted mono" style="font-size:11px">Nothing scheduled.</div>'}</div></div>`;

  // ---- Standings
  const ct = (d.confTeams || []).slice(0, isMobile() ? 5 : 5);
  const standTile = team.conf ? `<a class="dt stand pad" href="#/team/${team.id}"><div class="k">${esc(team.conf.name.toUpperCase())}<span class="more">STANDINGS</span></div><table>${ct.map(t => `<tr class="${t.id === team.id ? 'me' : ''}"><td><img src="${esc(t.logo)}" alt="">${esc(t.name)}</td><td class="r">${esc(t.confRec || '0-0')}</td><td class="r">${esc(t.overall)}</td></tr>`).join('')}</table></a>` : '';

  // ---- Playoff seeds, both conferences
  const confs = ctx.playoff?.confs || [];
  const seedRow = c => `<div class="seedrow"><span class="cf">${esc(c.abbr)}</span>${c.seeds.map(t => `<div class="${t.seed === 1 ? 'bye' : ''}${t.id === team.id ? ' me' : ''}"><img src="${esc(t.logo || logoUrl(t.id))}" alt="" title="${esc(t.name)}"><i>${t.seed}</i></div>`).join('')}</div>`;
  const cfpTile = `<a class="dt cfp pad" href="#/playoff"><div class="k">PLAYOFF PICTURE · ${ctx.playoff?.official ? 'OFFICIAL' : 'PROJECTED'}<span class="more">BRACKET</span></div><div class="seeds nfl">${confs.map(seedRow).join('') || '<div class="muted mono" style="font-size:11px">Seeds appear once games are played.</div>'}</div></a>`;

  // ---- Hot & cold: longest current streaks around the league
  const sv = t => { const m = /^([WL])(\d+)$/.exec(t.streak || ''); return m ? (m[1] === 'W' ? 1 : -1) * Number(m[2]) : 0; };
  const streaks = (dir?.teams || []).map(t => ({ ...t, n: sv(t) })).filter(t => Math.abs(t.n) >= 2).sort((a, b) => Math.abs(b.n) - Math.abs(a.n) || b.n - a.n).slice(0, 4);
  const movTile = `<a class="dt mov pad" href="#/standings"><div class="k">HOT &amp; COLD<span class="more">STANDINGS</span></div>${streaks.map(t => `<div class="mvr"><img src="${esc(t.logo)}" alt="">${esc(t.name)}<b class="${t.n > 0 ? 'up' : 'dn'}">${t.n > 0 ? 'W' : 'L'}${Math.abs(t.n)}</b></div>`).join('') || '<div class="muted mono" style="font-size:11px">No streaks yet.</div>'}</a>`;


  // ---- Next 3 games
  const upcoming = (events || []).filter(e => e.state !== 'post').slice(0, 3);
  const next3Tile = `<div class="dt next3 pad" data-href="#/team/${team.id}"><div class="k">NEXT 3<span class="svc"> · ${esc(team.name.toUpperCase())}</span><span class="more">SCHEDULE</span></div>${upcoming.map(e => `<a class="nx" href="#/game/${e.id}"><img src="${esc(e.opp.logo)}" alt=""><div class="t"><div class="o">${e.home || e.neutral ? 'vs' : 'at'} ${e.opp.rank ? `<small>#${e.opp.rank}</small> ` : ''}${esc(e.opp.name)}</div><div class="w">${esc(fmtShortDate(e.date).toUpperCase())} · ${e.tbd ? 'TBA' : fmtTime(e.date)}${e.network ? ' · ' + esc(displayNetwork(e.network)) : ''}</div></div><span class="sv">${e.network ? esc(watchSummary([e.network], state.myServices).split(' · ')[0]) : ''}</span></a>`).join('') || '<div class="muted mono" style="font-size:11px">Season complete.</div>'}</div>`;

  // ---- Streak & form
  const last5 = past.slice(-5);
  const dirTeam = dir?.teams.find(t => t.id === team.id);
  const streak = dirTeam?.streak || '';
  const formTile = `<div class="dt form pad" data-href="#/team/${team.id}"><div class="k">STREAK &amp; FORM<span class="more">TEAM PAGE</span></div>
    <div class="dots">${last5.map(g => `<a href="#/game/${g.id}" class="d ${g.won ? 'w' : 'l'}" title="${esc(g.opp.name)} ${g.score}–${g.oppScore}">${g.won ? 'W' : 'L'}<small>${esc(short(g))}</small></a>`).join('') || '<span class="muted mono" style="font-size:11px">No games yet.</span>'}</div>
    <div class="big">${streak ? `<span class="${/^W/.test(streak) ? 'up' : 'dn'}">${esc(streak)}</span>` : '—'}<span class="mv">${streak ? (/^W/.test(streak) ? 'WIN STREAK' : 'LOSING STREAK') : 'NO STREAK'}</span></div>
    <div class="sub2">${esc(team.record)}${team.gp ? ` · PF ${team.pf.toFixed(1)} · PA ${team.pa.toFixed(1)}` : ''}</div></div>`;

  // ---- Betting line
  const odds = game?.odds;
  const lineTile = `<div class="dt line pad" data-href="${next ? `#/game/${next.id}` : '#/scores'}"><div class="k">BETTING LINE<span class="svc"> · NEXT GAME</span><span class="more">GAME</span></div>
    ${odds && odds.details ? `<div class="big">${esc(odds.details)}</div><div class="sub2">${odds.overUnder ? `OVER / UNDER ${odds.overUnder}` : ''}${prob ? ` · ${esc(team.name.toUpperCase())} ${prob.p}% TO WIN` : ''}</div>` : `<div class="big nr">—</div><div class="sub2">${next ? 'NO LINE POSTED YET' : 'NO UPCOMING GAME'}</div>`}
    ${opp ? `<div class="vsrow"><img src="${esc(team.logo)}" alt=""><span>${next.home || next.neutral ? 'VS' : '@'}</span><img src="${esc(opp.logo)}" alt=""></div>` : ''}</div>`;

  // ---- Leaders (filled in after mount from the last game's box score)
  const lastGame = past[past.length - 1];
  const leadersTile = `<div class="dt leaders pad" data-href="${lastGame ? `#/game/${lastGame.id}` : `#/team/${team.id}`}" data-leaders="${lastGame ? lastGame.id : ''}" data-team="${team.id}"><div class="k">LEADERS<span class="svc"> · ${lastGame ? 'LAST GAME' : ''}</span><span class="more">BOX SCORE</span></div><div class="ld muted mono" style="font-size:11px">${lastGame ? 'Loading…' : 'No games yet.'}</div></div>`;

  // ---- Primetime: this week's standalone-window games
  const liveGames = ctx.games.filter(g => g.state === 'in');
  const prime = ctx.games.filter(g => isPrimetime(g) && g.state !== 'post').sort((a, b) => a.date - b.date).slice(0, 4);
  const upsetTile = `<div class="dt upset pad" data-href="#/scores"><div class="k">PRIMETIME<span class="svc"> · THIS WEEK</span><span class="more">SCORES</span></div>${prime.map(g => `<a class="ug" href="#/game/${g.id}"><span class="tm"><img src="${esc(g.away.logo)}" alt=""><em>${esc(g.away.name)}</em>${g.state === 'in' ? `<b>${g.away.score}</b>` : ''}</span><span class="tm"><img src="${esc(g.home.logo)}" alt=""><em>${esc(g.home.name)}</em>${g.state === 'in' ? `<b>${g.home.score}</b>` : ''}</span><span class="${g.state === 'in' ? 'li' : 'when'}">${g.state === 'in' ? '● ' + esc(g.detail) : esc(fmtDay(g.date).split(',')[0].slice(0, 3).toUpperCase()) + ' ' + fmtTime(g.date) + ' · ' + esc(displayNetwork(primaryNetwork(g.networks) || 'TBA'))}</span></a>`).join('') || '<div class="muted mono" style="font-size:11px">No primetime games left this week.</div>'}</div>`;

  // ---- Closest games: live, inside one score
  const closest = liveGames.map(g => ({ g, m: Math.abs((g.home.score || 0) - (g.away.score || 0)) })).filter(x => x.m <= 8).sort((a, b) => a.m - b.m).slice(0, 4);
  const closeTile = `<div class="dt close pad" data-href="#/scores"><div class="k">CLOSEST GAMES<span class="svc"> · LIVE</span><span class="more">SCORES</span></div>${closest.map(({ g, m }) => `<a class="ug" href="#/game/${g.id}"><span class="tm"><img src="${esc(g.away.logo)}" alt=""><em>${esc(g.away.name)}</em><b>${g.away.score}</b></span><span class="tm"><img src="${esc(g.home.logo)}" alt=""><em>${esc(g.home.name)}</em><b>${g.home.score}</b></span><span class="li">● ${esc(g.detail)}${m === 0 ? ' · TIED' : ''}</span></a>`).join('') || `<div class="muted mono" style="font-size:11px">${liveGames.length ? 'No nail-biters yet.' : 'Nothing live right now.'}</div>`}</div>`;

  // ---- Countdown
  const cdTile = `<div class="dt countdown pad" data-href="${next ? `#/game/${next.id}` : `#/team/${team.id}`}" data-kick="${next && !next.tbd ? next.date.getTime() : ''}" data-state="${game?.state || 'pre'}"><div class="k">${live ? 'LIVE NOW' : final ? 'FINAL' : 'KICKOFF IN'}<span class="svc"> · ${opp ? (next.home || next.neutral ? 'VS ' : 'AT ') + esc(opp.name.toUpperCase()) : ''}</span><span class="more">GAME</span></div>
    <div class="cd">${live ? `<span class="big live">${esc(game.detail)}</span>` : final ? `<span class="big">${myScore}–${oppScore}</span>` : next && !next.tbd ? '<span class="n" data-u="d">0</span><small>D</small><span class="n" data-u="h">0</span><small>H</small><span class="n" data-u="m">0</span><small>M</small><span class="n" data-u="s">0</span><small>S</small>' : '<span class="big nr">TBA</span>'}</div>
    <div class="sub2">${next ? esc(fmtDay(next.date).toUpperCase()) + (next.tbd ? '' : ' · ' + fmtTime(next.date) + ' ' + tzLabel()) : 'SEASON COMPLETE'}</div></div>`;


  // ---- Live scoreboard: every game in progress, mine first then closest.
  const lgGames = [...liveGames].sort((a, b) => ((mine.has(a.home.id) || mine.has(a.away.id)) ? 0 : 1) - ((mine.has(b.home.id) || mine.has(b.away.id)) ? 0 : 1) || Math.abs((a.home.score || 0) - (a.away.score || 0)) - Math.abs((b.home.score || 0) - (b.away.score || 0)));
  const lgCard = g => { const m = Math.abs((g.home.score || 0) - (g.away.score || 0)); const close = m <= 8; const d = g.detail || ''; const mm = /^(\d{1,2}:\d{2})\s*[-–·]\s*(.+)$/.exec(d); const clk = mm ? mm[1] : (/half/i.test(d) ? 'HALF' : /end/i.test(d) ? d.toUpperCase().replace('END OF', 'END') : d.toUpperCase()); const q = mm ? mm[2].toUpperCase() : ''; const posId = g.situation?.possession ? String(g.situation.possession) : null; const tm = t => `<div class="tm"><img src="${esc(t.logo)}" alt="">${t.rank ? `<small>#${t.rank}</small>` : ''}<em>${esc(t.name)}</em>${posId === String(t.id) ? '<span class="poss"></span>' : ''}</div>`; return `<a class="lgc${close ? ' close' : ''}" href="#/game/${g.id}">${tm(g.away)}<div class="sc${(g.away.score || 0) < (g.home.score || 0) ? ' trail' : ''}">${g.away.score ?? 0}</div>${tm(g.home)}<div class="sc${(g.home.score || 0) < (g.away.score || 0) ? ' trail' : ''}">${g.home.score ?? 0}</div><div class="clk"><span class="t">${esc(clk)}</span>${q ? `<span class="q">${esc(q)}</span>` : ''}<span class="net">${esc(displayNetwork(primaryNetwork(g.networks) || ''))}</span></div></a>`; };
  const lgSize = layout.find(t => t.id === 'livegrid')?.size || 'f'; const lgCols = isMobile() ? 1 : ({ s: 1, m: 2, l: 3, f: 4 })[lgSize]; const lgRows = Math.max(1, Math.ceil(lgGames.length / lgCols));
  const livegridTile = !lgGames.length && !document.body.classList.contains('dash-edit') ? '' : `<div class="dt livegrid pad" style="grid-row:span ${isMobile() ? 1 : Math.ceil((60 + lgRows * 172) / 108)}"><div class="k">LIVE SCOREBOARD · ${lgGames.length} GAME${lgGames.length === 1 ? '' : 'S'} ON<span class="svc"> · RED GLOW = ONE-SCORE GAME</span><a class="more" href="#/scores">ALL SCORES</a></div><div class="lg2">${lgGames.map(lgCard).join('') || '<div class="muted mono" style="font-size:11px">Nothing live right now — this tile fills up at kickoff.</div>'}</div></div>`;

  const built = { rank: rankTile, stride: strideTile, tv: tvTile, stand: standTile, cfp: cfpTile, mov: movTile, next3: next3Tile, form: formTile, line: lineTile, leaders: leadersTile, upset: upsetTile, close: closeTile, countdown: cdTile, livegrid: livegridTile };
  const tiles = layout.map(t => built[t.id] ? built[t.id].replace('class="dt ', `data-tile="${t.id}" class="dt sz-${t.size || 's'} `) : '').join('');

  const html = `<div class="dashboard">${focus}${hero}<div class="dt lrail"><div class="k pad-h">LIVE NOW · MY TEAMS &amp; PRIMETIME<a class="more" href="#/scores">ALL SCORES</a></div><div class="lg">${rail}</div></div>${tiles}<div class="dash-foot mono"><span>Something you wish this did?</span><a href="mailto:michael.stine@gmail.com?subject=NFL%2F26%20feature%20request">Request a feature →</a><span class="sep">·</span><a href="mailto:michael.stine@gmail.com?subject=NFL%2F26%20feedback">Send feedback</a></div></div>`;
  return { html, mount: mountDash };
}

function short(e) { return (e.home ? '' : '@') + (e.opp.abbr || e.opp.name).slice(0, 5).toUpperCase(); }
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// Motion: tiles fade up in sequence, score digits tick, bars grow. Plus the live bits: countdown, leaders, customizer.
let cdTimer = null;
function mountDash(root) {
  root.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('a, button')) return; location.hash = el.dataset.href; }));
  clearInterval(cdTimer);
  const cd = root.querySelector('.countdown[data-kick]');
  if (cd && cd.dataset.kick) {
    const at = Number(cd.dataset.kick);
    const tick = () => { if (!document.contains(cd)) { clearInterval(cdTimer); return; } let s = Math.max(0, Math.floor((at - Date.now()) / 1000)); const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60; const v = { d, h, m, s }; cd.querySelectorAll('[data-u]').forEach(el => { el.textContent = String(v[el.dataset.u]).padStart(el.dataset.u === 'd' ? 1 : 2, '0'); }); };
    tick(); cdTimer = setInterval(tick, 1000);
  }
  const ld = root.querySelector('.leaders[data-leaders]');
  if (ld && ld.dataset.leaders) loadLeaders(ld);
  root.querySelector('#dash-customize')?.addEventListener('click', () => openCustomizer(root));
  if (document.body.classList.contains('dash-edit')) armBoard(root);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('.dt').forEach((el, i) => { if (reduce) { el.classList.add('in'); return; } setTimeout(() => el.classList.add('in'), 40 + i * 60); });
  root.querySelectorAll('.bars .b').forEach((b, i) => { const h = b.style.height; if (!h || reduce) return; b.style.height = '4%'; setTimeout(() => { b.style.height = h; }, 200 + i * 40); });
  root.querySelectorAll('.wpr .bar i').forEach(i => { const w = i.style.width; if (reduce) return; i.style.width = '50%'; requestAnimationFrame(() => setTimeout(() => { i.style.width = w; }, 250)); });
  if (!reduce) root.querySelectorAll('.sc [data-n]').forEach(el => { const to = Number(el.dataset.n); if (!Number.isFinite(to)) return; const start = performance.now(); (function t(now) { const p = Math.min(1, (now - start) / 900); el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * to); if (p < 1) requestAnimationFrame(t); })(start); });
}

async function loadLeaders(el) {
  const box = el.querySelector('.ld'); const teamId = el.dataset.team;
  try {
    const sum = await api.summary(el.dataset.leaders);
    const mine = (sum?.leaders || []).find(l => String(l.team?.id) === String(teamId)) || (sum?.leaders || [])[0];
    const cats = ['passingYards', 'rushingYards', 'receivingYards'].map(k => { const c = (mine?.leaders || []).find(x => x.name === k); const t = c?.leaders?.[0]; return t ? { label: k.replace('Yards', '').toUpperCase(), name: t.athlete?.shortName || t.athlete?.displayName || '', line: t.displayValue || '', head: t.athlete?.headshot?.href } : null; }).filter(Boolean);
    box.className = 'ld';
    box.innerHTML = cats.map(c => `<div class="lr">${c.head ? `<img src="${esc(c.head)}" alt="">` : '<span class="ph"></span>'}<div><div class="nm">${esc(c.name)}</div><div class="st">${esc(c.label)} · ${esc(c.line)}</div></div></div>`).join('') || '<div class="muted mono" style="font-size:11px">No leaders posted.</div>';
  } catch { box.textContent = 'Leaders unavailable.'; }
}

// ---- Customizer: pick tiles, size them, reorder. Saved to prefs (synced with the account).
function openCustomizer(root) {
  let layout = currentLayout().map(t => ({ ...t }));
  if (document.getElementById('cust-wrap')) return;
  const wrap = document.createElement('div'); wrap.className = 'cust-wrap'; wrap.id = 'cust-wrap';
  document.body.classList.add('dash-edit'); armBoard(root);
  const render = () => {
    const on = new Map(layout.map((t, i) => [t.id, i]));
    const row = c => { const i = on.get(c.id); const t = i != null ? layout[i] : null; return `<div class="cust-row${t ? ' on' : ''}" data-id="${c.id}" draggable="${t ? 'true' : 'false'}">
        <button type="button" class="tog" data-act="toggle" aria-label="Toggle">${t ? '✓' : '+'}</button>
        <div class="txt"><div class="nm">${esc(c.name)}</div><div class="bl">${esc(c.blurb)}</div></div>
        ${t ? `<div class="szs">${SIZES.map(z => `<button type="button" class="sz${t.size === z ? ' on' : ''}" data-act="size" data-size="${z}">${z.toUpperCase()}</button>`).join('')}</div><div class="mv"><button type="button" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-act="down" ${i === layout.length - 1 ? 'disabled' : ''}>↓</button></div>` : ''}
      </div>`; };
    const ordered = [...layout.map(t => TILE_CATALOG.find(c => c.id === t.id)).filter(Boolean), ...TILE_CATALOG.filter(c => !on.has(c.id))];
    wrap.innerHTML = `<div class="cust-back"></div><div class="cust-panel">
      <div class="cust-head"><div><div class="disp h3">Customize</div><div class="sub">TAP + TO ADD · DRAG A TILE BY ITS HANDLE TO MOVE IT · DRAG THE CORNER TO RESIZE</div></div><button type="button" class="btn btn-amber" data-act="done">Done</button></div>
      <div class="cust-list">${ordered.map(row).join('')}</div>
      <div class="cust-foot"><button type="button" class="btn" data-act="reset">Reset to default</button><span class="sub">YOUR GAME AND THE LIVE RAIL ALWAYS STAY ON TOP</span></div>
    </div>`;
  };
  const save = () => { state.setDash(layout); };
  refreshPanel = () => { layout = currentLayout().map(t => ({ ...t })); render(); };
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b && !e.target.closest('.cust-back')) return;
    const act = b?.dataset.act || 'done';
    const rowEl = e.target.closest('.cust-row'); const id = rowEl?.dataset.id; const i = layout.findIndex(t => t.id === id);
    if (act === 'toggle') { if (i >= 0) layout.splice(i, 1); else layout.push({ id, size: 's' }); }
    else if (act === 'size') layout[i].size = b.dataset.size;
    else if (act === 'up' && i > 0) [layout[i - 1], layout[i]] = [layout[i], layout[i - 1]];
    else if (act === 'down' && i < layout.length - 1) [layout[i + 1], layout[i]] = [layout[i], layout[i + 1]];
    else if (act === 'reset') layout = DEFAULT_LAYOUT.map(t => ({ ...t }));
    else if (act === 'done') { wrap.remove(); document.body.classList.remove('dash-edit'); save(); return; }
    render(); save();
  });
  // Drag to reorder (desktop)
  let dragId = null;
  wrap.addEventListener('dragstart', e => { const r = e.target.closest('.cust-row.on'); if (!r) return; dragId = r.dataset.id; e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
  wrap.addEventListener('dragover', e => { const r = e.target.closest('.cust-row.on'); if (!r || !dragId || r.dataset.id === dragId) return; e.preventDefault(); });
  wrap.addEventListener('drop', e => { const r = e.target.closest('.cust-row.on'); if (!r || !dragId) return; e.preventDefault(); const from = layout.findIndex(t => t.id === dragId), to = layout.findIndex(t => t.id === r.dataset.id); if (from < 0 || to < 0) return; const [it] = layout.splice(from, 1); layout.splice(to, 0, it); dragId = null; render(); save(); });
  wrap.addEventListener('dragend', () => { dragId = null; wrap.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging')); });
  render();
  document.body.appendChild(wrap);
}

// ---- On-board editing: drag the handle to swap tiles, drag the corner grip to resize (snaps S/M/L/F).
const SIZE_COLS = { s: 3, m: 6, l: 9, f: 12 };
function armBoard(root) {
  const board = root.querySelector('.dashboard'); if (!board || board.dataset.armed) return;
  board.dataset.armed = '1';
  board.querySelectorAll('.dt[data-tile]').forEach(t => { if (!t.querySelector('.grab')) t.insertAdjacentHTML('beforeend', '<span class="grab" title="Drag to move">⋮⋮</span><span class="grip" title="Drag to resize"></span>'); });
  const layoutNow = () => currentLayout().map(t => ({ ...t }));

  // Move
  board.addEventListener('pointerdown', e => {
    const h = e.target.closest('.grab'); if (!h) return;
    const tile = h.closest('.dt[data-tile]'); e.preventDefault();
    const start = () => {
      tile.classList.add('lifting'); tile.setPointerCapture?.(e.pointerId);
      const r = tile.getBoundingClientRect(); const ox = e.clientX - r.left, oy = e.clientY - r.top;
      let target = null;
      const move = ev => {
        tile.style.transform = `translate(${ev.clientX - r.left - ox}px, ${ev.clientY - r.top - oy}px)`;
        tile.style.pointerEvents = 'none';
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.dt[data-tile]');
        tile.style.pointerEvents = '';
        if (under !== target) { target?.classList.remove('drop'); target = under && under !== tile ? under : null; target?.classList.add('drop'); }
      };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        tile.classList.remove('lifting'); tile.style.transform = '';
        if (target) {
          target.classList.remove('drop');
          const l = layoutNow(); const a = l.findIndex(t => t.id === tile.dataset.tile), b = l.findIndex(t => t.id === target.dataset.tile);
          if (a >= 0 && b >= 0) { const [it] = l.splice(a, 1); l.splice(b, 0, it); state.setDash(l); refreshPanel(); }
        }
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    };
    if (e.pointerType === 'touch') { let t = setTimeout(start, 250); const cancel = () => { clearTimeout(t); window.removeEventListener('pointerup', cancel); window.removeEventListener('pointermove', cancel); }; window.addEventListener('pointerup', cancel, { once: true }); window.addEventListener('pointermove', cancel, { once: true }); }
    else start();
  });

  // Resize
  board.addEventListener('pointerdown', e => {
    const g = e.target.closest('.grip'); if (!g) return;
    const tile = g.closest('.dt[data-tile]'); e.preventDefault(); e.stopPropagation();
    const colW = board.getBoundingClientRect().width / 12; const left = tile.getBoundingClientRect().left;
    const sizes = ['s', 'm', 'l', 'f']; let size = sizes.find(z => tile.classList.contains('sz-' + z)) || 's';
    tile.classList.add('resizing');
    const move = ev => {
      const want = Math.max(1, Math.round((ev.clientX - left) / colW));
      const next = want <= 4 ? 's' : want <= 7 ? 'm' : want <= 10 ? 'l' : 'f';
      if (next !== size) { tile.classList.remove('sz-' + size); tile.classList.add('sz-' + next); size = next; }
      tile.querySelector('.grip').dataset.label = size.toUpperCase();
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      tile.classList.remove('resizing');
      const l = layoutNow(); const t = l.find(x => x.id === tile.dataset.tile); if (t && t.size !== size) { t.size = size; state.setDash(l); refreshPanel(); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}
let refreshPanel = () => {};
