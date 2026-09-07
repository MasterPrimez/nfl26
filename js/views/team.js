import { esc, statusBadge } from '../ui.js';
import { api, logoUrl, pickLogo } from '../api.js';
import { fmtShortDate, fmtTime, tzLabel, state } from '../state.js';
import { primaryNetwork, watchSummary } from '../networks.js';

export async function renderTeam(ctx, params) {
  const id = params.id;
  const [team, sched] = await Promise.all([api.team(id).then(r => r.team), api.schedule(id)]);
  const d = ctx.directory;
  const dirTeam = d?.teams.find(t => t.id === String(id));
  const conf = dirTeam?.conf;
  const logo = pickLogo(team);
  const rec = team.record?.items?.find(i => i.type === 'total');
  const stat = n => rec?.stats?.find(s => s.name === n)?.value;
  const gp = stat('gamesPlayed') || 0;
  const seedT = ctx.playoff?.field.find(t => t.id === String(id));
  const seed = seedT?.seed || null;

  const events = (sched.events || []).map(e => normSched(e, id)).sort((a, b) => a.date - b.date);
  const next = events.find(e => e.state !== 'post');

  const rows = events.map(e => `<tr class="rowlink" data-game="${e.id}">
    <td class="mono muted">${e.week ?? ''}</td>
    <td class="mono muted">${fmtShortDate(e.date)}</td>
    <td><img class="mini" src="${esc(e.opp.logo)}" alt="" loading="lazy">${e.home ? 'vs' : (e.neutral ? 'vs' : 'at')} ${e.opp.rank ? `<span class="amber mono" style="font-size:11px">#${e.opp.rank}</span> ` : ''}<a href="#/team/${e.opp.id}">${esc(e.opp.name)}</a></td>
    <td class="mono">${e.state === 'post' ? `<span class="${e.won ? 'up' : 'down'}">${e.won ? 'W' : 'L'} ${e.score}–${e.oppScore}</span>` : (e.state === 'in' ? statusBadge(e) : (e.tbd ? '<span class="muted">TBA</span>' : `${fmtTime(e.date)} ${tzLabel()}`))}</td>
    <td class="muted">${esc(e.venue || '')}</td>
    <td class="mono">${esc(e.network || (e.state === 'pre' ? 'TBA' : ''))}</td>
    <td class="muted">${e.state === 'post' ? 'Box score →' : (e.network ? esc(watchSummary([e.network], state.myServices)) : '—')}</td>
  </tr>`).join('');

  const confTeams = conf ? d.teams.filter(t => t.conf.id === conf.id).sort((a, b) => (b.winPct - a.winPct) || (b.wins - a.wins) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)) : [];

  return `<div class="team-head">
      <img src="${esc(logo)}" alt="">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div class="mono amber" style="font-size:12px">${seed ? `PLAYOFF SEED ${seed}${ctx.playoff.official ? '' : ' (PROJ)'} · ` : ''}${esc(conf?.name || '')}</div>
        <div class="disp big">${esc(team.displayName)}</div>
        <div class="sub">${esc(team.location || '')}${team.standingSummary ? ' · ' + esc(team.standingSummary) : ''}${next ? ' · Next: ' + (next.home ? 'vs ' : 'at ') + esc(next.opp.name) + ' ' + fmtShortDate(next.date) : ''}</div>
      </div>
      <div class="stat-tiles">
        <div><div class="label">Record</div><div class="v">${esc(rec?.summary || dirTeam?.overall || '0-0')}</div></div>
        <div><div class="label">Division</div><div class="v">${esc(dirTeam?.divRec || '0-0')}</div></div>
        <div><div class="label">PF / G</div><div class="v">${gp ? (stat('pointsFor') / gp).toFixed(1) : '—'}</div></div>
        <div><div class="label">PA / G</div><div class="v">${gp ? (stat('pointsAgainst') / gp).toFixed(1) : '—'}</div></div>
      </div>
      <button class="btn${state.isMine(id) ? ' on' : ' btn-amber'}" data-star="${id}" type="button" style="align-self:flex-start">${state.isMine(id) ? '★ In My Teams' : '☆ Add to My Teams'}</button>
    </div>
    <div class="grid-main">
      <div class="panel rows">
        <div style="display:flex;align-items:baseline;gap:12px;padding:10px 10px 4px"><div class="disp h3">2026 Schedule</div><div class="sub">TIMES IN ${tzLabel()} · TAP A ROW FOR GAME DETAIL</div></div>
        <table><thead><tr><th style="width:36px">Wk</th><th style="width:70px">Date</th><th>Opponent</th><th style="width:110px">Result</th><th>Venue</th><th style="width:70px">TV</th><th style="width:150px">Watch</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">Schedule not posted yet.</td></tr>'}</tbody></table>
      </div>
      <aside class="rail">
        ${conf ? `<div class="panel panel-pad"><div class="disp h3" style="margin-bottom:10px">${esc(conf.name)} Standings</div>
          <table><thead><tr><th>Team</th><th style="text-align:right">W-L</th><th style="text-align:right">Div</th><th style="text-align:right">Strk</th></tr></thead><tbody>
          ${confTeams.map(t => `<tr${t.id === String(id) ? ' style="background:rgba(245,165,36,0.06)"' : ''}><td><a href="#/team/${t.id}"${t.id === String(id) ? ' class="amber"' : ''}>${esc(t.name)}</a></td><td class="mono" style="text-align:right">${esc(t.overall || '0-0')}</td><td class="mono" style="text-align:right">${esc(t.divRec || '0-0')}</td><td class="mono muted" style="text-align:right">${esc(t.streak || '—')}</td></tr>`).join('')}
          </tbody></table></div>` : ''}
      </aside>
    </div>`;
}

function normSched(e, teamId) {
  const c = e.competitions[0];
  const me = c.competitors.find(x => String(x.team.id) === String(teamId)) || c.competitors[0];
  const opp = c.competitors.find(x => x !== me) || c.competitors[1];
  const st = c.status?.type || e.status?.type || {};
  const rk = () => null;
  const sc = x => x.score && (x.score.value != null ? x.score.value : Number(x.score));
  return {
    id: e.id, date: new Date(e.date), week: e.week?.number, state: st.state, detail: st.shortDetail || st.detail || '', tbd: e.timeValid === false || /TBD|TBA/i.test(st.detail || ''),
    home: me.homeAway === 'home', neutral: !!c.neutralSite,
    opp: { id: opp.team.id, name: opp.team.shortDisplayName || opp.team.location || opp.team.displayName, logo: pickLogo(opp.team), rank: rk(opp) },
    won: !!me.winner, score: sc(me), oppScore: sc(opp),
    venue: c.venue?.fullName ? c.venue.fullName.replace(/\s*\(.*\)$/, '') + (c.venue.address?.city ? ' · ' + c.venue.address.city + (c.venue.address.state ? ', ' + c.venue.address.state : '') : '') : '',
    network: (c.broadcasts || []).map(b => b.media?.shortName || (b.names && b.names[0])).filter(Boolean)[0] || '',
  };
}
