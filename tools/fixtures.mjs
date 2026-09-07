// Mocked ESPN NFL responses for the screenshot/video rigs, built from real Week 1 2026 samples in tools/samples/.
// Some games are flipped to live/final with invented scores so every state renders.
import { readFileSync } from 'fs';
const load = f => JSON.parse(readFileSync(new URL(`./samples/${f}.json`, import.meta.url), 'utf8'));
const SB = load('scoreboard'), ST = load('standings'), SC = load('schedule'), SM = load('summary');

const TEAMS = new Map();
SB.events.forEach(e => e.competitions[0].competitors.forEach(x => TEAMS.set(String(x.team.id), x.team)));

export function scoreboard({ week = 1 } = {}) {
  const sb = JSON.parse(JSON.stringify(SB));
  sb.week = { number: week };
  sb.events.forEach((e, k) => {
    const c = e.competitions[0];
    const st = k % 4 === 0 ? 'in' : k % 4 === 1 ? 'post' : 'pre';
    if (st === 'pre') return;
    const [a, b] = c.competitors;
    a.score = String(10 + (k * 7) % 21); b.score = String(7 + (k * 3) % 24);
    a.linescores = [{ value: 7 }, { value: 3 }, { value: 7 }, { value: st === 'post' ? 7 : 0 }].slice(0, st === 'post' ? 4 : 3);
    b.linescores = [{ value: 0 }, { value: 7 }, { value: 7 }, { value: st === 'post' ? 3 : 0 }].slice(0, st === 'post' ? 4 : 3);
    const type = st === 'in' ? { state: 'in', completed: false, description: 'In Progress', detail: '8:42 - 3rd Quarter', shortDetail: '8:42 - 3rd', name: 'STATUS_IN_PROGRESS' } : { state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final', name: 'STATUS_FINAL' };
    e.status = { ...e.status, type, period: st === 'in' ? 3 : 4, displayClock: st === 'in' ? '8:42' : '0:00' };
    c.status = e.status;
    if (st === 'post') { a.winner = Number(a.score) > Number(b.score); b.winner = !a.winner; }
    if (st === 'in') c.situation = { downDistanceText: '2nd & 7 at KC 34', possession: a.team.id, lastPlay: { text: 'Pass complete for 12 yards', probability: { homeWinPercentage: 0.61 } } };
  });
  return sb;
}

export function standings() {
  const st = JSON.parse(JSON.stringify(ST));
  // Give the table something to sort: seeded records so divisions have leaders.
  let k = 0;
  st.children.forEach(cf => cf.children.forEach(dv => dv.standings.entries.forEach((en, i) => {
    const w = [4, 3, 2, 1][i] + (k % 2), l = 5 - w; k++;
    const set = (name, value, dv) => { const s = en.stats.find(s => s.name === name); if (s) { s.value = value; s.displayValue = dv ?? String(value); } };
    set('wins', w); set('losses', l); set('winPercent', w / 5, (w / 5).toFixed(3)); set('pointsFor', 100 + w * 15); set('pointsAgainst', 95 + l * 12);
    set('pointDifferential', (100 + w * 15) - (95 + l * 12)); set('streak', w > l ? 2 : -1, w > l ? 'W2' : 'L1');
    const ov = en.stats.find(s => s.type === 'total'); if (ov) ov.displayValue = `${w}-${l}`;
    const dr = en.stats.find(s => s.type === 'vsdiv'); if (dr) dr.displayValue = `${Math.min(w, 2)}-${Math.min(l, 2)}`;
  })));
  return st;
}

export function teamDetail(id) {
  const t = TEAMS.get(String(id)) || TEAMS.get('26');
  const entry = ST.children.flatMap(c => c.children.flatMap(d => d.standings.entries.map(e => ({ e, d, c })))).find(x => String(x.e.team.id) === String(id));
  const wins = 3, losses = 2;
  const stats = [['gamesPlayed', 5], ['wins', wins], ['losses', losses], ['ties', 0], ['pointsFor', 128], ['pointsAgainst', 104], ['pointDifferential', 24], ['playoffSeed', 0], ['winPercent', 0.6]].map(([name, value]) => ({ name, value }));
  return { team: { ...t, logos: [{ href: `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${t.abbreviation.toLowerCase()}.png`, rel: ['full', 'dark'] }], record: { items: [{ type: 'total', summary: `${wins}-${losses}`, stats }] }, groups: { id: entry?.d.id, parent: { id: entry?.c.id } }, standingSummary: `1st in ${entry?.d.name || 'NFC West'}`, franchise: { venue: { id: '3673', fullName: 'Lumen Field', images: [{ href: 'https://a.espncdn.com/i/venues/nfl/day/interior/3673.jpg', rel: ['full', 'day', 'interior'] }] } }, nextEvent: [] } };
}

export function schedule(id) {
  const sc = JSON.parse(JSON.stringify(SC));
  const me = TEAMS.get(String(id)) || TEAMS.get('26');
  // Re-point the sample schedule (Seattle's) at the requested team, and make the first 4 games final.
  sc.events.forEach((e, i) => {
    const c = e.competitions[0];
    c.competitors.forEach(x => { if (String(x.team.id) === '26') { x.team = { ...x.team, id: me.id, displayName: me.displayName, shortDisplayName: me.shortDisplayName, location: me.location, abbreviation: me.abbreviation, logos: [{ href: `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${me.abbreviation.toLowerCase()}.png`, rel: ['dark'] }] }; x.id = me.id; } else { x.team.logos = [{ href: `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${x.team.abbreviation.toLowerCase()}.png`, rel: ['dark'] }]; } });
    if (i < 4) {
      const mine = c.competitors.find(x => String(x.id) === String(me.id)); const opp = c.competitors.find(x => x !== mine);
      const w = i !== 2; mine.score = { value: w ? 27 + i * 3 : 17, displayValue: String(w ? 27 + i * 3 : 17) }; opp.score = { value: w ? 20 - i * 2 : 24, displayValue: String(w ? 20 - i * 2 : 24) };
      mine.winner = w; opp.winner = !w;
      c.status = { type: { state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' } };
      e.date = new Date(Date.now() - (5 - i) * 7 * 864e5).toISOString();
    }
  });
  return sc;
}

export function summary(eventId) {
  const sb = scoreboard();
  const e = sb.events.find(x => x.id === String(eventId)) || sb.events[0];
  const c = e.competitions[0];
  const [h, a] = c.competitors;
  const stat = (n, v) => ({ name: n, displayValue: v });
  const base = { header: { competitions: [c], week: e.week?.number }, gameInfo: { venue: { ...c.venue, images: [{ href: 'https://a.espncdn.com/i/venues/nfl/day/interior/3673.jpg', rel: ['full', 'day', 'interior'] }] }, weather: { displayValue: 'Partly cloudy', temperature: 68 } }, pickcenter: c.odds };
  if (c.status?.type?.state === 'pre') return { ...base, boxscore: { teams: [] }, leaders: [], scoringPlays: [], winprobability: [] };
  return { ...base,
    boxscore: { teams: [{ team: h.team, statistics: [stat('totalYards', '312'), stat('netPassingYards', '221'), stat('rushingYards', '91'), stat('thirdDownEff', '5-11'), stat('turnovers', '1'), stat('possessionTime', '28:40')] }, { team: a.team, statistics: [stat('totalYards', '287'), stat('netPassingYards', '198'), stat('rushingYards', '89'), stat('thirdDownEff', '4-12'), stat('turnovers', '2'), stat('possessionTime', '31:20')] }] },
    leaders: [{ team: h.team, leaders: [{ name: 'passingYards', displayName: 'Passing Yards', leaders: [{ displayValue: '221 YDS, 2 TD', athlete: { shortName: 'S. Darnold' } }] }, { name: 'rushingYards', displayName: 'Rushing Yards', leaders: [{ displayValue: '14 CAR, 71 YDS', athlete: { shortName: 'K. Walker III' } }] }, { name: 'receivingYards', displayName: 'Receiving Yards', leaders: [{ displayValue: '6 REC, 88 YDS', athlete: { shortName: 'J. Smith-Njigba' } }] }] }, { team: a.team, leaders: [{ name: 'passingYards', displayName: 'Passing Yards', leaders: [{ displayValue: '198 YDS, 1 TD', athlete: { shortName: 'D. Maye' } }] }, { name: 'rushingYards', displayName: 'Rushing Yards', leaders: [{ displayValue: '12 CAR, 54 YDS', athlete: { shortName: 'R. Stevenson' } }] }] }],
    scoringPlays: [{ period: { number: 1 }, clock: { displayValue: '9:12' }, team: h.team, text: 'K. Walker III 4 Yd Run (J. Myers Kick)', awayScore: 0, homeScore: 7 }, { period: { number: 2 }, clock: { displayValue: '3:40' }, team: a.team, text: 'D. Maye pass to H. Henry for 12 Yds (Kick good)', awayScore: 7, homeScore: 7 }, { period: { number: 3 }, clock: { displayValue: '11:05' }, team: h.team, text: 'J. Myers 41 Yd Field Goal', awayScore: 7, homeScore: 10 }],
    winprobability: [{ homeWinPercentage: 0.61 }],
  };
}
