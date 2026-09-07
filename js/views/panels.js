import { esc, isPrimetime } from '../ui.js';
import { darkLogo } from '../api.js';
import { fmtTime, tzLabel, dayKey, state } from '../state.js';
import { primaryNetwork } from '../networks.js';

export function rankingsPanel(rankings, opts = {}) {
  const poll = rankings?.ap;
  if (!poll) return '';
  const rows = poll.ranks.map(r => `<span>${r.current <= 12 ? `<span class="amber">${r.current}</span>` : `<span class="muted">${r.current}</span>`} <a href="#/team/${r.team.id}"${state.isMine(r.team.id) ? ' class="mine"' : ''}>${esc(r.team.nickname)}</a></span>`);
  return `<div class="panel panel-pad">
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px"><div class="disp h3">${esc(poll.shortName || poll.name)}</div><div class="sub">${esc(poll.occurrence?.displayValue || '')}</div></div>
    <div class="mono" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px;font-size:11px;color:#c9cbd0">${rows.join('')}</div>
    <div class="hr" style="margin:12px 0"></div><a class="mono" style="font-size:11px" href="#/rankings">All polls →</a>
  </div>`;
}

export function playoffPanel(playoff, rankings) {
  if (!playoff) return '';
  const row = t => `<div class="rank-row">
    <span class="n${t.seed === 1 ? ' top' : ''}">${t.seed}</span><img src="${esc(t.logo)}" alt="" loading="lazy">
    <a class="nm" href="#/team/${t.id}"${state.isMine(t.id) ? ' style="color:var(--amber)"' : ''}>${esc(t.name)}</a>
    <span class="rec">${esc(t.overall || '')}</span>
    ${t.seed === 1 ? '<span class="badge" style="font-size:9px;padding:2px 5px">BYE</span>' : (t.auto ? `<span class="badge" style="font-size:9px;padding:2px 5px">${esc(t.conf.abbr)}</span>` : '<span class="sub">WC</span>')}
  </div>`;
  return `<div class="panel panel-pad">
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px"><div class="disp h3">Playoff Picture</div><span class="badge btn-amber" style="color:var(--amber);border-color:var(--amber-dim)">${playoff.official ? 'ESPN seeds' : 'Projected'}</span></div>
    <div class="stack" style="gap:12px">${playoff.confs.map(c => `<div><div class="label" style="margin-bottom:6px">${esc(c.abbr)}</div><div class="rank-list">${c.seeds.map(row).join('')}</div></div>`).join('')}</div>
    <div class="hr" style="margin:12px 0"></div>
    <div style="display:flex;justify-content:space-between;gap:8px"><span class="sub">4 division winners + 3 wild cards each side</span><a class="mono" style="font-size:11px;white-space:nowrap" href="#/playoff">Bracket →</a></div>
  </div>`;
}

export function tonightPanel(games) {
  const now = new Date();
  const today = dayKey(now);
  const upcoming = games.filter(g => g.state !== 'post' && dayKey(g.date) === today).sort((a, b) => a.date - b.date);
  const list = upcoming.filter(g => state.isMine(g.home.id) || state.isMine(g.away.id) || isPrimetime(g)).slice(0, 8);
  const pick = list.length ? list : upcoming.slice(0, 8);
  if (!pick.length) return '';
  return `<div class="panel panel-pad">
    <div class="disp h3" style="margin-bottom:12px">Today on TV</div>
    <div class="stack" style="gap:8px">${pick.map(g => `<div style="display:flex;gap:10px;align-items:center;cursor:pointer" data-game="${g.id}">
      <span class="mono ${g.state === 'in' ? 'down' : 'amber'}" style="width:66px;font-size:11px">${g.state === 'in' ? 'LIVE' : fmtTime(g.date)}</span>
      <span style="font-size:13px;flex-grow:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.away.name)} ${g.neutral ? 'vs' : 'at'} ${esc(g.home.name)}</span>
      <span class="badge">${esc(primaryNetwork(g.networks) || 'TBA')}</span></div>`).join('')}</div>
    <div class="sub" style="margin-top:10px">Times in ${tzLabel()} · <a href="#/tv">Full TV grid →</a></div>
  </div>`;
}
