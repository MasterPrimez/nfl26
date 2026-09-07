import { esc } from '../ui.js';
import { state } from '../state.js';

// NFL playoff picture: per conference, 4 division winners seeded 1–4 by record, then 3 wild cards (seeds 5–7).
// Seed 1 gets the bye. Uses ESPN's playoffSeed when it has one, otherwise a straight record-based projection
// (win %, then point differential — the real tiebreakers are deeper, so this is labeled projected).
export function projectPlayoff(directory) {
  if (!directory) return null;
  const confs = directory.conferences.map(cf => {
    const teams = directory.teams.filter(t => t.conference.id === cf.id);
    const played = teams.some(t => t.wins + t.losses + t.ties > 0);
    const espnSeeded = teams.filter(t => t.seed && t.seed >= 1 && t.seed <= 7);
    let seeds;
    if (espnSeeded.length === 7) seeds = espnSeeded.sort((a, b) => a.seed - b.seed).map(t => ({ ...t, auto: t.seed <= 4 }));
    else {
      const key = t => [t.winPct || 0, t.wins, t.pointsFor - t.pointsAgainst];
      const cmp = (a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (kb[i] !== ka[i]) return kb[i] - ka[i]; return a.name.localeCompare(b.name); };
      const divs = [...new Set(teams.map(t => t.conf.id))];
      const winners = divs.map(d => teams.filter(t => t.conf.id === d).sort(cmp)[0]).filter(Boolean).sort(cmp);
      const wIds = new Set(winners.map(t => t.id));
      const wild = teams.filter(t => !wIds.has(t.id)).sort(cmp);
      seeds = [...winners.map(t => ({ ...t, auto: true })), ...wild.slice(0, 3).map(t => ({ ...t, auto: false }))].map((t, i) => ({ ...t, seed: i + 1 }));
      seeds.hunt = wild.slice(3, 6);
    }
    return { id: cf.id, name: cf.name, abbr: cf.abbr, seeds, hunt: seeds.hunt || [], played, official: espnSeeded.length === 7 };
  });
  return { confs, official: confs.every(c => c.official), started: confs.some(c => c.played), field: confs.flatMap(c => c.seeds) };
}

export function renderPlayoff(ctx) {
  const p = ctx.playoff;
  if (!p) return '<div class="panel empty">Playoff picture unavailable right now.</div>';
  const seed = t => t ? `<div class="seed-row"><span class="s">${t.seed}</span><img src="${esc(t.logo)}" alt="" loading="lazy"><a class="nm" href="#/team/${t.id}"${state.isMine(t.id) ? ' style="color:var(--amber)"' : ''}>${esc(t.name)}</a><span class="sub">${esc(t.overall || '')}</span>${t.auto ? `<span class="badge" style="font-size:9px;padding:2px 5px">${esc(t.conf.abbr)}</span>` : '<span class="sub">WC</span>'}</div>` : '';
  const ph = label => `<div class="seed-row"><span class="s muted">—</span><div class="ph">?</div><span class="nm muted">${esc(label)}</span></div>`;
  const m = (head, a, b) => `<div class="panel matchup"><div class="mh"><span>${esc(head)}</span></div>${a}${b}</div>`;
  const conf = c => { const s = c.seeds; return `<div class="col"><div class="label">${esc(c.abbr)} · Wild Card · Jan 2027</div>
        ${m('Bye', seed(s[0]), ph('Rests until the Divisional round'))}
        ${m(`At No. 2`, seed(s[6]), seed(s[1]))}
        ${m(`At No. 3`, seed(s[5]), seed(s[2]))}
        ${m(`At No. 4`, seed(s[4]), seed(s[3]))}
        ${c.hunt.length ? `<div class="panel matchup"><div class="mh"><span>In the hunt</span></div>${c.hunt.map(t => `<div class="seed-row"><span class="s muted">·</span><img src="${esc(t.logo)}" alt=""><a class="nm" href="#/team/${t.id}">${esc(t.name)}</a><span class="sub">${esc(t.overall || '')}</span></div>`).join('')}</div>` : ''}
      </div>`; };
  const note = p.official ? 'ESPN PLAYOFF SEEDS' : p.started ? 'PROJECTED FROM RECORDS' : 'PRESEASON · PROJECTED';
  return `<div class="toolbar"><div class="disp h1">Playoff Picture</div>
      <span class="badge" style="color:var(--amber);border-color:var(--amber-dim)">${note}</span></div>
    <div class="sub" style="margin:-8px 0 18px;line-height:1.6">7 teams per conference: 4 division winners (seeds 1–4) + 3 wild cards. Seed 1 skips the Wild Card round. Divisional and Championship rounds at the higher seed; Super Bowl LXI in February 2027.${p.official ? '' : ' Until ESPN publishes seeds, this is a straight projection by record and point differential — the NFL\'s real tiebreakers run deeper.'}</div>
    <div class="bracket" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${p.confs.map(conf).join('')}
      <div class="col"><div class="label">Divisional · Championship · Super Bowl</div>
        ${m('AFC Divisional', ph('No. 1 seed'), ph('Lowest WC winner'))}
        ${m('NFC Divisional', ph('No. 1 seed'), ph('Lowest WC winner'))}
        ${m('AFC Championship', ph('Divisional winner'), ph('Divisional winner'))}
        ${m('NFC Championship', ph('Divisional winner'), ph('Divisional winner'))}
        <div class="panel matchup champ"><div class="mh"><span>Super Bowl LXI · Feb 2027</span></div>${ph('AFC champion')}${ph('NFC champion')}</div>
      </div>
    </div>`;
}
