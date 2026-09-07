import { esc } from '../ui.js';
import { state } from '../state.js';

const DIV_ORDER = ['East', 'North', 'South', 'West'];

export function renderTeams(ctx) {
  const d = ctx.directory;
  if (!d) return '<div class="panel empty">Loading teams…</div>';
  const confs = d.confs.slice().sort((a, b) => (a.conference.abbr.localeCompare(b.conference.abbr)) || (DIV_ORDER.indexOf(a.abbr) - DIV_ORDER.indexOf(b.abbr)));
  return `<div class="toolbar"><div class="disp h1">Teams</div><div class="sub">${d.teams.length} TEAMS · TAP A TEAM FOR SCHEDULE &amp; STATS · ★ ADDS IT TO MY TEAMS</div></div>
    ${confs.map(c => {
      const ts = d.teams.filter(t => t.conf.id === c.id).sort((a, b) => a.name.localeCompare(b.name));
      return `<section class="conf"><div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px"><div class="disp h2">${esc(c.name)}</div><span class="sub">${ts.length} TEAMS</span></div>
        <div class="team-grid">${ts.map(t => `<div class="panel team-tile" data-team="${t.id}">
          <img src="${esc(t.logo)}" alt="" loading="lazy"><span class="nm">${esc(t.name)}</span><span class="mono muted" style="font-size:11px">${esc(t.overall)}</span>
          <button class="star${state.isMine(t.id) ? ' on' : ''}" data-star="${t.id}" title="Add to My Teams" type="button">★</button></div>`).join('')}</div></section>`;
    }).join('')}`;
}

