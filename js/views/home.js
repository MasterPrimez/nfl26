// Story home: one favorite team, one idea per screen, scroll to reveal. Everything is live from ESPN
// except the pre-game win probability, which we compute (Vegas line when there is one, else season stats).
import { esc } from '../ui.js';
import { api, normalizeEvent, logoUrl, pickLogo } from '../api.js';
import { state, fmtTime, fmtDay, tzLabel, dayKey } from '../state.js';
import { primaryNetwork, watchSummary } from '../networks.js';

const SIGMA = 13.5; // std dev of NFL margin vs spread
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }

const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---- Data ------------------------------------------------------------------

export async function loadHome(ctx, teamId) {
  ctx.home = ctx.home || {};
  const cached = ctx.home[teamId];
  if (cached && Date.now() - cached.t < 30_000) return cached;
  const [td, sched] = await Promise.all([api.team(teamId).then(r => r.team), api.schedule(teamId)]);
  const dir = ctx.directory?.teams.find(t => t.id === String(teamId));
  const conf = dir?.conf;
  const rec = td.record?.items?.find(i => i.type === 'total') || td.record?.items?.[0];
  const stat = n => Number(rec?.stats?.find(s => s.name === n)?.value ?? 0);
  const gp = stat('gamesPlayed');
  const team = { id: String(teamId), name: td.shortDisplayName || td.location, fullName: td.displayName, abbr: td.abbreviation, logo: pickLogo(td), color: '#' + (td.color || '333333'), alt: '#' + (td.alternateColor || 'ffffff'), record: rec?.summary || dir?.overall || '0-0', wins: stat('wins'), losses: stat('losses'), gp, pf: gp ? stat('pointsFor') / gp : 0, pa: gp ? stat('pointsAgainst') / gp : 0, diff: stat('pointDifferential'), conf, standing: td.standingSummary || '' };

  const events = (sched.events || []).map(e => normSched(e, teamId)).sort((a, b) => a.date - b.date);
  const past = events.filter(e => e.state === 'post' && e.score != null);
  const next = events.find(e => e.state !== 'post');

  // Next game: enrich from the scoreboard for that week (odds, live situation, broadcasts).
  let game = null, opp = null;
  if (next) {
    let g = ctx.allGames.get(next.id);
    if (!g) { try { const sb = await api.scoreboard(next.week, { seasontype: 2 }); (sb.events || []).forEach(e => { const n = normalizeEvent(e); ctx.allGames.set(n.id, n); }); g = ctx.allGames.get(next.id); } catch {} }
    game = g || null;
    const oppId = next.opp.id;
    try { const od = await api.team(oppId).then(r => r.team); const orec = od.record?.items?.find(i => i.type === 'total') || od.record?.items?.[0]; const os = n => Number(orec?.stats?.find(s => s.name === n)?.value ?? 0); const ogp = os('gamesPlayed');
      opp = { id: String(oppId), name: od.shortDisplayName || od.location, fullName: od.displayName, abbr: od.abbreviation, logo: pickLogo(od), color: '#' + (od.color || '333333'), alt: '#' + (od.alternateColor || 'ffffff'), record: orec?.summary || '0-0', gp: ogp, pf: ogp ? os('pointsFor') / ogp : 0, pa: ogp ? os('pointsAgainst') / ogp : 0, diff: os('pointDifferential'), rank: next.opp.rank };
    } catch { opp = { id: String(oppId), name: next.opp.name, abbr: '', logo: next.opp.logo, color: '#333', alt: '#fff', record: '', gp: 0, pf: 0, pa: 0, diff: 0, rank: next.opp.rank }; }
  }

  const apRank = null;
  const seedT = ctx.playoff?.field.find(t => t.id === String(teamId));
  const confTeams = conf ? ctx.directory.teams.filter(t => t.conf.id === conf.id).sort((a, b) => (b.winPct - a.winPct) || (b.wins - a.wins) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)) : [];
  const confRank = conf ? ctx.directory.teams.filter(t => t.conference.id === conf.conference.id).sort((a, b) => (b.winPct - a.winPct) || (b.wins - a.wins) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)).findIndex(t => t.id === String(teamId)) + 1 : 0;
  const confPlace = confTeams.findIndex(t => t.id === String(teamId)) + 1;

  const prob = winProb(team, opp, game, next);
  const rankHist = [];
  // Stadium photos for the hero: my home field + the opponent's home field (ESPN venue images).
  const [myVenue, oppVenue] = await Promise.all([venuePhoto(teamId, events), opp ? venuePhoto(opp.id) : null]);
  const out = { t: Date.now(), team, opp, next, game, past, prob, photos: { mine: myVenue, opp: oppVenue }, apRank: null, cfpSeed: seedT?.seed || null, cfpOfficial: !!ctx.playoff?.official, confPlace, confRank, confTeams, rankHist, remaining: events.filter(e => e.state !== 'post').length };
  ctx.home[teamId] = out;
  return out;
}

// A team's home-stadium photo: first non-neutral home game on its schedule → game summary → venue images.
// Cached per team in localStorage (stadiums don't change mid-season).
const VENUE_KEY = 'nfl26.venuephoto.v1';
async function venuePhoto(teamId, events) {
  let cache = {}; try { cache = JSON.parse(localStorage.getItem(VENUE_KEY) || '{}'); } catch {}
  if (cache[teamId] !== undefined) return cache[teamId];
  let url = null;
  try {
    const td = await api.team(teamId).then(r => r.team);
    const imgs = td?.franchise?.venue?.images || [];
    const pick = imgs.find(i => (i.rel || []).includes('interior')) || imgs[0];
    if (pick?.href) { cache[teamId] = pick.href; try { localStorage.setItem(VENUE_KEY, JSON.stringify(cache)); } catch {} return pick.href; }
    let evs = events;
    if (!evs) { const sched = await api.schedule(teamId); evs = (sched.events || []).map(e => normSched(e, teamId)); }
    const home = evs.find(e => e.home && !e.neutral) || evs[0];
    if (home) {
      const sum = await api.summary(home.id);
      const imgs = sum?.gameInfo?.venue?.images || [];
      const pick = imgs.find(i => (i.rel || []).includes('interior')) || imgs[0];
      url = pick?.href || null;
    }
  } catch {}
  cache[teamId] = url; try { localStorage.setItem(VENUE_KEY, JSON.stringify(cache)); } catch {}
  return url;
}

function normSched(e, teamId) {
  const c = e.competitions[0];
  const me = c.competitors.find(x => String(x.team.id) === String(teamId)) || c.competitors[0];
  const opp = c.competitors.find(x => x !== me) || c.competitors[1];
  const st = c.status?.type || e.status?.type || {};
  const sc = x => x.score == null ? null : (x.score.value != null ? x.score.value : Number(x.score));
  const rk = x => x.curatedRank && x.curatedRank.current && x.curatedRank.current <= 25 ? x.curatedRank.current : null;
  return { id: e.id, date: new Date(e.date), week: e.week?.number, state: st.state, detail: st.shortDetail || st.detail || '', tbd: e.timeValid === false || /TBD|TBA/i.test(st.detail || ''), home: me.homeAway === 'home', neutral: !!c.neutralSite,
    opp: { id: String(opp.team.id), name: opp.team.shortDisplayName || opp.team.location || opp.team.displayName, abbr: opp.team.abbreviation, logo: pickLogo(opp.team), rank: rk(opp) },
    won: !!me.winner, score: sc(me), oppScore: sc(opp), venue: c.venue?.fullName?.replace(/\s*\(.*\)$/, '') || '', city: c.venue?.address?.city || '', network: (c.broadcasts || []).map(b => b.media?.shortName || (b.names && b.names[0])).filter(Boolean)[0] || '' };
}

// Win probability for `team` in `next`. Live: ESPN's number. Pre-game: Vegas spread → Φ(margin/σ); else stats model.
function winProb(team, opp, game, next) {
  if (!next || !opp) return null;
  if (game && game.state === 'in' && game.situation?.homeWin != null) { const h = game.situation.homeWin; return { p: Math.round((next.home ? h : 1 - h) * 100), src: 'live', detail: 'ESPN live win probability' }; }
  if (game && game.state === 'post') return null;
  if (game?.odds?.spread != null && game.odds.details) {
    // details like "OSU -6.5": spread applies to the favorite named. spread field is the home-team spread.
    const homeSpread = game.odds.spread; const mySpread = next.home ? homeSpread : -homeSpread; // negative = favored
    const p = normCdf(-mySpread / SIGMA);
    return { p: Math.round(p * 100), src: 'vegas', detail: `Vegas has it ${game.odds.details}${game.odds.overUnder ? ', over/under ' + game.odds.overUnder : ''}` };
  }
  // Stats model: net points per game, home field ≈ 2.5, shrunk toward even when few games have been played.
  const n = Math.min(team.gp, opp.gp);
  if (!n) return { p: next.home ? 56 : 44, src: 'model', detail: 'No games yet — home field only' };
  const margin = (team.pf - team.pa) - (opp.pf - opp.pa) + (next.neutral ? 0 : (next.home ? 2.5 : -2.5));
  const shrink = n / (n + 3);
  return { p: Math.round(normCdf((margin * shrink) / SIGMA) * 100), src: 'model', detail: 'Our model: season point margins plus home field. No betting line yet.' };
}

// Ranking history accumulates in this browser as the season goes (ESPN has no history endpoint).
function rankHistory(ctx, teamId, apRank) {
  const KEY = 'nfl26.rankhist.v1';
  let h = {}; try { h = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const occ = ctx.rankings?.ap?.occurrence; const wk = occ ? `${occ.number}` : null;
  if (wk) {
    // Record the whole poll each time we see a new week, so every favorite team has a history.
    if (!h[wk]) { h[wk] = {}; ctx.rankings.ap.ranks.forEach(r => { h[wk][String(r.team.id)] = r.current; if (r.previous && !h[String(Number(wk) - 1)]) { h[String(Number(wk) - 1)] = h[String(Number(wk) - 1)] || {}; h[String(Number(wk) - 1)][String(r.team.id)] = r.previous; } }); try { localStorage.setItem(KEY, JSON.stringify(h)); } catch {} }
  }
  const weeks = Object.keys(h).map(Number).sort((a, b) => a - b);
  return weeks.map(w => ({ week: w, rank: h[String(w)][String(teamId)] ?? null }));
}

// ---- Render ----------------------------------------------------------------

export function renderHome(ctx, d, opts = {}) {
  const teams = state.prefs.teams;
  const dir = ctx.directory;
  const chips = teams.map(id => { const t = dir?.teams.find(x => x.id === id); return `<button class="chip${id === d?.team.id ? ' on' : ''}" data-focus="${id}"><img src="${esc(t?.logo || logoUrl(id))}" alt=""><span>${esc(t?.name || 'Team')}</span></button>`; }).join('');
  const chipbar = `<div class="story-chips">${chips}<button class="chip add" id="add-team">${teams.length ? '+' : '+ PICK YOUR TEAMS'}</button></div>`;

  if (!teams.length || !d) {
    return { html: `<div class="story">${chipbar}<section class="story-hero" style="min-height:70vh"><div class="label rv">Welcome</div><div class="disp big rv d1">Pick your team.</div><div class="lede rv d2">Choose the teams you follow and this page becomes their story: the next game, the odds, the season so far, and where they stand.</div><div class="cta rv d3"><button class="btn primary" id="add-team-2">Choose teams</button><a class="btn" href="#/scores">Browse all scores</a></div></section></div>`, mount: mountStory };
  }

  const { team, opp, next, game, past, prob, apRank, cfpSeed, cfpOfficial, confPlace, confRank, rankHist, remaining } = d;
  const live = game?.state === 'in';
  const final = game?.state === 'post';
  const net = game ? primaryNetwork(game.networks) : (next?.network || '');
  const watch = game ? watchSummary(game.networks, state.myServices) : '';

  // 1 — Hero
  let hero;
  if (next && opp) {
    const when = next.tbd ? fmtDay(next.date) + ' · time TBA' : `${fmtDay(next.date)} · ${fmtTime(next.date)} ${tzLabel()}`;
    const eyebrow = live ? `Live now · ${esc(game.detail)}` : final ? 'Final' : `Next up · ${esc(when)}`;
    const scoreLine = (live || final) && game ? `<div class="disp story-score">${next.home ? game.home.score : game.away.score}<span class="dash">–</span>${next.home ? game.away.score : game.home.score}</div>` : '';
    const ph = d.photos || {};
    const bg = (ph.mine || ph.opp) ? `<div class="hero-bg" aria-hidden="true">${ph.mine ? `<div class="ph l" style="background-image:url('${esc(ph.mine)}')"></div>` : ''}${ph.opp ? `<div class="ph r" style="background-image:url('${esc(ph.opp)}')"></div>` : ''}<div class="tint" style="--cl:${esc(team.color)};--cr:${esc(opp.color)}"></div><div class="grain"></div></div>` : '';
    hero = `<div class="story-hero-wrap" id="herowrap"><section class="story-hero${bg ? ' has-bg' : ''}" id="hero">${bg}
      <div class="label h-eyebrow" style="opacity:0">${eyebrow}</div>
      <div class="story-logos">
        <div class="l" style="--lx:-1"><div class="story-logo"><img src="${esc(team.logo)}" alt=""></div><div class="mono muted sub">${apRank ? '#' + apRank + ' · ' : ''}${esc(team.record)}</div></div>
        <div class="vs disp">${next.home || next.neutral ? 'VS' : '@'}</div>
        <div class="l" style="--lx:1"><div class="story-logo"><img src="${esc(opp.logo)}" alt=""></div><div class="mono muted sub">${opp.rank ? '#' + opp.rank + ' · ' : ''}${esc(opp.record)}</div></div>
      </div>
      <div class="disp big h-title">${esc(team.name)} <span class="dim">${next.home || next.neutral ? 'vs' : 'at'}</span> ${esc(opp.name)}</div>
      ${scoreLine}
      <div class="mono h-meta">${[net, next.venue + (next.city ? ', ' + next.city.toUpperCase() : '')].filter(Boolean).join(' · ').toUpperCase()}</div>
      <div class="cta"><a class="btn primary" href="#/game/${next.id}">${final ? 'Box score' : live ? 'Follow live' : 'How to watch'}</a><a class="btn" href="#/team/${team.id}">Schedule &amp; stats</a></div>
      <div class="mono cue">SCROLL ↓</div>
    </section></div>`;
  } else {
    hero = `<div class="story-hero-wrap" id="herowrap" style="height:auto"><section class="story-hero" id="hero"><div class="story-logo rv" style="width:140px;height:140px"><img src="${esc(team.logo)}" alt=""></div><div class="disp big rv d1" style="margin-top:20px">${esc(team.name)}</div><div class="lede rv d2">Season complete. ${esc(team.record)}.</div></section></div>`;
  }

  // 2 — Probability
  const probSec = prob && opp ? `<section class="story-sec" id="prob">
      <div class="label rv">${prob.src === 'live' ? 'Right now' : 'Our model says'}</div>
      <div class="disp pct rv d1"><span id="pct" data-to="${prob.p}">0</span><small>%</small></div>
      <div class="bar rv d2"><i id="pbar" data-w="${prob.p}"></i><b></b></div>
      <div class="mono barlab rv d2"><span>${esc(team.name.toUpperCase())} ${prob.p}%</span><span>${esc(opp.name.toUpperCase())} ${100 - prob.p}%</span></div>
      <div class="lede rv d3">Chance ${esc(team.name)} ${live ? 'wins from here' : 'wins'}. ${esc(prob.detail)}.</div>
    </section>` : '';

  // 3 — Matchup
  const cmp = (label, a, b, mx, lowerBetter = false) => { const pa = Math.round(Math.min(1, a / mx) * 100), pb = Math.round(Math.min(1, b / mx) * 100); return `<div class="disp n l">${a.toFixed(1)}</div><div><div class="label muted">${label}</div><div class="tr"><div class="a"><i data-w="${pa}"></i></div><div class="b"><i data-w="${pb}"></i></div></div></div><div class="disp n r">${b.toFixed(1)}</div>`; };
  const matchSec = opp && opp.gp && team.gp ? `<section class="story-sec" id="matchup">
      <div class="label rv">The matchup</div>
      <div class="disp rv d1 h2x">${matchupHeadline(team, opp)}</div>
      <div class="cmp rv d2">${cmp('Points per game', team.pf, opp.pf, 60)}${cmp('Points allowed per game', team.pa, opp.pa, 45, true)}${cmp('Average margin', team.diff / team.gp, opp.diff / opp.gp, 40)}</div>
      <div class="mono rv d3 barlab wide"><span>◀ ${esc(team.name.toUpperCase())}</span><span>${esc(opp.name.toUpperCase())} ▶</span></div>
    </section>` : '';

  // 4 — Season so far
  const avg = team.gp ? team.diff / team.gp : 0;
  const closest = past.length ? past.reduce((a, g) => Math.abs(g.score - g.oppScore) < Math.abs(a.score - a.oppScore) ? g : a) : null;
  let lede = '';
  if (!past.length) lede = 'The season starts here.';
  else if (!team.losses) lede = `Undefeated, winning by an average of ${avg.toFixed(1)} points.${closest ? ` Closest call: ${closest.opp.name}, by ${closest.score - closest.oppScore}.` : ''}`;
  else if (!team.wins) lede = `Still looking for the first win. Average margin ${avg.toFixed(1)}.`;
  else lede = `${team.losses} loss${team.losses > 1 ? 'es' : ''}. Averaging a ${Math.abs(avg).toFixed(1)}-point margin ${avg >= 0 ? 'in their favor' : 'against'}.${closest ? ` Closest game: ${closest.opp.name}, by ${Math.abs(closest.score - closest.oppScore)}.` : ''}`;
  const seasonSec = `<section class="story-sec" id="season">
      <div class="label rv">The season so far</div>
      <div class="disp big rv d1">${esc(team.record.replace('-', '–'))}.</div>
      <div class="lede rv d2">${esc(lede)}</div>
      ${past.length ? `<svg class="chart" viewBox="0 0 900 220">${marginChart(past)}</svg>` : ''}
      ${rankHist.filter(r => r.rank).length >= 2 ? `<svg class="spark" viewBox="0 0 900 80">${rankSpark(rankHist)}</svg>` : (apRank ? `<div class="mono muted rv d3" style="font-size:11px;margin-top:26px;letter-spacing:.1em">AP RANK #${apRank} · THE TREND LINE BUILDS AS THE WEEKS GO BY</div>` : '')}
    </section>`;

  // 5 — Standing
  const standSec = `<section class="story-sec" id="standing">
      <div class="label rv">Where they stand</div>
      <div class="tiles">
        <div class="rv d1"><div class="disp v">${cfpSeed ? cfpSeed : 'Out'}</div><div class="k">Playoff seed${cfpOfficial ? '' : ' · proj'}</div></div>
        <div class="rv d2"><div class="disp v">${confPlace ? ord(confPlace) : '—'}</div><div class="k">${esc(team.conf?.name || 'Division')}</div></div>
        <div class="rv d3"><div class="disp v">${confRank ? ord(confRank) : '—'}</div><div class="k">${esc(team.conf?.conference?.abbr || 'Conference')}</div></div>
        <div class="rv d4"><div class="disp v">${(avg >= 0 ? '+' : '') + avg.toFixed(1)}</div><div class="k">Avg margin</div></div>
      </div>
      <div class="lede rv d4">${remaining} game${remaining === 1 ? '' : 's'} left on the schedule.${team.standing ? ' ' + esc(team.standing) + '.' : ''}</div>
    </section>`;

  // 6 — Other favorites this week
  const others = teams.filter(id => id !== team.id).map(id => {
    const t = dir?.teams.find(x => x.id === id); const g = ctx.games.find(x => x.home.id === id || x.away.id === id);
    if (!g) return `<div class="row rv"><span class="story-logo sm"><img src="${esc(t?.logo || logoUrl(id))}" alt=""></span><div><div class="disp t">${esc(t?.name || 'Team')} <span>· bye week</span></div><div class="mono muted meta">${esc(t?.overall || '')}</div></div></div>`;
    const me = g.home.id === id ? g.home : g.away, them = g.home.id === id ? g.away : g.home;
    const status = g.state === 'in' ? `<span class="live">● LIVE · ${esc(g.detail)}</span> · ${esc(primaryNetwork(g.networks))}` : g.state === 'post' ? `FINAL · ${me.winner ? 'W' : 'L'}` : `${esc(fmtDay(g.date).split(',')[0].toUpperCase())} ${g.tbd ? 'TBA' : fmtTime(g.date)} · ${esc(primaryNetwork(g.networks) || 'TBA')} · ${esc(watchSummary(g.networks, state.myServices).split(' · ')[0])}`;
    const score = g.state === 'pre' ? '—' : `${me.score} <span>${them.score}</span>`;
    return `<a class="row rv" href="#/game/${g.id}"><span class="story-logo sm"><img src="${esc(me.logo)}" alt=""></span><div><div class="disp t">${esc(me.name)} <span>${g.home.id === id ? 'vs' : 'at'} ${esc(them.name)}</span></div><div class="mono meta">${status}</div></div><div class="disp s">${score}</div></a>`;
  }).join('');
  const othersSec = others ? `<section class="story-sec" id="others"><div class="label rv">Your other teams this week</div><div class="rows">${others}</div></section>` : '';

  // 7 — Deeper
  const deeperSec = `<section class="story-sec" id="deeper" style="min-height:80vh">
      <div class="label rv">Dive deeper</div>
      <div class="disp rv d1 h2x">Everything else is one tap away.</div>
      <div class="grid4">
        <a class="tile rv d1" href="#/scores"><div class="disp t">All scores</div><div class="k">EVERY GAME · LIVE</div></a>
        <a class="tile rv d2" href="#/tv"><div class="disp t">TV guide</div><div class="k">WHAT'S ON, BY NETWORK</div></a>
        <a class="tile rv d3" href="#/playoff"><div class="disp t">Standings &amp; playoff</div><div class="k">DIVISIONS · SEEDS · BRACKET</div></a>
        <a class="tile rv d4" href="#/team/${team.id}"><div class="disp t">${esc(team.name)}</div><div class="k">SCHEDULE · STATS · STANDINGS</div></a>
      </div>
      <div class="mono foot">NFL/26 · DATA: ESPN · ${prob?.src === 'vegas' ? 'WIN PROBABILITY FROM THE BETTING LINE' : prob?.src === 'model' ? 'WIN PROBABILITY IS OUR MODEL' : ''}</div>
    </section>`;

  return { html: `<div class="story">${chipbar}${hero}${probSec}${matchSec}${seasonSec}${standSec}${othersSec}${deeperSec}</div>`, mount: root => mountStory(root, opts) };
}

function matchupHeadline(a, b) {
  const ao = a.pf, bo = b.pf, ad = a.pa, bd = b.pa;
  if (ao > bo + 5 && ad < bd - 3) return 'Edge on both sides of the ball.';
  if (ao > bo + 5) return 'Offense meets defense.';
  if (ad < bd - 3) return 'Defense travels.';
  if (Math.abs(ao - bo) < 3 && Math.abs(ad - bd) < 3) return 'Dead even on paper.';
  return 'Strength against strength.';
}

function marginChart(past) {
  const W = 900, H = 220, padL = 30, padR = 16, base = 140, n = past.length, step = (W - padL - padR) / n, bw = Math.min(26, step * 0.5);
  const maxm = Math.max(28, ...past.map(g => Math.abs(g.score - g.oppScore)));
  let s = `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="var(--line)"/><text x="${padL}" y="14" font-family="IBM Plex Mono" font-size="10" fill="var(--muted)" letter-spacing="1.5">MARGIN BY GAME</text>`;
  past.forEach((g, i) => { const m = g.score - g.oppScore; const x = padL + step * i + step / 2 - bw / 2, h = Math.max(2, Math.abs(m) / maxm * 100), y = m >= 0 ? base - h : base + 2;
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${m >= 0 ? 'var(--accent)' : 'var(--muted)'}" style="transition-delay:${i * 70}ms"/>`;
    s += `<text class="v" x="${x + bw / 2}" y="${m >= 0 ? y - 8 : y + h + 14}" text-anchor="middle" font-family="IBM Plex Mono" font-size="11" fill="var(--text)">${m > 0 ? '+' : ''}${m}</text>`;
    s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" fill="var(--muted)">${g.home ? '' : '@'}${esc((g.opp.abbr || g.opp.name).slice(0, 5).toUpperCase())}</text>`; });
  return s;
}

function rankSpark(hist) {
  const pts = hist.filter(r => r.rank); const W = 900, H = 80, padL = 30, padR = 16, top = 22, bot = H - 14, n = pts.length;
  const xs = pts.map((_, i) => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1)));
  const ys = pts.map(r => top + (Math.min(r.rank, 26) - 1) / 25 * (bot - top));
  let s = `<text x="${padL}" y="10" font-family="IBM Plex Mono" font-size="10" fill="var(--muted)" letter-spacing="1.5">AP RANK · WEEK ${pts[0].week} → NOW</text>`;
  s += `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" points="${xs.map((x, i) => x + ',' + ys[i]).join(' ')}"/>`;
  xs.forEach((x, i) => { s += `<circle cx="${x}" cy="${ys[i]}" r="4.5" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>`; if (i === 0 || i === n - 1) s += `<text x="${x + (i ? -14 : 14)}" y="${ys[i] + 4}" text-anchor="middle" font-family="IBM Plex Mono" font-size="11" fill="var(--text)">#${pts[i].rank}</text>`; });
  return s;
}

// ---- Motion ----------------------------------------------------------------

const ease = x => 1 - Math.pow(1 - x, 3);
let heroRaf = null, introRaf = null, io = null;
export function unmountStory() { if (io) io.disconnect(); io = null; window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(introRaf); }
let heroEls = null, intro = 0, introStart = 0;
function onScroll() { cancelAnimationFrame(heroRaf); heroRaf = requestAnimationFrame(heroFrame); }
function heroFrame() {
  if (!heroEls || !document.contains(heroEls.wrap)) return;
  const { wrap, hero } = heroEls;
  const total = Math.max(1, wrap.offsetHeight - window.innerHeight);
  const p = Math.min(1, Math.max(0, -wrap.getBoundingClientRect().top / total));
  const a = Math.max(ease(Math.min(1, intro / 0.6)), ease(Math.min(1, p / 0.3)));
  const b = Math.max(Math.min(1, Math.max(0, (intro - 0.45) / 0.55)), Math.min(1, Math.max(0, (p - 0.2) / 0.3)));
  const c = Math.min(1, Math.max(0, (p - 0.45) / 0.55));
  hero.querySelectorAll('.story-logos .l').forEach(el => { const dir = Number(el.style.getPropertyValue('--lx')) || -1; el.style.transform = `translateX(${(1 - a) * dir * 40}vw)`; el.style.opacity = a; });
  const vs = hero.querySelector('.vs'); if (vs) vs.style.opacity = a;
  const ey = hero.querySelector('.h-eyebrow'); if (ey) ey.style.opacity = a;
  [hero.querySelector('.h-title'), hero.querySelector('.story-score'), hero.querySelector('.h-meta'), hero.querySelector('.cta')].filter(Boolean).forEach((el, i) => { const bb = Math.min(1, Math.max(0, (b - i * 0.12) / 0.7)); el.style.opacity = bb; el.style.transform = `translateY(${(1 - bb) * 20}px)`; });
  const cue = hero.querySelector('.cue'); if (cue) cue.style.opacity = b > 0.9 && c === 0 ? 1 : 0;
  hero.style.opacity = 1 - c * 0.7; hero.style.transform = `scale(${1 - c * 0.08}) translateY(${-c * 40}px)`;
}
function mountStory(root, opts = {}) {
  unmountStory();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || opts.replay === false;
  const wrap = root.querySelector('#herowrap'), hero = root.querySelector('#hero');
  heroEls = wrap && hero && wrap.style.height !== 'auto' ? { wrap, hero } : null;
  if (heroEls) {
    intro = reduce ? 1 : 0; introStart = 0;
    const tick = now => { if (!introStart) introStart = now; intro = Math.min(1, (now - introStart) / 1500); heroFrame(); if (intro < 1) introRaf = requestAnimationFrame(tick); };
    introRaf = requestAnimationFrame(tick);
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
  }
  const bars = el => el.querySelectorAll('i[data-w]').forEach((i, k) => setTimeout(() => i.style.width = i.dataset.w + '%', reduce ? 0 : 150 + k * 120));
  const count = el => { const to = Number(el.dataset.to || 0); if (reduce) { el.textContent = to; return; } const start = performance.now(); (function t(now) { const p = Math.min(1, (now - start) / 1400); el.textContent = Math.round(ease(p) * to); if (p < 1) requestAnimationFrame(t); })(start); };
  const targets = root.querySelectorAll('.rv, .chart, .spark');
  if (reduce) { targets.forEach(el => el.classList.add('in')); root.querySelectorAll('#pct').forEach(count); bars(root); return; }
  io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add('in'); if (e.target.querySelector?.('#pct')) count(e.target.querySelector('#pct')); if (e.target.classList.contains('bar') || e.target.classList.contains('cmp')) bars(e.target); io.unobserve(e.target); }), { threshold: 0.2 });
  targets.forEach(el => io.observe(el));
}

// Signature of what could visibly change on refresh; the home re-renders only when this changes.
export function homeSignature(ctx, d) {
  if (!d) return '';
  const g = d.game ? ctx.allGames.get(d.game.id) || d.game : null;
  return [d.team.id, g?.state, g?.home.score, g?.away.score, g?.detail, ctx.games.filter(x => state.prefs.teams.includes(x.home.id) || state.prefs.teams.includes(x.away.id)).map(x => x.state + x.home.score + x.away.score).join(',')].join('|');
}
