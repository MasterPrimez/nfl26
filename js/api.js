// ESPN public NFL API (unofficial, no key). All calls are browser-side.
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const V2 = 'https://site.api.espn.com/apis/v2/sports/football/nfl';

const cache = new Map();

async function getJSON(url, ttlMs) {
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && now - hit.t < ttlMs) return hit.v;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`ESPN ${r.status} for ${url}`);
  const v = await r.json();
  cache.set(url, { t: now, v });
  return v;
}

export const api = {
  // The week's slate. Omit week to get the current one.
  scoreboard(week, opts = {}) {
    const q = new URLSearchParams();
    if (week) q.set('week', String(week));
    if (opts.seasontype) q.set('seasontype', String(opts.seasontype));
    return getJSON(`${SITE}/scoreboard?${q}`, opts.ttl ?? 30_000);
  },
  // Standings (level=3 → conference → division → 4 teams) doubles as the team directory.
  standings() { return getJSON(`${V2}/standings?level=3`, 5 * 60_000); },
  team(id) { return getJSON(`${SITE}/teams/${id}`, 5 * 60_000); },
  schedule(id) { return getJSON(`${SITE}/teams/${id}/schedule`, 2 * 60_000); },
  summary(eventId) { return getJSON(`${SITE}/summary?event=${eventId}`, 30_000); },
};

// ---- Normalizers -----------------------------------------------------------

export function normalizeEvent(e) {
  const c = e.competitions[0];
  const st = e.status?.type || c.status?.type || {};
  const comps = c.competitors.map(x => ({
    id: x.team.id,
    homeAway: x.homeAway,
    abbr: x.team.abbreviation,
    name: x.team.shortDisplayName || x.team.location || x.team.displayName,
    fullName: x.team.displayName,
    logo: darkLogo(x.team.logo) || pickLogo(x.team),
    color: '#' + (x.team.color || '333333'),
    rank: x.curatedRank && x.curatedRank.current && x.curatedRank.current <= 25 ? x.curatedRank.current : null,
    score: x.score != null ? Number(x.score) : null,
    winner: !!x.winner,
    record: (x.records || []).find(r => r.type === 'total')?.summary || '',
    confRecord: (x.records || []).find(r => r.type === 'vsconf')?.summary || '',
    conferenceId: x.team.conferenceId,
    linescores: (x.linescores || []).map(l => l.value),
  }));
  const home = comps.find(x => x.homeAway === 'home') || comps[0];
  const away = comps.find(x => x.homeAway === 'away') || comps[1];
  const networks = [];
  (c.broadcasts || []).forEach(b => (b.names || []).forEach(n => networks.push(n)));
  (c.geoBroadcasts || []).forEach(g => { const n = g.media?.shortName; if (n && !networks.includes(n)) networks.push(n); });
  const odds = c.odds && c.odds[0];
  return {
    id: e.id,
    name: e.name,
    shortName: e.shortName,
    date: new Date(e.date),
    week: e.week?.number,
    state: st.state, // pre | in | post
    completed: !!st.completed,
    detail: st.shortDetail || st.detail || '',
    period: e.status?.period,
    clock: e.status?.displayClock,
    home, away,
    venue: c.venue ? { name: c.venue.fullName?.replace(/\s*\(.*\)$/, ''), city: c.venue.address?.city, state: c.venue.address?.state, indoor: c.venue.indoor } : null,
    neutral: !!c.neutralSite,
    networks,
    odds: odds ? { details: odds.details, overUnder: odds.overUnder, spread: odds.spread } : null,
    situation: c.situation ? { raw: c.situation, possession: c.situation.possession, text: c.situation.downDistanceText, lastPlay: c.situation.lastPlay?.text, homeWin: c.situation.lastPlay?.probability?.homeWinPercentage } : null,
    headline: c.headlines && c.headlines[0]?.shortLinkText,
    tbd: /TBD|TBA/i.test(st.detail || '') || e.timeValid === false,
  };
}

// NFL logos are keyed by abbreviation, not id.
export const ABBR = { 1: 'atl', 2: 'buf', 3: 'chi', 4: 'cin', 5: 'cle', 6: 'dal', 7: 'den', 8: 'det', 9: 'gb', 10: 'ten', 11: 'ind', 12: 'kc', 13: 'lv', 14: 'lar', 15: 'mia', 16: 'min', 17: 'ne', 18: 'no', 19: 'nyg', 20: 'nyj', 21: 'phi', 22: 'ari', 23: 'pit', 24: 'lac', 25: 'sf', 26: 'sea', 27: 'tb', 28: 'wsh', 29: 'car', 30: 'jax', 33: 'bal', 34: 'hou' };
export function logoUrl(teamId, dark = true) {
  const ab = ABBR[teamId] || String(teamId).toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/500${dark ? '-dark' : ''}/${ab}.png`;
}
// ESPN's default logos are drawn for white backgrounds; the -dark set is for dark UIs.
export const darkLogo = u => (u || '').replace('/teamlogos/nfl/500/', '/teamlogos/nfl/500-dark/');
// Prefer the 'dark' entry of a team's logos[] when present.
export function pickLogo(team) {
  const l = team?.logos || [];
  const d = l.find(x => (x.rel || []).includes('dark'))?.href;
  return d || darkLogo(l[0]?.href || team?.logo || '') || logoUrl(team?.id);
}

// Team directory from standings: [{id, name, abbr, logo, conf: {id, name, abbr}, div: {id, name, abbr}, ...}]
// `conf` keeps the CFB-era shape (views group by it); for the NFL it is the DIVISION, and `conference` is AFC/NFC.
export function normalizeDirectory(standings) {
  const teams = [];
  const confs = [];
  const conferences = [];
  (standings.children || []).forEach(cf => {
    const conference = { id: cf.id, name: cf.name, abbr: cf.abbreviation };
    conferences.push(conference);
    (cf.children || []).forEach(dv => {
      const conf = { id: dv.id, name: dv.name, abbr: dv.name.replace(/^(AFC|NFC)\s*/, ''), conference };
      confs.push(conf);
      (dv.standings?.entries || []).forEach(en => {
        const t = en.team;
        const stat = n => en.stats.find(s => s.name === n || s.type === n);
        teams.push({
          id: t.id, name: t.shortDisplayName || t.name, fullName: t.displayName, abbr: t.abbreviation, location: t.location,
          logo: pickLogo(t),
          conf, conference,
          overall: stat('overall')?.displayValue || stat('total')?.displayValue || '',
          confRec: en.stats.find(s => s.type === 'vsconf')?.displayValue || '',
          divRec: en.stats.find(s => s.type === 'vsdiv')?.displayValue || stat('divisionRecord')?.displayValue || '',
          wins: Number(stat('wins')?.value ?? 0), losses: Number(stat('losses')?.value ?? 0), ties: Number(stat('ties')?.value ?? 0),
          winPct: Number(stat('winPercent')?.value ?? 0),
          seed: Number(stat('playoffSeed')?.value ?? 0) || null,
          streak: stat('streak')?.displayValue || '',
          gamesBehind: stat('gamesBehind')?.displayValue || '',
          pointsFor: Number(stat('pointsFor')?.value ?? 0),
          pointsAgainst: Number(stat('pointsAgainst')?.value ?? 0),
        });
      });
    });
  });
  return { teams, confs, conferences };
}

export const AFC = '8', NFC = '7';
