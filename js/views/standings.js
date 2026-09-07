import { esc } from '../ui.js';
import { state } from '../state.js';

const DIV_ORDER = ['East', 'North', 'South', 'West'];

export function renderStandings(ctx) {
  const d = ctx.directory;
  if (!d) return '<div class="panel empty">Standings unavailable right now.</div>';
  const seedOf = id => ctx.playoff?.field.find(t => t.id === id)?.seed;
  const conf = cf => {
    const divs = d.confs.filter(x => x.conference.id === cf.id).sort((a, b) => DIV_ORDER.indexOf(a.abbr) - DIV_ORDER.indexOf(b.abbr));
    return `<div class="panel panel-pad"><div class="disp h2" style="margin-bottom:8px">${esc(cf.name)}</div>
      ${divs.map(dv => { const ts = d.teams.filter(t => t.conf.id === dv.id).sort((a, b) => (b.winPct - a.winPct) || (b.wins - a.wins) || ((b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)));
        return `<div class="rows" style="margin-top:12px"><table><thead><tr><th>${esc(dv.name)}</th><th style="width:60px;text-align:right">W-L</th><th style="width:48px;text-align:right">Pct</th><th style="width:56px;text-align:right">Div</th><th style="width:56px;text-align:right">Conf</th><th style="width:52px;text-align:right">Diff</th><th style="width:44px;text-align:right">Strk</th></tr></thead><tbody>
          ${ts.map(t => { const sd = seedOf(t.id); const diff = t.pointsFor - t.pointsAgainst; return `<tr${state.isMine(t.id) ? ' style="background:rgba(245,165,36,0.06)"' : ''}><td><img class="mini" src="${esc(t.logo)}" alt="" loading="lazy"><a href="#/team/${t.id}"${state.isMine(t.id) ? ' class="amber"' : ''}>${esc(t.name)}</a>${sd ? ` <span class="badge" style="font-size:9px;padding:1px 5px;color:var(--amber);border-color:var(--amber-dim)">${sd}</span>` : ''}</td><td class="mono" style="text-align:right">${esc(t.overall || '0-0')}</td><td class="mono muted" style="text-align:right">${(t.winPct || 0).toFixed(3).replace(/^0/, '')}</td><td class="mono muted" style="text-align:right">${esc(t.divRec || '0-0')}</td><td class="mono muted" style="text-align:right">${esc(t.confRec || '0-0')}</td><td class="mono ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'muted'}" style="text-align:right">${diff > 0 ? '+' : ''}${diff}</td><td class="mono muted" style="text-align:right">${esc(t.streak || '—')}</td></tr>`; }).join('')}
        </tbody></table></div>`; }).join('')}
    </div>`;
  };
  return `<div class="toolbar"><div class="disp h1">Standings</div><div class="sub">DIVISION LEADERS FIRST · AMBER NUMBER = PLAYOFF SEED${ctx.playoff?.official ? '' : ' (PROJECTED)'}</div></div>
    <div class="rank-cols">${d.conferences.map(conf).join('')}</div>`;
}
