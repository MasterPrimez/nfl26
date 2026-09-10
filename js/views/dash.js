// Dashboard home: one screen, every tile live and tappable. Uses the same data loader as the story home (loadHome).
import { esc, isMobile, isPrimetime } from '../ui.js';
import { logoUrl } from '../api.js';
import { state, fmtTime, fmtDay, dayKey, tzLabel } from '../state.js';
import { SERVICES, primaryNetwork, watchOptions, watchSummary, displayNetwork } from '../networks.js';

const GREEN = '#4fc98a', RED = '#ff5a4a';

export function renderDash(ctx, d) {
  const teams = state.prefs.teams;
  const dir = ctx.directory;
  if (!teams.length || !d) {
    return { html: `<div class="dashboard"><div class="dt hero empty" style="grid-column:1/-1"><div class="k">WELCOME</div><div class="disp big">Pick your team.</div><div class="lede">Choose the teams you follow and this screen becomes their dashboard: the game right now, the odds, TV, division standings and the playoff picture.</div><div><button class="btn primary" id="add-team-2" type="button">Choose my teams</button></div></div></div>`, mount: null };
  }
  const { team, opp, next, game, past, prob, apRank, cfpSeed, cfpOfficial, confPlace, rankHist, events } = d;
  const mine = new Set(teams);
  const focus = teams.length > 1 ? `<div class="dash-focus">${teams.map(id => { const t = dir?.teams.find(x => x.id === id); return `<button type="button" class="df${id === team.id ? ' on' : ''}" data-focus="${id}"><img src="${esc(t?.logo || logoUrl(id))}" alt=""><span>${esc(t?.name || 'Team')}</span></button>`; }).join('')}</div>` : '';

  // ---- Hero
  const live = game?.state === 'in', final = game?.state === 'post';
  let hero;
  if (next && opp) {
    const g = game;
    const myScore = g ? (next.home ? g.home.score : g.away.score) : null, oppScore = g ? (next.home ? g.away.score : g.home.score) : null;
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
  const tvGames = ctx.games.filter(g => dayKey(g.date) === tvDay && g.state !== 'post' && !g.tbd).sort((a, b) => pri(a) - pri(b)).slice(0, isMobile() ? 3 : 5);
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

  const html = `<div class="dashboard">${focus}${hero}<div class="dt lrail"><div class="k pad-h">LIVE NOW · MY TEAMS &amp; PRIMETIME<a class="more" href="#/scores">ALL SCORES</a></div><div class="lg">${rail}</div></div>${rankTile}${strideTile}${tvTile}${standTile}${cfpTile}${movTile}<div class="dash-foot mono"><span>Something you wish this did?</span><a href="mailto:michael.stine@gmail.com?subject=NFL%2F26%20feature%20request">Request a feature →</a><span class="sep">·</span><a href="mailto:michael.stine@gmail.com?subject=NFL%2F26%20feedback">Send feedback</a></div></div>`;
  return { html, mount: mountDash };
}

function short(e) { return (e.home ? '' : '@') + (e.opp.abbr || e.opp.name).slice(0, 5).toUpperCase(); }
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// Motion: tiles fade up in sequence, score digits tick, bars grow.
function mountDash(root) {
  root.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('a')) return; location.hash = el.dataset.href; }));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('.dt').forEach((el, i) => { if (reduce) { el.classList.add('in'); return; } setTimeout(() => el.classList.add('in'), 40 + i * 60); });
  root.querySelectorAll('.bars .b').forEach((b, i) => { const h = b.style.height; if (!h || reduce) return; b.style.height = '4%'; setTimeout(() => { b.style.height = h; }, 200 + i * 40); });
  root.querySelectorAll('.wpr .bar i').forEach(i => { const w = i.style.width; if (reduce) return; i.style.width = '50%'; requestAnimationFrame(() => setTimeout(() => { i.style.width = w; }, 250)); });
  if (!reduce) root.querySelectorAll('.sc [data-n]').forEach(el => { const to = Number(el.dataset.n); if (!Number.isFinite(to)) return; const start = performance.now(); (function t(now) { const p = Math.min(1, (now - start) / 900); el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * to); if (p < 1) requestAnimationFrame(t); })(start); });
}
