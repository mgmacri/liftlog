import { PROGRAM, REASONS } from './program.js';

const LS_KEY = 'liftlog.v1';
const GH_KEY = 'liftlog.gh';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const blank = () => ({
  version: 1,
  updatedAt: 0,
  startDate: PROGRAM.startDate,
  startSet: false,
  workouts: [],
  deleted: [],
  offsets: {},
  acc: {},
  dismissed: [],
  active: null,
  settings: { restMain: 180, restFail: 300, restAcc: 90, bar: PROGRAM.bar, plates: [...PROGRAM.plates] },
  selectedSessionKey: 'upperA',
  selectedDate: new Date().toLocaleDateString('en-CA'),
});

function normalize(s) {
  const base = blank();
  if (!s || s.version !== 1) return base;
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  if (!out.startSet) out.startDate = PROGRAM.startDate;
  if (!out.selectedSessionKey) out.selectedSessionKey = 'upperA';
  if (!out.selectedDate) out.selectedDate = new Date().toLocaleDateString('en-CA');
  return out;
}

function readLS(k) {
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}
function writeLS(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ }
}

let state = normalize(readLS(LS_KEY));
let gh = { branch: 'main', path: 'liftlog.json', ...(readLS(GH_KEY) || {}) };
let view = 'today';
let syncMsg = '';
let flash = [];
const openWarm = new Set();

const todayStr = () => new Date().toLocaleDateString('en-CA');
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => parseD(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dayDiff = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const NW = PROGRAM.weeks.length;
const weekIndexFor = (d) => Math.floor(dayDiff(state.startDate, d) / 7);
const clampWeek = (i) => Math.max(0, Math.min(NW - 1, i));
const blockOf = (wi) => Math.floor(wi / 4);
const sessionKeys = Object.keys(PROGRAM.sessions);
const sessionFor = (d) => {
  const n = dayDiff(state.startDate, d);
  return n < 0 ? null : PROGRAM.cycle[n % PROGRAM.cycle.length];
};

const DEFS = {};
for (const s of Object.values(PROGRAM.sessions)) {
  for (const e of s.exercises) DEFS[e.key] = e;
}
const REASON = Object.fromEntries(REASONS.map((r) => [r.key, r]));
const LIFT_NAME = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
const step = () => 2 * Math.min(...state.settings.plates);
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function save(push = false) {
  state.updatedAt = Date.now();
  writeLS(LS_KEY, state);
  if (push) schedulePush();
}

function mainRx(lift, wi) {
  const w = PROGRAM.weeks[wi];
  const [sets, reps, base] = lift === 'deadlift' ? w.dl : w.sb;
  const off = (state.offsets[lift] || {})[blockOf(wi)] || 0;
  return { sets, reps, weight: base + off, rir: w.rir };
}
function accRx(def, wi) {
  const w = PROGRAM.weeks[wi];
  const light = w.deload || w.test;
  return {
    sets: light ? Math.ceil(def.sets / 2) : def.sets,
    lo: def.lo,
    hi: def.hi,
    rir: light ? 4 : w.rir,
    weight: def.bw ? 0 : (state.acc[def.key]?.weight ?? def.start ?? null),
  };
}
function rxText(def, wi) {
  if (def.type === 'main') {
    const r = mainRx(def.lift, wi);
    return `${r.sets}×${r.reps} @ ${r.weight}`;
  }
  const r = accRx(def, wi);
  const range = r.lo === r.hi ? r.lo : `${r.lo}–${r.hi}`;
  return `${r.sets}×${range}${def.perSide ? '/side' : ''}${def.bw ? '' : r.weight != null ? ` @ ${r.weight}` : ''}`;
}

function newWorkout(sessionKey, date, wi) {
  const s = PROGRAM.sessions[sessionKey];
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date,
    week: wi + 1,
    session: sessionKey,
    startedAt: Date.now(),
    exercises: s.exercises.map((def) => {
      if (def.type === 'main') {
        const rx = mainRx(def.lift, wi);
        const amrap = rx.reps === 'AMRAP';
        return {
          key: def.key,
          type: 'main',
          lift: def.lift,
          weight: rx.weight,
          rxWeight: rx.weight,
          amrap,
          sets: Array.from({ length: rx.sets }, () => ({ target: amrap ? null : rx.reps, reps: null })),
          rir: null,
          targetRir: rx.rir,
          reason: null,
          note: '',
          dropped: false,
        };
      }
      const rx = accRx(def, wi);
      return {
        key: def.key,
        type: 'acc',
        weight: rx.weight,
        lo: rx.lo,
        hi: rx.hi,
        sets: Array.from({ length: rx.sets }, () => ({ target: rx.hi, reps: null })),
        rir: null,
        targetRir: rx.rir,
        reason: null,
        note: '',
      };
    }),
  };
}

function setFailed(ex, s) {
  if (s.reps == null) return false;
  return ex.type === 'main' ? !ex.amrap && s.reps < s.target : s.reps < ex.lo;
}
function exStatus(ex) {
  const done = ex.sets.filter((s) => s.reps != null);
  if (!done.length) return 'pending';
  if (done.length < ex.sets.length) return 'partial';
  if (ex.type === 'main') return ex.amrap ? 'done' : ex.sets.every((s) => s.reps >= s.target) ? 'success' : 'fail';
  if (ex.sets.every((s) => s.reps >= ex.hi)) return 'top';
  return ex.sets.every((s) => s.reps >= ex.lo) ? 'success' : 'fail';
}
const e1rm = (w, r) => (r > 0 ? w * (1 + r / 30) : 0);
const bestE1 = (ex) => Math.max(0, ...ex.sets.map((s) => e1rm(ex.weight || 0, s.reps || 0)));

let timer = null; let tick = null; let actx = null;
function ensureAudio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { /* no audio */ }
}
function beep() {
  if (!actx) return;
  [0, 0.25, 0.5].forEach((t) => {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.frequency.value = 880; g.gain.value = 0.2;
    o.connect(g); g.connect(actx.destination);
    o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.15);
  });
}
function startTimer(sec) {
  ensureAudio();
  timer = { end: Date.now() + sec * 1000, beeped: false };
  if (!tick) tick = setInterval(drawTimer, 250);
  drawTimer();
}
function drawTimer() {
  const el = $('#timer');
  if (!timer) { el.hidden = true; return; }
  el.hidden = false;
  const rem = Math.round((timer.end - Date.now()) / 1000);
  const over = rem < 0;
  el.querySelector('.t').textContent = (over ? '+' : '') + mmss(Math.abs(rem));
  el.classList.toggle('over', over);
  if (over && !timer.beeped) { timer.beeped = true; beep(); navigator.vibrate?.([200, 100, 200]); }
}

const ghReady = () => gh.owner && gh.repo && gh.token && gh.path;
const b64enc = (s) => { let bin = ''; new TextEncoder().encode(s).forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin); };
const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const ghUrl = () => `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/contents/${gh.path.split('/').map(encodeURIComponent).join('/')}`;
const ghHeaders = (accept = 'application/vnd.github+json') => ({ Authorization: `Bearer ${gh.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' });

async function ghGet() {
  const r = await fetch(`${ghUrl()}?ref=${encodeURIComponent(gh.branch)}`, { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  let text = j.content ? b64dec(j.content) : '';
  if (!text) {
    const raw = await fetch(`${ghUrl()}?ref=${encodeURIComponent(gh.branch)}`, { headers: ghHeaders('application/vnd.github.raw'), cache: 'no-store' });
    text = await raw.text();
  }
  return { sha: j.sha, data: text ? JSON.parse(text) : null };
}
async function ghPut(sha) {
  const body = { message: `liftlog: ${new Date().toISOString()}`, content: b64enc(JSON.stringify(state, null, 1)), branch: gh.branch };
  if (sha) body.sha = sha;
  const r = await fetch(ghUrl(), { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const e = new Error(`GitHub ${r.status}`); e.status = r.status; throw e; }
}
function merge(local, remote) {
  if (!remote || remote.version !== 1) return local;
  const del = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
  const byId = new Map();
  for (const w of remote.workouts || []) byId.set(w.id, w);
  for (const w of local.workouts || []) {
    const r = byId.get(w.id);
    if (!r || (w.finishedAt || 0) >= (r.finishedAt || 0)) byId.set(w.id, w);
  }
  const newer = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  return normalize({
    ...newer,
    deleted: [...del],
    dismissed: [...new Set([...(local.dismissed || []), ...(remote.dismissed || [])])],
    workouts: [...byId.values()].filter((w) => !del.has(w.id)).sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt),
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
  });
}
function setSync(m) { syncMsg = m; const el = $('#sync'); if (el) el.textContent = m; }
let pushTimer = null;
function schedulePush() { if (!ghReady()) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500); }
async function push() {
  if (!ghReady()) return;
  setSync('Saving…');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { sha, data } = await ghGet();
      if (data) { state = merge(state, data); writeLS(LS_KEY, state); }
      await ghPut(sha);
      setSync(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
      return;
    } catch (e) {
      if (e.status === 409 && attempt === 0) continue;
      setSync(`Sync failed: ${e.message}`);
      return;
    }
  }
}
async function pull() {
  if (!ghReady()) return;
  setSync('Loading…');
  try {
    const { data } = await ghGet();
    if (data) { state = merge(state, data); writeLS(LS_KEY, state); }
    setSync(data ? 'Synced' : 'No log file yet; first save creates it');
    render();
  } catch (e) { setSync(`Sync failed: ${e.message}`); }
}

function liftEntries(pred) {
  const out = [];
  for (const w of [...state.workouts].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)) {
    for (const ex of w.exercises) if (pred(ex)) out.push({ ...ex, date: w.date, week: w.week, status: ex.status || exStatus(ex), wid: w.id });
  }
  return out;
}
function diagnose(all) {
  const entries = all.filter((e) => e.status !== 'pending');
  const fails = entries.filter((e) => e.status === 'fail');
  if (!entries.length) return { cls: '', text: 'No data yet' };
  if (!fails.length) return { cls: 'good', text: 'On track: no failed sessions' };
  const c = { program: 0, recovery: 0, technique: 0, none: 0 };
  for (const f of fails) c[f.reason ? REASON[f.reason]?.side || 'none' : 'none']++;
  const n = fails.length;
  if (c.none === n) return { cls: 'warn', text: `${n} failed session${n > 1 ? 's' : ''}, no reason logged. Tag failures to diagnose.` };
  if (c.program >= c.recovery && c.program >= c.technique) return { cls: 'bad', text: `Program side: ${c.program}/${n} failures were load. The prescription is ahead of you.` };
  if (c.recovery >= c.technique) return { cls: 'warn', text: `You side: ${c.recovery}/${n} failures were recovery. Fix sleep, food, symptoms before cutting load.` };
  return { cls: 'warn', text: `Technique: ${c.technique}/${n} failures. Hold the load and film a set.` };
}
function suggestions() {
  const out = [];
  const st = step();
  for (const lift of ['squat', 'bench', 'deadlift']) {
    const hist = liftEntries((ex) => ex.lift === lift);
    for (let b = 0; b < 3; b++) {
      const loading = [b * 4 + 1, b * 4 + 2, b * 4 + 3];
      const es = hist.filter((h) => loading.includes(h.week));
      if (!es.length) continue;
      const fails = es.filter((h) => h.status === 'fail');
      if (b < 2) {
        const last = es.filter((h) => h.week === b * 4 + 3).at(-1);
        if (last && last.status === 'success' && last.rir != null && last.rir >= 3) {
          out.push({ id: `up:${lift}:${b + 1}`, text: `${LIFT_NAME[lift]}: week ${b * 4 + 3} last set was RIR ${last.rir === 4 ? '4+' : last.rir}. Rule: add ${st} lb to all of block ${b + 2}.`, apply: { lift, block: b + 1, delta: st } });
        }
      }
      const recent = es.slice(-2);
      if (recent.length === 2 && recent.every((h) => h.status === 'fail' && h.reason === 'heavy')) {
        out.push({ id: `now:${lift}:${b}:${recent[1].wid}`, text: `${LIFT_NAME[lift]}: last two sessions failed as too heavy. Drop ${st} lb for the rest of block ${b + 1}.`, apply: { lift, block: b, delta: -st } });
      } else if (b < 2 && fails.length >= 2) {
        const rec = fails.filter((h) => REASON[h.reason]?.side === 'recovery').length;
        const prog = fails.filter((h) => h.reason === 'heavy').length;
        if (rec > prog) out.push({ id: `rec:${lift}:${b}`, text: `${LIFT_NAME[lift]}: ${fails.length} failed sessions in block ${b + 1}, mostly recovery. Keep block ${b + 2} as written; fix recovery instead.`, apply: null });
        else out.push({ id: `down:${lift}:${b + 1}`, text: `${LIFT_NAME[lift]}: failed ${fails.length} of ${es.length} loading sessions in block ${b + 1}. Drop block ${b + 2} by ${st} lb.`, apply: { lift, block: b + 1, delta: -st } });
      }
    }
  }
  for (const [key, a] of Object.entries(state.acc)) {
    const def = DEFS[key];
    if (def && (a.fails || 0) >= 3 && a.weight) {
      const nw = Math.max(0, Math.round(a.weight * 0.9 / (def.inc || 5)) * (def.inc || 5));
      out.push({ id: `acc:${key}:${a.weight}:${a.fails}`, text: `${def.name}: missed the bottom of the range ${a.fails} sessions running. Deload 10% to ${nw} lb.`, applyAcc: { key, weight: nw } });
    }
  }
  return out.filter((s) => !state.dismissed.includes(s.id));
}
function adherence() {
  const t = todayStr();
  let sched = 0;
  for (let d = state.startDate; d < t; d = addDays(d, 1)) if (sessionFor(d)) sched++;
  const done = new Set(state.workouts.filter((w) => w.date >= state.startDate && w.date < t).map((w) => w.date)).size;
  return { sched, done };
}

const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;
const fmtRir = (r) => (r >= 4 ? '4+' : String(r));

function todayView() {
  const selectedKey = state.selectedSessionKey || 'upperA';
  const selectedDate = state.selectedDate || todayStr();
  const currentSession = PROGRAM.sessions[selectedKey];
  const wi = weekIndexFor(selectedDate);
  const sk = sessionFor(selectedDate);
  let status = 'Workout selected manually';

  if (currentSession) {
    if (wi < 0) status = `Program starts ${fmtDate(state.startDate)}.`;
    else if (wi >= NW) status = 'Program complete.';
    else {
      const w = PROGRAM.weeks[wi];
      status = `Week ${wi + 1} of ${NW} · Day ${(dayDiff(state.startDate, selectedDate) % 7) + 1} · Block ${blockOf(wi) + 1}${w.deload ? ' · Deload' : ''}${w.test ? ' · Test' : ''}`;
    }
  }

  const doneToday = state.workouts.filter((w) => w.date === selectedDate && w.session === selectedKey);
  let html = '';
  if (flash.length) html += card(`<h2>Saved</h2><ul>${flash.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><button class="ghost sm" data-a="clearflash">Dismiss</button>`, 'flash');
  html += card(`
    <p class="eyebrow">${esc(fmtDate(selectedDate))}</p>
    <label class="field">Workout day
      <select data-c="sessionChoice" aria-label="Workout day">
        ${sessionKeys.map((key) => `<option value="${key}" ${selectedKey === key ? 'selected' : ''}>${esc(PROGRAM.sessions[key].name)}</option>`).join('')}
      </select>
    </label>
    <h1>${esc(currentSession?.name || 'Rest day')}</h1>
    <p class="muted">${esc(status)}</p>
    ${doneToday.length ? `<p class="good">Logged ${doneToday.length} session${doneToday.length > 1 ? 's' : ''} for this workout</p>` : ''}
  `);

  if (currentSession && !doneToday.length) {
    const wk = clampWeek(wi);
    html += card(`
      <ol class="preview">${currentSession.exercises.map((def) => `<li><span>${esc(def.name)}</span><span class="muted">${esc(rxText(def, wk))}</span></li>`).join('')}</ol>
      <button class="primary" data-a="start">Start ${esc(currentSession.name)}</button>
    `);
  } else if (currentSession) {
    html += card(`<p class="muted">This workout is already logged for the selected day.</p>`);
  }

  return html;
}

function nextSession(d) {
  for (let i = 1; i <= PROGRAM.cycle.length; i++) {
    const date = addDays(d, i);
    const k = sessionFor(date);
    if (k) return { session: k, date };
  }
  return null;
}
function warmups(ex) {
  const W = ex.weight; const b = state.settings.bar;
  const first = ex.lift === 'deadlift' ? [Math.min(135, W), 5] : [b, 10];
  const out = [first];
  for (const [p, r] of [[0.4, 5], [0.6, 3], [0.8, 2]]) {
    const x = W <= b ? b : b + Math.floor((W - b) / step()) * step();
    if (x > out.at(-1)[0] && x < W) out.push([x, r]);
  }
  return out.filter(([x]) => x < W);
}

function exCard(ex, i) {
  const def = DEFS[ex.key];
  const st = exStatus(ex);
  const rx = ex.type === 'main'
    ? (ex.amrap ? '1 set, max reps (stop at RIR 1)' : `${ex.sets.length}×${ex.sets[0].target}`)
    : `${ex.sets.length}×${ex.lo === ex.hi ? ex.lo : `${ex.lo}–${ex.hi}`}${def.perSide ? '/side' : ''}`;
  const wt = def.bw ? '<span class="wt bw">Bodyweight</span>'
    : `<button class="wt" data-a="weight" data-i="${i}" aria-label="Edit weight for ${esc(def.name)}">${ex.weight == null ? 'Set weight' : `${ex.weight} lb`}</button>`;
  const plates = def.barbell && ex.weight != null ? `<p class="plates">${esc(plateText(ex.weight))}</p>` : '';
  const warm = ex.type === 'main'
    ? `<button class="link" data-a="warm" data-i="${i}" aria-expanded="${openWarm.has(i)}">Warm-up ${openWarm.has(i) ? '▴' : '▾'}</button>${openWarm.has(i) ? `<ul class="warm">${warmups(ex).map((w) => `<li>${w[0]} lb × ${w[1]}</li>`).join('')}</ul>` : ''}`
    : '';
  const sets = ex.sets.map((s, j) => {
    const cls = s.reps == null ? '' : setFailed(ex, s) ? 'fail' : 'ok';
    const label = s.reps == null ? (s.target ?? '?') : s.reps;
    return `<button class="set ${cls}" data-a="set" data-i="${i}" data-j="${j}" aria-label="Set ${j + 1}: ${s.reps == null ? 'not logged' : `${s.reps} reps`}">${label}</button>`;
  }).join('');
  const rir = `<div class="row"><span class="lbl">Last-set RIR <small>target ${fmtRir(ex.targetRir)}</small></span><div class="chips">${[0, 1, 2, 3, 4].map((v) => `<button class="chip ${ex.rir == v ? 'on' : ''}" data-a="rir" data-i="${i}" data-v="${v}">${fmtRir(v)}</button>`).join('')}</div></div>`;
  const anyFail = ex.sets.some((s) => setFailed(ex, s));
  const reasons = anyFail ? `<div class="row"><span class="lbl">Why did it fail?</span><div class="chips">${REASONS.map((r) => `<button class="chip ${ex.reason === r.key ? 'on' : ''}" data-a="reason" data-i="${i}" data-v="${r.key}">${esc(r.label)}</button>`).join('')}</div></div>` : '';
  const a = state.acc[ex.key];
  const hint = ex.type === 'acc' && a?.fails ? `<p class="warn">Missed range ${a.fails} session${a.fails > 1 ? 's' : ''} running</p>` : '';
  const tools = `<div class="row tools">${ex.type === 'main' ? `<button class="ghost sm" data-a="drop" data-i="${i}">−${step()} lb today</button>` : ''}${ex.dropped ? `<span class="tag">Preset</span>` : ''}</div>`;
  return `<article class="card ex st-${st}">
    <header><div><h3>${esc(def.name)}</h3><p class="muted">${esc(rx)} · RIR ${fmtRir(ex.targetRir)}</p></div>${wt}</header>
    ${plates}${warm}${hint}
    <div class="sets">${sets}</div>
    ${rir}${reasons}${tools}
  </article>`;
}
function plateText(w) {
  const b = state.settings.bar;
  if (w < b) return '';
  let side = (w - b) / 2;
  if (side === 0) return 'Empty bar';
  const out = [];
  for (const p of [...state.settings.plates].sort((x, y) => y - x)) while (side >= p - 1e-9) { out.push(p); side -= p; }
  return `${out.join(' + ')} per side${side > 0.01 ? ` (${side} lb short: not loadable)` : ''}`;
}
function workoutView() {
  const w = state.active;
  const s = PROGRAM.sessions[w.session];
  const wk = PROGRAM.weeks[w.week - 1];
  return `${card(`<p class="eyebrow">${esc(fmtDate(w.date))} · Week ${w.week}${wk.deload ? ' · Deload' : ''}${wk.test ? ' · Test' : ''}</p><h1>${esc(s.name)}</h1><p class="muted">Tap a set when you log reps.</p>
    ${w.exercises.map(exCard).join('')}
    <div class="finish"><button class="primary" data-a="finish">Finish workout</button><button class="ghost" data-a="cancel">Discard</button></div>`)} `;
}

function historyView() {
  const ws = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
  if (!ws.length) return card('<h2>History</h2><p class="muted">No workouts logged yet.</p>');
  return `<h2 class="pagetitle">History</h2>${ws.map((w) => {
    const fails = w.exercises.filter((e) => (e.status || exStatus(e)) === 'fail').length;
    return `<details class="card"><summary><span><b>${esc(fmtDate(w.date))}</b> · ${esc(PROGRAM.sessions[w.session]?.name || w.session)} · W${w.week}</span><span class="badge ${fails ? 'bad' : 'good'}">${fails ? fails : '0'} fail${fails === 1 ? '' : 's'}</span></summary>
      <table class="hist"><tbody>${w.exercises.map((e) => {
        const def = DEFS[e.key] || { name: e.key };
        const stt = e.status || exStatus(e);
        return `<tr class="st-${stt}"><td>${esc(def.name)}${e.note ? `<br><small class="muted">${esc(e.note)}</small>` : ''}</td><td>${def.bw ? 'BW' : e.weight ?? '–'}</td><td>${e.sets.map((s) => s.reps == null ? '–' : s.reps).join(' / ')}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="muted">${w.durationMin != null ? `${w.durationMin} min` : ''}</p>
      <button class="ghost sm danger" data-a="delw" data-id="${esc(w.id)}">Delete workout</button></details>`;
  }).join('')}`;
}

function chart(points) {
  if (points.length < 2) return '<p class="muted">Chart appears after two sessions.</p>';
  const W = 320; const H = 110; const P = 8;
  const ys = points.map((p) => p.y); const lo = Math.min(...ys); const hi = Math.max(...ys); const span = hi - lo || 1;
  const xy = points.map((p, i) => [P + (i * (W - 2 * P)) / (points.length - 1), H - P - ((p.y - lo) * (H - 2 * P)) / span]);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated 1RM from ${Math.round(points[0].y)} to ${Math.round(points.at(-1).y)} lb">
    <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${xy.map((p) => p.join(',')).join(' ')}"/>
    ${xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="var(--accent)"/>`).join('')}
  </svg><p class="muted small">e1RM ${Math.round(points[0].y)} → ${Math.round(points.at(-1).y)} lb (${points[0].d} to ${points.at(-1).d})</p>`;
}

function insightsView() {
  const sug = suggestions();
  const ad = adherence();
  let html = '<h2 class="pagetitle">Insights</h2>';
  html += card(`<h3>Adjustments</h3>${sug.length ? sug.map((s) => `<div class="sug"><p>${esc(s.text)}</p>${s.apply || s.applyAcc ? `<button class="primary sm" data-a="apply" data-id="${esc(s.id)}">Apply</button>` : ''}</div>`).join('') : '<p class="muted">No adjustments to apply.</p>'}`);
  html += card(`<h3>Adherence</h3><p>${ad.done} of ${ad.sched} scheduled sessions logged since ${esc(fmtDate(state.startDate))}.</p>`);
  for (const lift of ['squat', 'bench', 'deadlift']) {
    const es = liftEntries((ex) => ex.lift === lift);
    const dg = diagnose(es);
    html += card(`<h3>${LIFT_NAME[lift]}</h3><p class="${dg.cls}">${esc(dg.text)}</p>${chart(es.map((e) => ({ y: bestE1(e), d: e.date })).filter((p) => p.y > 0))}`);
  }
  return html;
}

function settingsView() {
  const s = state.settings;
  return `<h2 class="pagetitle">Settings</h2>
  ${card(`<h3>Program</h3><label>Day 1 of week 1<input type="date" data-c="startDate" value="${esc(state.startDate)}"></label>`)}
  ${card(`<h3>Rest timer (seconds)</h3><div class="grid3"><label>Main<input type="number" inputmode="numeric" data-c="restMain" value="${s.restMain}"></label><label>Main, failed<input type="number" inputmode="numeric" data-c="restFail" value="${s.restFail}"></label><label>Accessory<input type="number" inputmode="numeric" data-c="restAcc" value="${s.restAcc}"></label></div><label>Plates you own (lb, comma separated)<input data-c="plates" value="${esc(s.plates.join(', '))}"></label>`)}
  ${card(`<h3>GitHub sync</h3><form data-form="gh" class="grid2"><label>Owner<input name="owner" autocomplete="off" autocapitalize="off" value="${esc(gh.owner || '')}"></label><label>Repo<input name="repo" autocomplete="off" autocapitalize="off" value="${esc(gh.repo || '')}"></label><label>Branch<input name="branch" autocapitalize="off" value="${esc(gh.branch || 'main')}"></label><label>File path<input name="path" autocapitalize="off" value="${esc(gh.path || 'liftlog.json')}"></label><label class="full">Token<input name="token" type="password" autocomplete="off" value="${esc(gh.token || '')}"></label><button class="primary full" type="submit">Save and connect</button></form><div class="row"><button class="ghost sm" data-a="pull">Pull now</button><button class="ghost sm" data-a="push">Push now</button><button class="ghost sm danger" data-a="forget">Forget token</button></div>`)}
  ${card(`<h3>Data</h3><div class="row"><button class="ghost sm" data-a="export">Export JSON</button><label class="ghost sm filebtn">Import JSON<input type="file" accept="application/json,.json" data-c="import"></label></div><button class="ghost sm danger" data-a="wipe">Erase local data</button>`)} `;
}

function render() {
  const app = $('#app');
  let html;
  if (view === 'today') html = state.active ? workoutView() : todayView();
  else if (view === 'history') html = historyView();
  else if (view === 'insights') html = insightsView();
  else html = settingsView();
  app.innerHTML = html;
  document.querySelectorAll('nav [data-v]').forEach((b) => b.setAttribute('aria-current', b.dataset.v === view ? 'page' : 'false'));
  setSync(syncMsg);
}

function editWeight(i) {
  const ex = state.active.exercises[i];
  const v = prompt(`Weight for ${DEFS[ex.key].name} (lb)`, ex.weight ?? '');
  if (v === null || v.trim() === '') return false;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return false;
  ex.weight = n;
  return true;
}

function finishWorkout() {
  const w = state.active;
  const unlogged = w.exercises.some((e) => e.sets.some((s) => s.reps == null));
  if (unlogged && !confirm('Some sets are not logged. Unlogged exercises will not count toward progression. Finish anyway?')) return;
  const wk = PROGRAM.weeks[w.week - 1];
  const light = wk.deload || wk.test;
  w.finishedAt = Date.now();
  w.durationMin = Math.round((w.finishedAt - w.startedAt) / 60000);
  flash = [];
  for (const ex of w.exercises) {
    ex.status = exStatus(ex);
    const def = DEFS[ex.key];
    if (ex.type === 'main') {
      if (ex.status === 'fail') flash.push(`${def.name}: failed${ex.reason ? ` (${REASON[ex.reason].label})` : ', no reason tagged'}.`);
      if (ex.amrap && ex.status === 'done') { const best = Math.max(...ex.sets.map((s) => s.reps || 0)); flash.push(`${def.name}: ${best} reps @ ${ex.weight} → e1RM ${Math.round(e1rm(ex.weight, best))}.`); }
      continue;
    }
    if (def.bw || ex.weight == null || ex.status === 'pending' || ex.status === 'partial') continue;
    const a = state.acc[ex.key] || (state.acc[ex.key] = { weight: ex.weight, fails: 0 });
    a.weight = ex.weight;
    if (light) continue;
    if (ex.status === 'top' && def.inc) { a.weight = ex.weight + def.inc; a.fails = 0; flash.push(`${def.name}: top of range → ${a.weight} lb next time.`); }
    else if (ex.status === 'fail') { a.fails = (a.fails || 0) + 1; flash.push(`${def.name}: below range (${a.fails} in a row).`); }
    else a.fails = 0;
  }
  if (!flash.length) flash.push('Workout logged.');
  state.workouts.push(w);
  state.active = null;
  timer = null; drawTimer();
  save(true);
  view = 'today';
  render();
  window.scrollTo(0, 0);
}

const act = {
  nav: ({ v }) => { view = v; render(); window.scrollTo(0, 0); },
  start: () => {
    const key = state.selectedSessionKey || 'upperA';
    const date = state.selectedDate || todayStr();
    state.active = newWorkout(key, date, clampWeek(weekIndexFor(date)));
    flash = [];
    openWarm.clear();
    save();
    render();
    window.scrollTo(0, 0);
  },
  set: ({ i, j }) => {
    ensureAudio();
    const ex = state.active.exercises[+i]; const s = ex.sets[+j]; const def = DEFS[ex.key];
    if (!def.bw && ex.weight == null && !editWeight(+i)) return;
    const was = s.reps;
    if (ex.amrap) {
      const v = prompt('Reps completed?', s.reps ?? '');
      if (v === null) return;
      const n = parseInt(v, 10);
      s.reps = Number.isFinite(n) && n >= 0 ? n : null;
    } else s.reps = s.reps == null ? s.target : s.reps > 0 ? s.reps - 1 : null;
    if (s.reps != null && (was == null || setFailed(ex, s))) {
      startTimer(ex.type === 'main' ? (setFailed(ex, s) ? state.settings.restFail : state.settings.restMain) : state.settings.restAcc);
    }
    if (!ex.sets.some((x) => setFailed(ex, x))) ex.reason = null;
    save(); render();
  },
  weight: ({ i }) => { if (editWeight(+i)) { save(); render(); } },
  rir: ({ i, v }) => { const ex = state.active.exercises[+i]; ex.rir = ex.rir === +v ? null : +v; save(); render(); },
  reason: ({ i, v }) => { const ex = state.active.exercises[+i]; ex.reason = ex.reason === v ? null : v; save(); render(); },
  drop: ({ i }) => { const ex = state.active.exercises[+i]; ex.weight = Math.max(state.settings.bar, ex.weight - step()); ex.dropped = true; save(); render(); },
  note: ({ i }) => { const ex = state.active.exercises[+i]; const v = prompt('Note', ex.note || ''); if (v !== null) { ex.note = v.trim(); save(); render(); } },
  warm: ({ i }) => { const n = +i; if (openWarm.has(n)) openWarm.delete(n); else openWarm.add(n); render(); },
  finish: finishWorkout,
  cancel: () => { if (confirm('Discard this workout? Logged sets will be lost.')) { state.active = null; timer = null; drawTimer(); save(); render(); } },
  clearflash: () => { flash = []; render(); },
  tplus: () => { if (timer) { timer.end += 30000; timer.beeped = false; drawTimer(); } },
  tminus: () => { if (timer) { timer.end -= 30000; drawTimer(); } },
  tskip: () => { timer = null; drawTimer(); },
  apply: ({ id }) => {
    const s = suggestions().find((x) => x.id === id);
    if (!s) return;
    if (s.apply) { const { lift, block, delta } = s.apply; state.offsets[lift] = state.offsets[lift] || {}; state.offsets[lift][block] = (state.offsets[lift][block] || 0) + delta; }
    if (s.applyAcc) { const a = state.acc[s.applyAcc.key]; a.weight = s.applyAcc.weight; a.fails = 0; }
    state.dismissed.push(id);
    save(true); render();
  },
  dismiss: ({ id }) => { state.dismissed.push(id); save(true); render(); },
  delw: ({ id }) => {
    if (!confirm('Delete this workout permanently?')) return;
    state.workouts = state.workouts.filter((w) => w.id !== id);
    state.deleted.push(id);
    save(true); render();
  },
  off: ({ l, b, d }) => { state.offsets[l] = state.offsets[l] || {}; state.offsets[l][b] = (state.offsets[l][b] || 0) + Number(d) * step(); save(true); render(); },
  pull: () => pull(),
  push: () => push(),
  forget: () => { gh.token = ''; writeLS(GH_KEY, gh); setSync('Token removed'); render(); },
  export: () => {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `liftlog-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  wipe: () => { if (confirm('Erase all local data on this device? Synced data on GitHub is not touched.')) { state = blank(); writeLS(LS_KEY, state); render(); } },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const fn = act[t.dataset.a];
  if (fn) { e.preventDefault(); fn({ ...t.dataset }); }
});

document.addEventListener('change', async (e) => {
  const t = e.target.closest('[data-c]');
  if (!t) return;
  const c = t.dataset.c; const v = t.value;
  if (c === 'sessionChoice' && v) {
    state.selectedSessionKey = v;
    state.selectedDate = state.selectedDate || todayStr();
    save();
    render();
    return;
  }
  if (c === 'startDate' && v) {
    state.startDate = v;
    state.startSet = true;
    save(true);
    return;
  }
  if (['restMain', 'restFail', 'restAcc'].includes(c)) {
    const n = parseInt(v, 10);
    if (n > 0) { state.settings[c] = n; save(true); }
    return;
  }
  if (c === 'plates') {
    const p = v.split(',').map((x) => Number(x.trim())).filter((x) => x > 0);
    if (p.length) { state.settings.plates = p; save(true); render(); }
    return;
  }
  if (c === 'import' && t.files[0]) {
    try {
      const data = JSON.parse(await t.files[0].text());
      if (data.version !== 1) throw new Error('Not a LiftLog file');
      state = confirm('OK = merge with current data. Cancel = replace current data.') ? merge(state, data) : normalize(data);
      save(true); render();
    } catch (err) { alert(`Import failed: ${err.message}`); }
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form="gh"]');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  gh = { owner: fd.get('owner').trim(), repo: fd.get('repo').trim(), branch: fd.get('branch').trim() || 'main', path: fd.get('path').trim() || 'liftlog.json', token: fd.get('token').trim() };
  writeLS(GH_KEY, gh);
  pull().then(() => push());
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { drawTimer(); if (!state.active && view === 'today') render(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
pull();
