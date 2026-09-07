// Network → how to watch. ESPN's feed only names the TV network; this map adds the streaming options.
// Each service: {id, name, url, tag}. tag: 'incl' = included with a subscription, 'free' = no login.

export const SERVICES = {
  espn:      { id: 'espn',      name: 'ESPN app',        url: 'https://www.espn.com/watch/',              domain: 'espn.com',          color: '#c8102e', ab: 'ESPN' },
  peacock:   { id: 'peacock',   name: 'Peacock',         url: 'https://www.peacocktv.com/sports/nfl',     domain: 'peacocktv.com',     color: '#000000', ab: 'P' },
  paramount: { id: 'paramount', name: 'Paramount+',      url: 'https://www.paramountplus.com/live-tv/',   domain: 'paramountplus.com', color: '#0064ff', ab: 'P+' },
  foxone:    { id: 'foxone',    name: 'FOX One',         url: 'https://www.foxone.com/',                  domain: 'foxone.com',        color: '#111111', ab: 'FOX' },
  prime:     { id: 'prime',     name: 'Prime Video',     url: 'https://www.amazon.com/tnf',               domain: 'primevideo.com',    color: '#00a8e1', ab: 'prime' },
  netflix:   { id: 'netflix',   name: 'Netflix',         url: 'https://www.netflix.com/nfl',              domain: 'netflix.com',       color: '#e50914', ab: 'N' },
  nflplus:   { id: 'nflplus',   name: 'NFL+',            url: 'https://www.nfl.com/plus/',                domain: 'nfl.com',           color: '#013369', ab: 'NFL+' },
  ticket:    { id: 'ticket',    name: 'NFL Sunday Ticket', url: 'https://tv.youtube.com/nfl-sunday-ticket/', domain: 'tv.youtube.com',  color: '#e62117', ab: 'ST' },
  yttv:      { id: 'yttv',      name: 'YouTube TV',      url: 'https://tv.youtube.com/',                  domain: 'tv.youtube.com',    color: '#e62117', ab: 'YT' },
  hulu:      { id: 'hulu',      name: 'Hulu + Live TV',  url: 'https://www.hulu.com/live-tv',             domain: 'hulu.com',          color: '#1ce783', ab: 'hulu', fg: '#0b0c0e' },
  fubo:      { id: 'fubo',      name: 'Fubo',            url: 'https://www.fubo.tv/',                     domain: 'fubo.tv',           color: '#fa4616', ab: 'fubo' },
  sling:     { id: 'sling',     name: 'Sling',           url: 'https://www.sling.com/',                   domain: 'sling.com',         color: '#0081ff', ab: 'sling' },
  directv:   { id: 'directv',   name: 'DIRECTV Stream',  url: 'https://stream.directv.com/',              domain: 'directv.com',       color: '#0a5fd8', ab: 'DTV' },
};

// TV networks → site whose icon represents them (for the broadcast mark on the game page).
const NETWORK_DOMAINS = [
  [/^ABC$/i, 'abc.com', '#ffffff', '#111111', 'abc'], [/^ESPN/i, 'espn.com', '#c8102e', '#ffffff', 'ESPN'], [/^CBS/i, 'cbs.com', '#0b57d0', '#ffffff', 'CBS'], [/^FOX/i, 'foxsports.com', '#111111', '#ffffff', 'FOX'],
  [/^NBC/i, 'nbc.com', '#111111', '#ffffff', 'NBC'], [/^Peacock/i, 'peacocktv.com', '#000000', '#ffffff', 'P'], [/^(Prime|Amazon)/i, 'primevideo.com', '#00a8e1', '#ffffff', 'prime'], [/^Netflix/i, 'netflix.com', '#e50914', '#ffffff', 'N'],
  [/^(NFL Network|NFLN|NFL Net)/i, 'nfl.com', '#013369', '#ffffff', 'NFLN'], [/^NFL\+/i, 'nfl.com', '#013369', '#ffffff', 'NFL+'], [/^(YouTube|YT)/i, 'youtube.com', '#e62117', '#ffffff', 'YT'],
];
export function networkMark(network, size = 44) {
  const m = NETWORK_DOMAINS.find(([re]) => re.test((network || '').trim()));
  const ab = m ? m[4] : (network || 'TBA').slice(0, 5);
  return markHtml({ domain: m?.[1], color: m?.[2] || '#23262c', fg: m?.[3] || '#e8e6e1', ab }, size);
}

// A service/network mark: brand-colored tile with initials, overlaid by the site's real icon when it loads.
// Icons come from the public favicon service at display time (no CORS needed for an <img>).
export function iconUrl(domain, sz = 64) { return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}` : ''; }
export function markHtml(s, size = 40) {
  const fs = s.ab.length > 3 ? Math.round(size * 0.26) : Math.round(size * 0.34);
  const img = s.domain ? `<img src="${iconUrl(s.domain, size >= 48 ? 128 : 64)}" alt="" loading="lazy" onerror="this.remove()" onload="this.parentNode.classList.add('has-icon')">` : '';
  return `<span class="mark" style="width:${size}px;height:${size}px;background:${s.color};color:${s.fg || '#ffffff'};font-size:${fs}px">${s.ab}${img}</span>`;
}

// Live-TV bundles that carry a given network (approximate; bundles change).
const BUNDLES_ALL = ['yttv', 'hulu', 'fubo', 'directv'];
const BUNDLES_ESPN = ['yttv', 'hulu', 'fubo', 'sling', 'directv'];
const BUNDLES_FOX = ['yttv', 'hulu', 'fubo', 'sling', 'directv'];
const BUNDLES_NFLN = ['yttv', 'fubo', 'sling', 'directv'];

// Primary streamer first, then bundles. NFL+ carries every local + primetime game on phones/tablets.
const MAP = [
  { re: /^(CBS)$/i,                                   primary: ['paramount', 'nflplus'], bundles: BUNDLES_ALL, ticket: true },
  { re: /^(FOX)$/i,                                   primary: ['foxone', 'nflplus'],    bundles: BUNDLES_FOX, ticket: true },
  { re: /^(NBC)$/i,                                   primary: ['peacock', 'nflplus'],   bundles: BUNDLES_ALL },
  { re: /^(Peacock)$/i,                               primary: ['peacock'],              bundles: [],           note: 'Streaming only' },
  { re: /^(ESPN|ESPN2|ABC)$/i,                        primary: ['espn', 'nflplus'],      bundles: BUNDLES_ESPN },
  { re: /^(ESPN\+)$/i,                                primary: ['espn'],                 bundles: [],           note: 'Streaming only' },
  { re: /^(Prime Video|Prime|Amazon Prime Video|Amazon)$/i, primary: ['prime'],          bundles: [],           note: 'Streaming only · free with Prime' },
  { re: /^(Netflix)$/i,                               primary: ['netflix'],              bundles: [],           note: 'Streaming only' },
  { re: /^(NFL Network|NFLN|NFL Net)$/i,              primary: ['nflplus'],              bundles: BUNDLES_NFLN },
  { re: /^(NFL\+)$/i,                                 primary: ['nflplus'],              bundles: [] },
  { re: /^(YouTube|YouTube TV)$/i,                    primary: ['yttv'],                 bundles: [],           note: 'Free on YouTube' },
];

export function watchOptions(networks) {
  const out = [];
  const seen = new Set();
  (networks || []).forEach(n => {
    const m = MAP.find(x => x.re.test(n.trim()));
    if (!m) return;
    m.primary.forEach(id => { if (!seen.has(id)) { seen.add(id); out.push({ ...SERVICES[id], kind: 'primary', via: n }); } });
    m.bundles.forEach(id => { if (!seen.has(id)) { seen.add(id); out.push({ ...SERVICES[id], kind: 'bundle', via: n }); } });
    if (m.ticket && !seen.has('ticket')) { seen.add('ticket'); out.push({ ...SERVICES.ticket, kind: 'bundle', via: n, note: 'Out-of-market Sunday afternoon games' }); }
  });
  return out;
}

// Short "Watch: …" string for cards. Prefers the user's own services.
export function watchSummary(networks, myServices) {
  const opts = watchOptions(networks);
  if (!opts.length) {
    if (!networks || !networks.length) return 'TBA';
    // Streaming-only feeds we don't map (MW+, UConn+, school networks) — name them.
    return 'Check local listings';
  }
  const mine = opts.filter(o => myServices.has(o.id));
  const pick = (mine.length ? mine : opts.filter(o => o.kind === 'primary')).slice(0, 2);
  const list = (pick.length ? pick : opts.slice(0, 2)).map(o => o.name).join(' · ');
  return list;
}

const DISPLAY = [[/^Amazon Prime Video$/i, 'Prime Video'], [/^NFL Network$/i, 'NFLN'], [/^NFL Net$/i, 'NFLN']];
export function displayNetwork(n) { const m = DISPLAY.find(([re]) => re.test(n)); return m ? m[1] : n; }
export function primaryNetwork(networks) {
  if (!networks || !networks.length) return '';
  return displayNetwork(networks[0]);
}

// Ordering + styling for the TV grid rows.
export const NETWORK_ORDER = ['CBS', 'FOX', 'NBC', 'ESPN', 'ABC', 'Prime Video', 'Netflix', 'NFL Network', 'NFLN', 'Peacock', 'ESPN+', 'ESPN2', 'YouTube', 'NFL+'];
export function networkClass(n) {
  if (/^(ESPN|ESPN2|ESPN\+|ABC)$/i.test(n)) return 'espn';
  if (/^(CBS|FOX|NBC)$/i.test(n)) return '';
  return 'minor';
}
