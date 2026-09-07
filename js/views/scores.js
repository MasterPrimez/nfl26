import { esc, gameCard, rowsTable, filterBar, applyFilter, isFeatured, isMobile } from '../ui.js';
import { fmtDay, dayKey, state } from '../state.js';
import { rankingsPanel, playoffPanel, tonightPanel } from './panels.js';

export function renderScores(ctx) {
  const { games, week, calendar, rankings, playoff } = ctx;
  const weekBtns = calendar.map(w => `<button class="${w.key === week ? "on" : (w.past ? "past" : "")}" data-week="${w.key}" title="${esc(w.detail)}">${esc(w.short)}</button>`).join('');

  const filtered = applyFilter(games);
  const byDay = new Map();
  filtered.slice().sort((a, b) => a.date - b.date).forEach(g => {
    const k = dayKey(g.date);
    if (!byDay.has(k)) byDay.set(k, { date: g.date, games: [] });
    byDay.get(k).games.push(g);
  });

  const days = [...byDay.values()].map(d => {
    const live = d.games.filter(g => g.state === 'in').length;
    const fin = d.games.filter(g => g.state === 'post').length;
    const allDone = fin === d.games.length;
    const featured = d.games.filter(isFeatured);
    const rest = d.games.filter(g => !isFeatured(g));
    // With a narrow filter (my teams / a conference) everything is a card.
    const narrow = state.prefs.filter !== 'all';
    const cards = narrow ? d.games : featured;
    const rows = narrow ? [] : rest;
    return `<section class="day">
      <div class="day-head"><div class="disp h2${allDone ? ' muted' : ''}">${fmtDay(d.date)}</div><div class="sub">${d.games.length} GAME${d.games.length === 1 ? '' : 'S'}${live ? ` · ${live} LIVE` : ''}${fin ? ` · ${fin} FINAL` : ''}</div></div>
      ${cards.length ? `<div class="cards">${cards.map(gameCard).join('')}</div>` : ''}
      ${rows.length ? rowsTable(rows) : ''}
    </section>`;
  }).join('');

  return `
    <div class="toolbar"><span class="label">Week</span><div class="weeks">${weekBtns}</div>${weekNote(calendar, week)}</div>
    <div class="toolbar">${filterBar()}</div>
    <div class="grid-main">
      ${isMobile() ? tonightPanel(games) : ''}
      <div>${days || `<div class="panel empty">No games match this filter${state.prefs.filter === 'mine' && !state.prefs.teams.length ? ' — pick your teams under My Setup' : ''}.</div>`}</div>
      <aside class="rail">
        ${isMobile() ? '' : playoffPanel(playoff, rankings) + rankingsPanel(rankings)}
        ${isMobile() ? '' : tonightPanel(games)}
      </aside>
    </div>`;
}

function weekNote(calendar, key) {
  const w = calendar.find(x => x.key === key);
  if (!w || w.current) return '';
  return `<span class="sub" style="white-space:nowrap">${esc(w.label)} · ${esc(w.detail)}${w.past ? '' : ' · times/TV firm up ~6 days out'}</span>`;
}
