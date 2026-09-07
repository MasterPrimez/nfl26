// Layer 2: accounts + sync, backed by the Cloudflare Worker in /worker (D1 database).
// Works without an account: everything stays on-device until someone signs in; then the device copy and the
// account copy are merged and every change is saved to both.
import { state, onChange } from './state.js';
import { API_URL } from './config.js';

const TOKEN_KEY = 'nfl26.session.v1';
let user = null;
let token = null;
let pushTimer = null;
let applyingRemote = false;
let googleClientId = null;
let adminEmails = [];
const listeners = new Set();

export function onAuth(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function currentUser() { return user; }
export function authEnabled() { return !!API_URL; }
export function googleEnabled() { return !!googleClientId; }
export function isAdmin() { return !!user && adminEmails.includes(user.email); }
export async function fetchStats(password) { return api('POST', '/admin/stats', { password }); }
const notify = () => listeners.forEach(fn => fn(user));

async function api(method, path, body) {
  if (!API_URL) throw new Error('Accounts are not set up yet.');
  let r;
  try {
    r = await fetch(API_URL + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Could not reach the server. Check your connection.'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = r.status; throw e; }
  return data;
}

export async function initAuth() {
  if (!API_URL) { notify(); return; }
  try { token = localStorage.getItem(TOKEN_KEY); } catch {}
  api('GET', '/config').then(c => { googleClientId = c.googleClientId || null; adminEmails = c.adminEmails || []; notify(); }).catch(() => {});
  if (token) {
    try { user = (await api('GET', '/auth/me')).user; await pullAndMerge(); }
    catch (e) { if (e.status === 401) { token = null; try { localStorage.removeItem(TOKEN_KEY); } catch {} } }
  }
  notify();
  onChange(() => { if (user && !applyingRemote) schedulePush(); });
}

async function acceptSession(data) {
  token = data.token; user = data.user;
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  await pullAndMerge();
  notify();
}

export async function signUp(email, password) { await acceptSession(await api('POST', '/auth/signup', { email, password })); }
export async function signIn(email, password) { await acceptSession(await api('POST', '/auth/login', { email, password })); }
export async function signInWithGoogle(credential) { await acceptSession(await api('POST', '/auth/google', { credential })); }

export async function signOut() {
  try { if (token) await api('POST', '/auth/logout'); } catch {}
  token = null; user = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  notify();
}

// Google Identity Services button. Loads Google's script on demand; renders into `el`.
export function mountGoogleButton(el) {
  if (!googleClientId || !el) return;
  const render = () => {
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: async resp => { try { await signInWithGoogle(resp.credential); } catch (e) { el.insertAdjacentHTML('afterend', `<div class="sub down">${e.message}</div>`); } } });
    window.google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
  };
  if (window.google?.accounts?.id) return render();
  if (!document.getElementById('gsi-script')) { const s = document.createElement('script'); s.id = 'gsi-script'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = render; document.head.appendChild(s); }
  else document.getElementById('gsi-script').addEventListener('load', render);
}

async function pullAndMerge() {
  if (!user) return;
  let remote = null;
  try { remote = (await api('GET', '/prefs')).prefs; } catch (e) { console.warn('sync pull failed', e.message); return; }
  const merged = state.mergePrefs(remote);
  applyingRemote = true;
  try { state.importPrefs(merged); } finally { applyingRemote = false; }
  await push();
}

function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 800); }
async function push() {
  if (!user) return;
  try { await api('PUT', '/prefs', { prefs: state.prefs }); } catch (e) { console.warn('sync push failed', e.message); }
}
