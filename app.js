import { SEED } from './program.js';

/* ============================================================================
 * SYNC CONFIG — fill these in after the one-time setup (see SYNC-SETUP.md).
 * Until both are set, the app runs fully local (no sign-in UI, no network).
 * Both values are public and safe to commit; the secret lives only in the Worker.
 * ========================================================================== */
const GH = {
  clientId: '',            // GitHub OAuth App "Client ID"
  workerUrl: '',           // deployed Worker URL, e.g. https://liftlog-oauth.<you>.workers.dev
  scope: 'gist',           // narrow: lets the app manage gists only
};
const SYNC_ENABLED = Boolean(GH.clientId && GH.workerUrl);

const LS_KEY = 'liftlog.v2';
const TOKEN_KEY = 'liftlog.gh.token';
const USER_KEY = 'liftlog.gh.user';
const GIST_KEY = 'liftlog.gh.gist';
const STATE_KEY = 'liftlog.oauth.state';
const GIST_FILE = 'liftlog-data.json';
const GIST_DESC = 'LiftLog workout data';
const REST = 120; // rest-timer seconds (fixed; starts when you complete a set)
const MODES = ['straight', 'ramp', 'pyramid'];
const MODE_LABEL = { straight: 'Straight', ramp: 'Ramp (down)', pyramid: 'Pyramid' };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id${Date.now()}${Math.random().toString(36).slice(2)}`);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const todayStr = () => new Date().toLocaleDateString('en-CA');
const nowTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/* ---------- storage ---------- */
function readLS() { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; } }
function writeLS() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* blocked */ } }
function save() { state.updatedAt = Date.now(); writeLS(); schedulePush(); }
const touch = (w) => { w.updatedAt = Date.now(); };

/* ---------- rep patterns ---------- */
// ramp decrements (12,10,8); pyramid rises to the middle then falls (8,10,8 / 8,10,10,8).
function genReps(mode, base, step, n) {
  base = Math.max(1, Math.round(base) || 1);
  step = Math.max(0, Math.round(step) || 0);
  n = clamp(Math.round(n) || 1, 1, 20);
  const out = [];
  for (let i = 0; i < n; i++) {
    let v = base;
    if (mode === 'ramp') v = base - step * i;
    else if (mode === 'pyramid') v = base + step * Math.min(i, n - 1 - i);
    out.push(Math.max(1, v));
  }
  return out;
}
function regen(ex, n = ex.sets.length) {
  ex.sets = genReps(ex.mode, ex.base, ex.step, n).map((t) => ({ target: t, reps: null }));
}
function makeExercise(s) {
  const ex = { id: uid(), name: s.name || '', mode: MODES.includes(s.mode) ? s.mode : 'straight', base: s.reps ?? 10, step: s.step ?? 2, weight: s.weight ?? null, sets: [] };
  regen(ex, s.sets ?? 3);
  return ex;
}
// Seed workouts use stable ids so sync can dedupe/merge them across devices.
function seedWorkouts() {
  return SEED.map((w, i) => ({ id: `seed-${i}`, name: w.name, updatedAt: 0, exercises: w.exercises.map(makeExercise) }));
}

/* ---------- state ---------- */
function fixWorkout(w) { return { updatedAt: 0, exercises: [], ...w }; }
function load() {
  const s = readLS();
  if (s && s.version === 2 && Array.isArray(s.workouts)) {
    return { version: 2, updatedAt: s.updatedAt || 0, workouts: s.workouts.map(fixWorkout), deleted: s.deleted || [], view: s.view || 'list', activeId: s.activeId || null };
  }
  return { version: 2, updatedAt: 0, workouts: seedWorkouts(), deleted: [], view: 'list', activeId: null };
}
let state = load();
const active = () => state.workouts.find((w) => w.id === state.activeId) || null;

/* ---------- sync: session ---------- */
let token = SYNC_ENABLED ? (localStorage.getItem(TOKEN_KEY) || null) : null;
let ghUser = localStorage.getItem(USER_KEY) || null;
let gistId = localStorage.getItem(GIST_KEY) || null;
let syncMsg = '';
const signedIn = () => Boolean(token);

function setSync(m) { syncMsg = m; renderAccount(); }
async function ghJson(method, url, body) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (r.status === 401) { signOut(true); throw new Error('session expired — sign in again'); }
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.status === 204 ? null : r.json();
}

/* ---------- sync: merge (per-workout last-writer-wins + tombstones) ---------- */
function serialize() {
  return JSON.stringify({ version: 2, updatedAt: state.updatedAt, workouts: state.workouts, deleted: state.deleted }, null, 1);
}
function mergeState(local, remote) {
  if (!remote || remote.version !== 2 || !Array.isArray(remote.workouts)) return local;
  const del = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
  const byId = new Map();
  for (const w of remote.workouts) byId.set(w.id, fixWorkout(w));
  for (const w of local.workouts) {
    const r = byId.get(w.id);
    if (!r || (w.updatedAt || 0) >= (r.updatedAt || 0)) byId.set(w.id, w);
  }
  const workouts = [...byId.values()].filter((w) => !del.has(w.id));
  return { ...local, workouts, deleted: [...del], updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0) };
}

/* ---------- sync: gist I/O ---------- */
async function gistContent(g) {
  const f = g.files && g.files[GIST_FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  try { return JSON.parse(text); } catch { return null; }
}
async function ensureGist() {
  if (gistId) {
    try { await ghJson('GET', `https://api.github.com/gists/${gistId}`); return; }
    catch { gistId = null; try { localStorage.removeItem(GIST_KEY); } catch { /* */ } }
  }
  const list = await ghJson('GET', 'https://api.github.com/gists?per_page=100');
  const found = (list || []).find((g) => g.files && g.files[GIST_FILE]);
  if (found) gistId = found.id;
  else {
    const created = await ghJson('POST', 'https://api.github.com/gists', { description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: serialize() } } });
    gistId = created.id;
  }
  try { localStorage.setItem(GIST_KEY, gistId); } catch { /* */ }
}
async function pullMerge() {
  if (!signedIn() || !gistId) return false;
  const remote = await gistContent(await ghJson('GET', `https://api.github.com/gists/${gistId}`));
  if (remote) { state = mergeState(state, remote); writeLS(); return true; }
  return false;
}

let pushTimer = null;
function schedulePush() { if (!signedIn() || !gistId) return; clearTimeout(pushTimer); pushTimer = setTimeout(doPush, 1500); }
async function doPush() {
  if (!signedIn() || !gistId) return;
  setSync('Saving…');
  try {
    await pullMerge(); // fold in any remote changes before overwriting (cross-device safety)
    await ghJson('PATCH', `https://api.github.com/gists/${gistId}`, { files: { [GIST_FILE]: { content: serialize() } } });
    setSync(`Synced ${nowTime()}`);
    if (state.view === 'list') render(); // refresh merged list without disrupting an edit/run
  } catch (e) { setSync(`Sync failed: ${e.message}`); }
}

/* ---------- sync: auth flow ---------- */
function signIn() {
  const st = uid();
  try { sessionStorage.setItem(STATE_KEY, st); } catch { /* */ }
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', GH.clientId);
  u.searchParams.set('scope', GH.scope);
  u.searchParams.set('state', st);
  u.searchParams.set('redirect_uri', location.origin + location.pathname);
  location.assign(u.toString());
}
function signOut(silent) {
  token = null; ghUser = null; gistId = null;
  for (const k of [TOKEN_KEY, USER_KEY, GIST_KEY]) { try { localStorage.removeItem(k); } catch { /* */ } }
  if (!silent) setSync('Signed out');
  renderAccount();
}
async function handleOAuthRedirect() {
  const p = new URLSearchParams(location.search);
  const code = p.get('code');
  const st = p.get('state');
  if (!code) return false;
  let saved = null;
  try { saved = sessionStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY); } catch { /* */ }
  history.replaceState({}, '', location.origin + location.pathname); // strip code/state from URL
  if (!st || st !== saved) { setSync('Sign-in failed (state mismatch)'); return true; }
  setSync('Signing in…');
  try {
    const r = await fetch(GH.workerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await r.json();
    if (!data.access_token) throw new Error(data.error_description || data.error || 'no token returned');
    token = data.access_token;
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* */ }
    await finishSync(true);
  } catch (e) { setSync(`Sign-in failed: ${e.message}`); }
  return true;
}
async function finishSync(firstTime) {
  try {
    if (!ghUser) { const me = await ghJson('GET', 'https://api.github.com/user'); ghUser = me.login; try { localStorage.setItem(USER_KEY, ghUser); } catch { /* */ } }
    await ensureGist();
    await pullMerge();
    render(); renderAccount();
    if (firstTime) await doPush(); else setSync(`Synced ${nowTime()}`);
  } catch (e) { setSync(`Sync failed: ${e.message}`); render(); }
}

/* ---------- export (CSV, opens in Excel) ---------- */
function csvCell(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function exportCsv() {
  const rows = [['Workout', 'Exercise', 'Mode', 'Set', 'Target reps', 'Weight (lb)', 'Logged reps']];
  for (const w of state.workouts) for (const ex of w.exercises) ex.sets.forEach((s, j) => rows.push([w.name, ex.name, ex.mode, j + 1, s.target, ex.weight ?? '', s.reps ?? '']));
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `liftlog-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- rest timer ---------- */
let timer = null; let tick = null; let actx = null;
function ensureAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { /* */ } }
function beep() {
  if (!actx) return;
  [0, 0.25, 0.5].forEach((t) => {
    const o = actx.createOscillator(); const g = actx.createGain();
    o.frequency.value = 880; g.gain.value = 0.2;
    o.connect(g); g.connect(actx.destination);
    o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.15);
  });
}
function startTimer(sec = REST) {
  ensureAudio();
  timer = { end: Date.now() + sec * 1000, beeped: false };
  if (!tick) tick = setInterval(drawTimer, 250);
  drawTimer();
}
function drawTimer() {
  const el = $('#timer');
  if (!el) return;
  if (!timer) { el.hidden = true; return; }
  el.hidden = false;
  const rem = Math.round((timer.end - Date.now()) / 1000);
  const over = rem < 0;
  el.querySelector('.t').textContent = (over ? '+' : '') + mmss(Math.abs(rem));
  el.classList.toggle('over', over);
  if (over && !timer.beeped) { timer.beeped = true; beep(); navigator.vibrate?.([200, 100, 200]); }
}

/* ---------- views ---------- */
const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;
const totalSets = (w) => w.exercises.reduce((n, e) => n + e.sets.length, 0);
const repsSummary = (ex) => {
  const t = ex.sets.map((s) => s.target);
  const uniq = [...new Set(t)];
  return uniq.length === 1 ? `${t.length}×${uniq[0]}` : t.join(', ');
};

function renderAccount() {
  const el = $('#account');
  if (!el) return;
  if (!SYNC_ENABLED) { el.innerHTML = ''; return; }
  if (signedIn()) {
    el.innerHTML = `<span id="sync" class="sync">${esc(syncMsg || 'Synced')}</span><button class="linkbtn" data-a="signout">@${esc(ghUser || 'me')} · sign out</button>`;
  } else {
    el.innerHTML = `<button class="linkbtn" data-a="signin">Sign in with GitHub</button>`;
  }
}

function listView() {
  let html = '<h1 class="pagetitle">Workouts</h1>';
  if (SYNC_ENABLED && !signedIn()) {
    html += card('<p>Sign in with GitHub to sync your workouts across devices. Your data is stored in a private Gist in your own account.</p><button class="primary" data-a="signin">Sign in with GitHub</button>');
  }
  if (!state.workouts.length) html += card('<p class="muted">No workouts yet. Create one to get started.</p>');
  html += state.workouts.map((w) => card(`
    <div class="worow"><div>
      <h3>${esc(w.name || 'Untitled')}</h3>
      <p class="muted">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${totalSets(w)} sets</p>
    </div></div>
    <div class="row">
      <button class="primary sm" data-a="run" data-id="${w.id}">Run</button>
      <button class="ghost sm" data-a="edit" data-id="${w.id}">Edit</button>
      <button class="ghost sm danger" data-a="delWorkout" data-id="${w.id}">Delete</button>
    </div>`)).join('');
  html += `<button class="primary" data-a="newWorkout">New workout</button>`;
  html += `<button class="ghost" data-a="export">Export CSV (Excel)</button>`;
  return html;
}

function setButton(ex, i, j) {
  const s = ex.sets[j];
  const cls = s.reps == null ? '' : s.reps === 0 ? 'zero' : 'done';
  const label = s.reps == null ? s.target : s.reps;
  const desc = s.reps == null ? `target ${s.target} reps` : `${s.reps} reps logged`;
  return `<button class="set ${cls}" data-a="set" data-i="${i}" data-j="${j}" aria-label="Set ${j + 1}, ${desc}">${label}</button>`;
}

function runView() {
  const w = active();
  if (!w) { state.view = 'list'; return listView(); }
  let html = card(`
    <p class="eyebrow">Running</p>
    <h1>${esc(w.name || 'Untitled')}</h1>
    <p class="muted">Tap a set to log it, again to count down. Long-press to zero it.</p>
    <div class="row">
      <button class="ghost sm" data-a="edit" data-id="${w.id}">Edit</button>
      <button class="ghost sm" data-a="reset">Reset sets</button>
      <button class="ghost sm" data-a="back">Done</button>
    </div>`);
  if (!w.exercises.length) html += card('<p class="muted">No exercises yet. Tap Edit to add some.</p>');
  html += w.exercises.map((ex, i) => card(`
    <header class="exhead">
      <div><h3>${esc(ex.name || 'Exercise')}</h3><p class="muted">${esc(repsSummary(ex))} reps${ex.mode !== 'straight' ? ` · ${MODE_LABEL[ex.mode].toLowerCase()}` : ''}</p></div>
      <button class="wt" data-a="weight" data-i="${i}" aria-label="Edit weight for ${esc(ex.name)}">${ex.weight == null ? 'Set weight' : `${ex.weight} lb`}</button>
    </header>
    <div class="sets">${ex.sets.map((_, j) => setButton(ex, i, j)).join('')}</div>`, 'ex')).join('');
  return html;
}

function editExercise(ex, i) {
  const n = ex.sets.length;
  const baseLabel = ex.mode === 'straight' ? 'Reps' : 'First set reps';
  return card(`
    <input class="exname" data-c="exName" data-i="${i}" value="${esc(ex.name)}" placeholder="Exercise name" aria-label="Exercise name">
    <div class="cfg">
      <label>Sets<input type="number" inputmode="numeric" min="1" max="20" data-c="exCount" data-i="${i}" value="${n}"></label>
      <label>Mode<select data-c="exMode" data-i="${i}">${MODES.map((m) => `<option value="${m}" ${ex.mode === m ? 'selected' : ''}>${MODE_LABEL[m]}</option>`).join('')}</select></label>
      <label>${baseLabel}<input type="number" inputmode="numeric" min="1" data-c="exBase" data-i="${i}" value="${ex.base}"></label>
      ${ex.mode === 'straight' ? '' : `<label>Step<input type="number" inputmode="numeric" min="0" data-c="exStep" data-i="${i}" value="${ex.step}"></label>`}
      <label>Weight (lb)<input type="number" inputmode="decimal" min="0" data-c="exWeight" data-i="${i}" value="${ex.weight ?? ''}" placeholder="—"></label>
    </div>
    <div class="targets"><span class="lbl">Reps per set — tap any to override</span>
      <div class="tgtrow">${ex.sets.map((s, j) => `<button class="tgt" data-a="editTarget" data-i="${i}" data-j="${j}" aria-label="Set ${j + 1} reps, ${s.target}">${s.target}</button>`).join('')}</div>
    </div>
    <button class="link danger" data-a="delEx" data-i="${i}">Remove exercise</button>`);
}

function editView() {
  const w = active();
  if (!w) { state.view = 'list'; return listView(); }
  let html = card(`
    <p class="eyebrow">Editing</p>
    <label>Workout name<input data-c="woName" value="${esc(w.name)}" placeholder="Workout name"></label>
    <div class="row">
      <button class="ghost sm" data-a="run" data-id="${w.id}">Run</button>
      <button class="ghost sm" data-a="back">Done</button>
    </div>`);
  html += w.exercises.map(editExercise).join('');
  html += card(`<button class="primary" data-a="addEx">Add exercise</button>`);
  html += card(`<button class="ghost danger" data-a="delWorkout" data-id="${w.id}">Delete this workout</button>`);
  return html;
}

function render() {
  const app = $('#app');
  if (state.view === 'run') app.innerHTML = runView();
  else if (state.view === 'edit') app.innerHTML = editView();
  else app.innerHTML = listView();
  drawTimer();
  renderAccount();
}

/* ---------- set interaction (tap + long-press) ---------- */
function tapSet(i, j) {
  const w = active(); if (!w) return;
  const ex = w.exercises[i]; const s = ex.sets[j];
  const was = s.reps;
  s.reps = s.reps == null ? s.target : s.reps > 0 ? s.reps - 1 : null;
  if (was == null && s.reps != null) startTimer();
  touch(w); save(); render();
}
function zeroSet(i, j) {
  const w = active(); if (!w) return;
  w.exercises[i].sets[j].reps = 0;
  touch(w); save(); render();
}

let pressTimer = null;
let suppressClick = false;
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('.set');
  if (!t) return;
  suppressClick = false;
  const i = +t.dataset.i; const j = +t.dataset.j;
  pressTimer = setTimeout(() => { pressTimer = null; suppressClick = true; zeroSet(i, j); }, 500);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
  document.addEventListener(ev, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }));
document.addEventListener('contextmenu', (e) => { if (e.target.closest('.set')) e.preventDefault(); });

/* ---------- actions ---------- */
const nav = (view, id) => { if (id) state.activeId = id; state.view = view; writeLS(); render(); window.scrollTo(0, 0); };
const act = {
  signin: () => signIn(),
  signout: () => { if (confirm('Sign out? Your data stays in your Gist and on this device.')) signOut(); },
  export: () => exportCsv(),
  newWorkout: () => { const w = { id: uid(), name: 'New workout', updatedAt: Date.now(), exercises: [] }; state.workouts.push(w); state.activeId = w.id; state.view = 'edit'; save(); render(); window.scrollTo(0, 0); },
  run: ({ id }) => nav('run', id),
  edit: ({ id }) => nav('edit', id),
  back: () => { timer = null; drawTimer(); nav('list'); state.activeId = null; writeLS(); },
  reset: () => { const w = active(); if (!w) return; for (const ex of w.exercises) for (const s of ex.sets) s.reps = null; timer = null; touch(w); save(); render(); },
  delWorkout: ({ id }) => {
    const w = state.workouts.find((x) => x.id === id);
    if (!w || !confirm(`Delete "${w.name || 'this workout'}"?`)) return;
    state.workouts = state.workouts.filter((x) => x.id !== id);
    if (!state.deleted.includes(id)) state.deleted.push(id);
    if (state.activeId === id) { state.activeId = null; state.view = 'list'; }
    save(); render();
  },
  addEx: () => { const w = active(); if (!w) return; w.exercises.push(makeExercise({ name: '', sets: 3, reps: 10 })); touch(w); save(); render(); },
  delEx: ({ i }) => { const w = active(); if (!w) return; w.exercises.splice(+i, 1); touch(w); save(); render(); },
  editTarget: ({ i, j }) => {
    const w = active(); if (!w) return;
    const s = w.exercises[+i].sets[+j];
    const v = prompt(`Reps for set ${+j + 1}`, s.target);
    if (v === null) return;
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 1) { s.target = n; touch(w); save(); render(); }
  },
  weight: ({ i }) => {
    const w = active(); if (!w) return;
    const ex = w.exercises[+i];
    const v = prompt(`Weight for ${ex.name || 'exercise'} (lb)`, ex.weight ?? '');
    if (v === null) return;
    const t = v.trim();
    if (t === '') { ex.weight = null; touch(w); save(); render(); return; }
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) { ex.weight = n; touch(w); save(); render(); }
  },
  set: ({ i, j }) => { if (suppressClick) { suppressClick = false; return; } ensureAudio(); tapSet(+i, +j); },
  tplus: () => { if (timer) { timer.end += 30000; timer.beeped = false; drawTimer(); } },
  tminus: () => { if (timer) { timer.end -= 30000; drawTimer(); } },
  tskip: () => { timer = null; drawTimer(); },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const fn = act[t.dataset.a];
  if (fn) { e.preventDefault(); fn({ ...t.dataset }); }
});

document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-c]');
  if (!t) return;
  const c = t.dataset.c; const v = t.value; const i = +t.dataset.i;
  const w = active();
  if (c === 'woName') { if (w) { w.name = v; touch(w); save(); } return; }
  if (!w || !w.exercises[i]) return;
  const ex = w.exercises[i];
  if (c === 'exName') { ex.name = v; touch(w); save(); return; }
  if (c === 'exMode') { ex.mode = MODES.includes(v) ? v : 'straight'; regen(ex); touch(w); save(); render(); return; }
  if (c === 'exBase') { ex.base = clamp(Math.round(Number(v)) || 1, 1, 999); regen(ex); touch(w); save(); render(); return; }
  if (c === 'exStep') { ex.step = clamp(Math.round(Number(v)) || 0, 0, 99); regen(ex); touch(w); save(); render(); return; }
  if (c === 'exCount') { regen(ex, clamp(Math.round(Number(v)) || 1, 1, 20)); touch(w); save(); render(); return; }
  if (c === 'exWeight') {
    const s = v.trim();
    ex.weight = s === '' ? null : (Number.isFinite(Number(s)) && Number(s) >= 0 ? Number(s) : ex.weight);
    touch(w); save();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  drawTimer();
  if (signedIn() && state.view === 'list') pullMerge().then((changed) => { if (changed) render(); }).catch(() => {});
});

/* ---------- boot ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
if (SYNC_ENABLED) {
  handleOAuthRedirect().then((wasRedirect) => { if (!wasRedirect && signedIn()) finishSync(false); });
}
