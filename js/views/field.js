// Live game → "Field": a 3D-projected field showing the ball spot, first-down line and the last play animated
// (runs along the turf, passes and kicks arc through the air). Plain SVG so it works everywhere, iOS included.
// Layout follows the TV graphic: the offense's end zone is on the left and it drives to the right.
import { esc } from '../ui.js';

const FW = 53.3; // field width in yards
let lastAnimated = null; // play id we last animated, so refreshes don't replay the same play

export function renderField(g, sum) {
  if (g.state !== 'in') return null;
  const drive = sum?.drives?.current;
  const plays = drive?.plays || [];
  const sit = g.situation?.raw || null; // scoreboard situation: yardLine is yards from the HOME goal line; lastPlay carries headshots
  let play = plays[plays.length - 1] || null;
  const sp = sit?.lastPlay;
  if (sp && sp.id && sp.end?.yardLine != null && (!play || Number(sp.id) > Number(play.id))) play = { id: sp.id, text: sp.text, type: sp.type, statYardage: sp.statYardage, scoringPlay: sp.scoreValue > 0, start: { team: sp.start?.team, yardLine: sp.start?.yardLine }, end: { team: sp.end?.team, yardLine: sp.end?.yardLine, down: sit.down, distance: sit.distance, shortDownDistanceText: sit.shortDownDistanceText, possessionText: sit.possessionText }, athletes: sp.athletesInvolved };
  const heads = (sp?.id === play?.id ? sp?.athletesInvolved : null) || play?.athletes || [];
  const offId = String(play?.end?.team?.id || play?.start?.team?.id || drive?.team?.id || g.situation?.possession || '');
  const off = offId === g.home.id ? g.home : offId === g.away.id ? g.away : null;
  if (!off) return null;
  const dir = off === g.away ? 1 : -1; // away drives left→right
  // Absolute position (0..120, end zones included) from "yards to the end zone" the offense is attacking.
  const uFromYTE = yte => yte == null ? null : (dir > 0 ? 110 - yte : 10 + yte);
  const uFromText = txt => { const m = /([A-Z&]+)\s+(\d{1,2})$/.exec(txt || ''); if (!m) return /50/.test(txt || '') ? 60 : null; const y = Number(m[2]); const abbr = m[1]; if (abbr === g.away.abbr) return 10 + y; if (abbr === g.home.abbr) return 110 - y; return null; };
  const spot = node => node ? (uFromYTE(node.yardsToEndzone) ?? (node.yardLine != null ? 110 - node.yardLine : null) ?? uFromText(node.possessionText || node.text)) : null;
  let u1 = spot(play?.end) ?? (sit?.yardLine != null ? 110 - sit.yardLine : null) ?? uFromText(sit?.possessionText) ?? null;
  let u0 = spot(play?.start);
  if (u0 == null && u1 != null && play?.statYardage != null) u0 = u1 - dir * play.statYardage;
  if (u1 == null && u0 != null && play?.statYardage != null) u1 = u0 + dir * play.statYardage;
  if (u1 == null) return null;
  if (u0 == null) u0 = u1;
  const clamp = v => Math.max(0, Math.min(120, v));
  u0 = clamp(u0); u1 = clamp(u1);
  const dist = play?.end?.distance ?? sit?.distance ?? null;
  const uFD = dist != null && play?.end?.down > 0 ? clamp(u1 + dir * dist) : null;
  const text = (play?.text || g.situation?.lastPlay || '').trim();
  const ptext = text.replace(/^\s*(\([^)]*\)\s*)+/, ''); // drop "(Shotgun)" / "(No Huddle, Shotgun)" prefixes before reading names
  const ptype = (play?.type?.text || '').toLowerCase() + ' ' + text.toLowerCase();
  const kind = /pass|sack|interception/.test(ptype) ? 'pass' : /punt|kickoff|field goal|kick/.test(ptype) ? 'kick' : 'run';
  const incomplete = /incomplete/.test(ptype);
  const scoring = !!play?.scoringPlay || /touchdown/.test(ptype);
  // Names off the play text: "D. Moore pass complete to E. Stewart for 26 yds" / "J.Hurts pass short right to A.Brown for 32 yards".
  let p1 = '', p2 = '';
  if (kind === 'pass') { const m = /^(.+?) pass(?:.*?) to (.+?)(?: for| \(|,|\.$|$)/.exec(ptext); if (m) { p1 = m[1]; p2 = m[2]; } else { const s = /^(.+?) (?:pass|sacked)/.exec(ptext); if (s) p1 = s[1]; } }
  else if (kind === 'run') { const m = /^(.+?) (?:run|rush|scramble|left|right|up the middle)/i.exec(ptext); if (m) p1 = m[1]; }
  else { const m = /^(.+?) (?:punt|kick|field goal)/i.exec(ptext); if (m) p1 = m[1]; }
  const abbrevName = n => n.length > 14 ? n.slice(0, 13) + '…' : n;
  const lastName = n => (n || '').replace(/^.*[.\s]/, '').toLowerCase();
  const headOf = n => { const ln = lastName(n); const a = heads.find(x => lastName(x.shortName || x.displayName) === ln) || (kind === 'pass' && n === p1 ? heads.find(x => x.position === 'QB') : null); return a?.headshot || ''; };
  const h1 = headOf(p1), h2 = headOf(p2);
  const headline = play?.type?.text ? `${play.statYardage != null && play.statYardage !== 0 ? Math.abs(play.statYardage) + '-yd ' : ''}${scoring && !/touchdown/i.test(play.type.text) ? play.type.text + ' · TD' : play.type.text}` : (g.situation?.text || 'Last play');
  const dd = play?.end?.shortDownDistanceText || play?.end?.downDistanceText || sit?.shortDownDistanceText || g.situation?.text || '';
  const spotTxt = play?.end?.possessionText || sit?.possessionText || '';
  const playId = play?.id || text;
  const animate = playId !== lastAnimated;
  lastAnimated = playId;
  const driveTxt = drive ? [drive.offensivePlays != null ? drive.offensivePlays + ' PLAYS' : '', drive.yards != null ? drive.yards + ' YDS' : '', drive.timeElapsed?.displayValue || ''].filter(Boolean).join(' · ') : '';

  // Broadcast orientation: the offense always drives left → right, so its own end zone is on the left.
  const mirror = u => u == null ? null : 120 - u;
  const opp = off === g.home ? g.away : g.home;
  const [L, R] = [off, opp];
  if (dir < 0) { u0 = mirror(u0); u1 = mirror(u1); }
  const uFDo = dir < 0 ? mirror(uFD) : uFD;
  const cfg = { u0, u1, uFD: uFDo, dir: 1, kind, incomplete, scoring, p1: abbrevName(p1).toUpperCase(), p2: abbrevName(p2).toUpperCase(), h1, h2, animate, off: { color: off.color, logo: off.logo }, redZone: [90, 110], away: { name: L.name, color: L.color, logo: L.logo }, home: { name: R.name, color: R.color, logo: R.logo } };
  const html = `<div class="panel field-panel" id="field-panel" data-cfg="${esc(JSON.stringify(cfg))}">
    <div class="fp-head"><div class="disp h3">Field</div><div class="sub">LIVE · ${esc(g.detail || '')} · ${esc(off.name.toUpperCase())} BALL</div><span class="dd">${esc([dd, spotTxt].filter(Boolean).join(' · ').toUpperCase())}</span></div>
    <svg class="field-svg" viewBox="0 0 860 330" id="field-svg"></svg>
    <div class="play"><img src="${esc(off.logo)}" alt=""><div><div class="t">${esc(headline)} <small>LAST PLAY</small></div><div class="d">${esc(text)}</div></div>${driveTxt ? `<div class="drive"><b>THIS DRIVE</b><br>${esc(driveTxt)}</div>` : ''}</div>
  </div>`;
  return { html, mount: mountField };
}

export function mountField(root) {
  const panel = root.querySelector('#field-panel'); if (!panel) return;
  const svg = panel.querySelector('#field-svg');
  const c = JSON.parse(panel.dataset.cfg);
  const A = c.away, B = c.home;
  const W = 860, TOP = 70, BOT = 300, CX = 430, SF = 560, SN = 840;
  const P = (u, v, h = 0) => { const s = SF + (SN - SF) * v; return [CX + (u / 120 - 0.5) * s, TOP + (BOT - TOP) * (v * v * .35 + v * .65) - h * (s / 120) * 1.6]; };
  const pt = (u, v, h) => P(u, v, h).map(n => n.toFixed(1)).join(',');
  const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(p => pt(...p)).join(' ')}" fill="${fill}" ${extra}/>`;
  const line = (a, b, st, w, extra = '') => { const [x1, y1] = P(...a), [x2, y2] = P(...b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${st}" stroke-width="${w}" ${extra}/>`; };
  let s = `<defs><linearGradient id="fsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>`;
  s += `<ellipse cx="${CX}" cy="${BOT + 8}" rx="440" ry="22" fill="#000" opacity=".5"/>`;
  for (let u = 10; u < 110; u += 5) s += poly([[u, 0], [u + 5, 0], [u + 5, 1], [u, 1]], ((u / 5) % 2 ? '#2b7638' : '#2f803e'));
  s += poly([[0, 0], [10, 0], [10, 1], [0, 1]], A.color); s += poly([[110, 0], [120, 0], [120, 1], [110, 1]], B.color);
  s += poly([[c.redZone[0], 0], [c.redZone[1], 0], [c.redZone[1], 1], [c.redZone[0], 1]], 'rgba(255,60,60,.13)');
  if (c.uFD != null) { const a = Math.min(c.u1, c.uFD), b = Math.max(c.u1, c.uFD); s += poly([[a, 0], [b, 0], [b, 1], [a, 1]], 'rgba(58,168,255,.18)'); }
  s += poly([[0, 0], [120, 0], [120, 1], [0, 1]], 'url(#fsh)');
  for (let u = 10; u <= 110; u += 5) s += line([u, 0], [u, 1], `rgba(255,255,255,${u % 10 ? '.35' : '.8'})`, u % 10 ? 1 : 1.6);
  for (let u = 11; u < 110; u++) for (const v of [.36, .64]) s += line([u, v - .02], [u, v + .02], 'rgba(255,255,255,.55)', 1);
  for (let u = 20; u <= 100; u += 10) { const n = u <= 60 ? u - 10 : 110 - u; for (const [v, rot] of [[.86, 0], [.14, 0]]) { const [x, y] = P(u, v); const sc = (SF + (SN - SF) * v) / SN; s += `<text x="${x}" y="${y}" font-family="Bebas Neue,Oswald,Arial Narrow,sans-serif" font-size="${22 * sc}" fill="rgba(255,255,255,.8)" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot} ${x} ${y})">${n}</text>`; } }
  for (const [t, u, d] of [[A, 5, -1], [B, 115, 1]]) {
    const [x, y] = P(u, .5);
    const vx = [0, 1].map(i => (P(u, d < 0 ? 0 : 1)[i] - P(u, d < 0 ? 1 : 0)[i]) / FW), vy = [0, 1].map(i => P(u - d, .5)[i] - P(u, .5)[i]);
    const name = (t.name || '').toUpperCase(), nat = name.length * 4.2;
    const m = `matrix(${vx[0]} ${vx[1]} ${vy[0]} ${vy[1]} ${x} ${y})`;
    s += `<image href="${esc(t.logo)}" x="-7.5" y="-7.5" width="15" height="15" opacity=".3" transform="${m}"/>`;
    s += `<text font-family="Bebas Neue,Oswald,Arial Narrow,sans-serif" font-size="7" fill="#fff" text-anchor="middle" dominant-baseline="middle" letter-spacing=".3" ${nat > 44 ? 'textLength="44" lengthAdjust="spacingAndGlyphs"' : ''} transform="${m}">${esc(name)}</text>`;
  }
  s += line([c.u1, 0], [c.u1, 1], '#3aa8ff', 3, 'style="filter:drop-shadow(0 0 6px #3aa8ff)"');
  if (c.uFD != null) s += line([c.uFD, 0], [c.uFD, 1], '#ffd400', 3, 'style="filter:drop-shadow(0 0 6px #ffd400)"');
  for (const u of [0, 120]) { const gc = '#ffd95e'; s += line([u, .5, 0], [u, .5, 3.3], gc, 3.5); s += line([u, .41, 3.3], [u, .59, 3.3], gc, 3); s += line([u, .41, 3.3], [u, .41, 10], gc, 2.5); s += line([u, .59, 3.3], [u, .59, 10], gc, 2.5); }
  s += poly([[0, 0], [120, 0], [120, 1], [0, 1]], 'none', 'stroke="rgba(255,255,255,.7)" stroke-width="2.5"');
  s += `<g id="field-dyn"></g>`;
  svg.innerHTML = s;

  // ---- last play animation
  const dyn = svg.querySelector('#field-dyn');
  const v = .5, u0 = c.u0, u1 = c.incomplete ? c.u0 + c.dir * 14 : c.u1, span = Math.abs(u1 - u0);
  const H = c.kind === 'kick' ? 12 : c.kind === 'pass' ? Math.min(8, 3 + span * .15) : 0;
  const DUR = c.kind === 'run' ? 600 + span * 30 : 1200 + span * 20;
  let clipN = 0;
  const pin = (u, label, o, head) => { const [x0, y0] = P(u, v, 0), [x1, y1] = P(u, v, 7); const id = 'fhc' + (clipN++); return `<g opacity="${o}"><ellipse cx="${x0}" cy="${y0}" rx="9" ry="4" fill="rgba(0,0,0,.5)"/><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#fff" stroke-width="2"/><circle cx="${x1}" cy="${y1 - 20}" r="22" fill="#fff" stroke="${c.off.color}" stroke-width="3"/>${head ? `<clipPath id="${id}"><circle cx="${x1}" cy="${y1 - 20}" r="20"/></clipPath><image href="${esc(head)}" x="${x1 - 26}" y="${y1 - 46}" width="52" height="52" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>` : `<image href="${esc(c.off.logo)}" x="${x1 - 16}" y="${y1 - 36}" width="32" height="32"/>`}${label ? `<rect x="${x1 - 34}" y="${y1 + 4}" width="68" height="14" rx="3" fill="rgba(0,0,0,.7)"/><text x="${x1}" y="${y1 + 14}" font-family="IBM Plex Mono,monospace" font-size="9" fill="#fff" text-anchor="middle" letter-spacing="1">${esc(label)}</text>` : ''}</g>`; };
  const ball = (u, h, rot) => { const [bx, by] = P(u, v, h); return `<g transform="translate(${bx} ${by}) rotate(${rot})"><ellipse rx="10" ry="6.5" fill="#8a4a1c" stroke="#f3d9b1" stroke-width="1"/><line x1="-4" y1="0" x2="4" y2="0" stroke="#fff" stroke-width="1.2"/></g>`; };
  const draw = (e, after) => {
    const u = u0 + (u1 - u0) * e, h = Math.sin(Math.PI * e) * H;
    const gp = [], ap = [];
    for (let i = 0; i <= 40; i++) { const k = i / 40 * e; gp.push(P(u0 + (u1 - u0) * k, v, 0)); if (H) ap.push(P(u0 + (u1 - u0) * k, v, Math.sin(Math.PI * k) * H)); }
    let d = `<polyline points="${gp.map(p => p.join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,${H ? '.55' : '.95'})" stroke-width="${H ? 2 : 3}" stroke-dasharray="${H ? '1 6' : '2 6'}" stroke-linecap="round"/>`;
    if (H) d += `<polyline points="${ap.map(p => p.join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round" opacity=".95"/>`;
    d += pin(u0, c.p1, 1, c.h1);
    if (e >= 1 && c.p2 && !c.incomplete) d += pin(u1, c.p2, Math.min(1, after / 300), c.h2);
    const [sx, sy] = P(u, v, 0);
    d += `<ellipse cx="${sx}" cy="${sy}" rx="${Math.max(3, 10 - h * .6)}" ry="${Math.max(1.5, 4 - h * .25)}" fill="rgba(0,0,0,.45)"/>`;
    if (e >= 1 && !c.incomplete) { const r = Math.min(1, after / 700); d += `<circle cx="${sx}" cy="${sy}" r="${8 + r * 50}" fill="none" stroke="${c.scoring ? '#ffd400' : '#fff'}" stroke-width="2" opacity="${1 - r}"/>`; }
    d += ball(u, c.incomplete && e >= 1 ? 0 : h, -20 + e * 40);
    dyn.innerHTML = d;
  };
  if (!c.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { draw(1, 1000); return; }
  const T0 = performance.now() + 400;
  const tick = now => {
    if (!svg.isConnected) return;
    const t = Math.min(1, Math.max(0, (now - T0) / DUR));
    const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    draw(e, Math.max(0, now - T0 - DUR));
    if (now - T0 - DUR < 1000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
