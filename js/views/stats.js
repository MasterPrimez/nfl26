// Private stats page (#/stats). Admins only — the Worker checks the list and re-verifies the password each time.
import { esc } from '../ui.js';
import { currentUser, isAdmin, fetchStats } from '../auth.js';
import { logoUrl } from '../api.js';
import { SERVICES } from '../networks.js';

export function renderStats(ctx) {
  const u = currentUser();
  if (!u) return { html: `<div class="panel empty">Sign in first (top right), then come back to this page.</div>` };
  if (!isAdmin()) return { html: `<div class="panel empty">This page isn't available on your account.</div>` };
  const html = `<div class="toolbar"><div class="disp h1">Stats</div><div class="sub">PRIVATE · ${esc(u.email.toUpperCase())}</div></div>
    <div class="panel panel-pad stack" id="stats-gate" style="max-width:460px;gap:12px">
      <div class="disp h3">Enter your password</div>
      <div class="sub">Re-checked every time you open this page.</div>
      <form class="signin" id="stats-form" style="grid-template-columns:minmax(0,1fr) auto"><input class="search" id="stats-pw" type="password" autocomplete="current-password" placeholder="Password" required><button class="btn btn-amber" type="submit">Show stats</button></form>
      <div class="sub" id="stats-msg"></div>
    </div>
    <div id="stats-body"></div>`;
  const mount = root => {
    const form = root.querySelector('#stats-form');
    form.onsubmit = async e => {
      e.preventDefault();
      const msg = root.querySelector('#stats-msg'); const btn = form.querySelector('button'); btn.disabled = true; msg.textContent = 'Loading…';
      try { const d = await fetchStats(root.querySelector('#stats-pw').value); root.querySelector('#stats-gate').hidden = true; root.querySelector('#stats-body').innerHTML = statsHtml(ctx, d); }
      catch (err) { msg.innerHTML = `<span class="down">${esc(err.message)}</span>`; btn.disabled = false; }
    };
    setTimeout(() => root.querySelector('#stats-pw')?.focus(), 50);
  };
  return { html, mount };
}

function statsHtml(ctx, d) {
  const t = d.totals;
  const teamName = id => ctx.directory?.teams.find(x => x.id === String(id))?.name || id;
  const when = s => { if (!s) return '—'; const dt = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); const h = (Date.now() - dt) / 36e5; return h < 1 ? 'just now' : h < 24 ? Math.round(h) + 'h ago' : h < 24 * 14 ? Math.round(h / 24) + 'd ago' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const tile = (label, v, sub = '') => `<div class="panel panel-pad"><div class="label">${label}</div><div class="disp" style="font-size:40px;line-height:1;margin-top:6px">${v}</div>${sub ? `<div class="sub" style="margin-top:4px">${sub}</div>` : ''}</div>`;
  const rows = d.users.map(u => `<tr><td>${esc(u.email)}${u.google ? ' <span class="badge" style="font-size:9px;padding:1px 5px">GOOGLE</span>' : ''}</td><td class="mono muted">${when(u.created_at)}</td><td class="mono">${when(u.last_seen)}</td><td class="mono" style="text-align:center">${u.devices}</td><td>${u.teams.map(id => `<img src="${logoUrl(id)}" alt="" title="${esc(teamName(id))}" loading="lazy" style="width:20px;height:20px;object-fit:contain;margin-right:4px;vertical-align:middle">`).join('')}${u.teams.length ? '' : '<span class="muted">—</span>'}</td><td class="muted" style="font-size:12px">${u.services.map(s => SERVICES[s]?.name || s).join(', ') || '—'}</td></tr>`).join('');
  return `<div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
      ${tile('Accounts', t.users)}${tile('New · 7 days', t.new7, `${t.new30} in 30 days`)}${tile('Active · 7 days', t.active7, `${t.active1} today`)}${tile('Google sign-ins', t.google)}
    </div>
    <div class="grid-main" style="grid-template-columns:minmax(0,1fr) 300px">
      <div class="panel rows"><div style="display:flex;align-items:baseline;gap:12px;padding:10px 10px 4px"><div class="disp h3">Everyone</div><div class="sub">NEWEST FIRST · UPDATED ${esc(new Date(d.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase())}</div></div>
        <table><thead><tr><th>Email</th><th style="width:90px">Joined</th><th style="width:90px">Last seen</th><th style="width:70px;text-align:center">Devices</th><th>Teams</th><th>Services</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">No accounts yet.</td></tr>'}</tbody></table></div>
      <aside class="rail">
        <div class="panel panel-pad"><div class="disp h3" style="margin-bottom:10px">Most-followed teams</div><div class="stack" style="gap:6px">${d.topTeams.map(x => `<div class="kv"><span style="display:flex;align-items:center;gap:8px"><img src="${logoUrl(x.id)}" alt="" style="width:20px;height:20px;object-fit:contain">${esc(teamName(x.id))}</span><span class="mono">${x.n}</span></div>`).join('') || '<div class="sub">—</div>'}</div></div>
        <div class="panel panel-pad"><div class="disp h3" style="margin-bottom:10px">Streaming services</div><div class="stack" style="gap:6px">${d.topServices.map(x => `<div class="kv"><span>${esc(SERVICES[x.id]?.name || x.id)}</span><span class="mono">${x.n}</span></div>`).join('') || '<div class="sub">—</div>'}</div></div>
      </aside>
    </div>`;
}
