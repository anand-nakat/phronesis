/* Phronesis: UGC NET previous-year question practice, a static single-page app. Data: quiz-data.json. Progress: localStorage. */
'use strict';

const STORE_KEY = 'netpyq.v1';
const SUBJECTS = { '00': 'Paper 1', '03': 'Philosophy' };
const STATUS = {
  official: ['Official key', 'good'],
  official_multiple: ['Official key · several options accepted', 'good'],
  dropped: ['Dropped · marks to all', 'warn'],
  unofficial: ['Unofficial key', 'warn'],
  pending: ['No key · practice only', ''],
  unavailable: ['No key · practice only', ''],
};

let DB = null;          // { papers, byPaper, byQ, groups, units, images }
let store = loadStore();
let timerHandle = null;

/* ---------- storage ---------- */
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.attempts) return Object.assign({ bookmarks: {}, history: [], session: null, prefs: {} }, s);
  } catch (e) { /* fall through */ }
  return { attempts: {}, bookmarks: {}, history: [], session: null, prefs: {} };
}
// Ask the browser not to evict our storage under disk pressure (granted silently by Chrome/Edge for sites you use)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  catch (e) { console.warn('Could not save progress', e); }
}

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const app = () => $('#app');
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const yearOf = (p) => parseInt(p.session_key, 10);
const sortKey = (p) => (p.exam_date || p.session_key + '-00') + (p.shift || 0);
function subjectName(p) {
  if (p.full) return 'Full exam';
  if (p.subject_code === '00') return 'Paper 1';
  return p.conducted_by === 'CBSE' && p.original_paper ? `Philosophy · Paper ${p.original_paper}` : 'Philosophy';
}
function paperWhen(p) {
  return p.exam_date ? `${fmtDate(p.exam_date)}${p.shift ? ' · Shift ' + p.shift : ''}` : p.session_label;
}
function paperTitle(p) {
  return `${subjectName(p)} · ${paperWhen(p)}`;
}
function paperKey(p) {
  if (p.answered_count === 0) return ['No key', ''];
  if (p.key_partial) return ['Key for some sections only', 'warn'];
  return p.answer_key_official ? ['Official key', 'good'] : ['Unofficial key', 'warn'];
}
const scorable = (q) => q.answer_index != null && q.answer_status !== 'dropped';
function isCorrect(q, i) {
  return Array.isArray(q.answer_index) ? q.answer_index.includes(i) : q.answer_index === i;
}
function answerText(q) {
  const idx = Array.isArray(q.answer_index) ? q.answer_index : [q.answer_index];
  return idx.map((i) => `(${q.option_labels[i]})`).join(' or ');
}
/* ---------- icons (24px stroke icons, drawn here) ---------- */
const ICONS = {
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>', arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>', chevL: '<path d="M15 6l-6 6 6 6"/>',
  layers: '<path d="M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6"/>',
  book: '<path d="M2 5a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3v15a2 2 0 0 0-2-2H2zM22 5a2 2 0 0 0-2-2h-5a3 3 0 0 0-3 3v15a2 2 0 0 1 2-2h8z"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>', play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', minus: '<path d="M6 12h12"/>',
  alert: '<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>', flag: '<path d="M5 21V4h12l-2.5 4.5L17 13H5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 21h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  eraser: '<path d="M7 20h13M4.6 13.4l8.8-8.8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 18.0a2 2 0 0 1-1.4.6H8.2a2 2 0 0 1-1.4-.6l-2.2-2.2a2 2 0 0 1 0-2.8zM9 9l6 6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const metric = (icn, color, v, label) => `<div class="metric"><div class="ic ${color}">${ic(icn)}</div><div class="v">${v}</div><div class="l">${label}</div></div>`;

function unitName(code, u) { return DB.units[code]?.units[String(u)] || (u ? 'Unit ' + u : 'Untagged'); }
function plainText(md) { return md.replace(/\\([\\`*_{}\[\]()#+\-.!|~])/g, '$1').replace(/\|/g, ' ').replace(/[*`#>-]+/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

/* ---------- markdown (subset: paragraphs, pipe tables, lists, bold/italic/code, sub/sup/u) ---------- */
function mdInline(s) {
  const lit = [];
  let h = esc(String(s).replace(/\\([\\`*_{}\[\]()#+\-.!|~])/g, (m, c) => `\u0001${lit.push(c) - 1}\u0002`));
  h = h.replace(/&lt;(\/?)(sub|sup|u|b|i|em|strong)&gt;/g, '<$1$2>').replace(/&lt;br\s*\/?&gt;/g, '<br>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>');
  h = h.replace(/(\w)\*([A-Za-z])\*(?!\w)/g, '$1<em>$2</em>'); // logic notation like B*x*
  return h.replace(/\u0001(\d+)\u0002/g, (m, i) => esc(lit[+i]));
}
function mdTable(lines) {
  const split = (l) => l.replace(/\\\|/g, '\u0000').trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.replace(/\u0000/g, '|').trim());
  const isSep = (l) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  let head = null, body = lines;
  if (lines.length > 1 && isSep(lines[1])) { head = split(lines[0]); body = lines.slice(2); }
  let h = '<div class="tablewrap"><table>';
  if (head) h += '<thead><tr>' + head.map((c) => `<th>${mdInline(c)}</th>`).join('') + '</tr></thead>';
  h += '<tbody>' + body.filter((l) => !isSep(l)).map((l) => '<tr>' + split(l).map((c) => `<td>${mdInline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
  return h + '</table></div>';
}
function md(src) {
  const lines = String(src ?? '').split('\n');
  let out = '', para = [];
  const flush = () => { if (para.length) { out += '<p>' + para.map(mdInline).join('<br>') + '</p>'; para = []; } };
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { flush(); i++; continue; }
    if (/^\s*\|/.test(line)) {
      flush(); const t = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) t.push(lines[i++]);
      out += mdTable(t); continue;
    }
    if (/^\s*[-*] /.test(line)) {
      flush(); out += '<ul>';
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) out += `<li>${mdInline(lines[i++].replace(/^\s*[-*] /, ''))}</li>`;
      out += '</ul>'; continue;
    }
    if (/^\s*\d+[.)] /.test(line)) {
      flush(); out += '<ol>';
      while (i < lines.length && /^\s*\d+[.)] /.test(lines[i])) {
        const m = lines[i++].match(/^\s*(\d+)[.)] (.*)$/);
        out += `<li value="${m[1]}">${mdInline(m[2])}</li>`;
      }
      out += '</ol>'; continue;
    }
    para.push(line.replace(/\\\s*$/, '')); i++; // a trailing backslash is a Markdown hard line break
  }
  flush();
  return out;
}

/* ---------- data ---------- */
async function loadData() {
  const res = await fetch('quiz-data.json');
  if (!res.ok) throw new Error(`quiz-data.json: HTTP ${res.status}`);
  const raw = await res.json();
  const byPaper = {}, byQ = {}, groups = {};
  for (const p of raw.papers) {
    byPaper[p.paper_id] = p;
    for (const g of p.groups) groups[g.id] = g;
    for (const q of p.questions) { q.paper = p; byQ[q.id] = q; }
  }
  const papers = raw.papers.slice().sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || a.subject_code.localeCompare(b.subject_code));
  const fulls = buildFulls(papers);
  for (const f of fulls) byPaper[f.paper_id] = f;
  DB = { papers, fulls, byPaper, byQ, groups, units: raw.units, images: raw.images, cutoffs: raw.cutoffs || null };
}
// One combined attempt per Philosophy sitting: Paper 1 first, then Philosophy, as in the real exam.
// CBSE-era sessions join Paper I + II (+ III), which were sat separately on the same day.
function buildFulls(papers) {
  const sittings = {};
  for (const p of papers) {
    if (p.subject_code !== '03') continue;
    const k = [p.session_key, p.exam_date || '', p.shift || ''].join('|');
    (sittings[k] || (sittings[k] = [])).push(p);
  }
  const fulls = [];
  for (const phil of Object.values(sittings)) {
    const x = phil[0];
    const session = papers.filter((p) => p.subject_code === '00' && p.session_key === x.session_key);
    const p1 = session.find((p) => x.exam_date && p.exam_date === x.exam_date && p.shift === x.shift) || (session.length === 1 ? session[0] : null);
    if (!p1) continue;
    phil.sort((a, b) => String(a.original_paper).localeCompare(String(b.original_paper)));
    const parts = [p1, ...phil];
    const keyed = parts.filter((p) => p.answered_count > 0);
    fulls.push({
      full: true, parts, subject_code: 'full',
      paper_id: 'full-' + x.paper_id.replace(/^phil-/, '').replace(/-I+$/, ''),
      session_label: x.session_label, session_key: x.session_key, exam_date: x.exam_date, shift: x.shift, conducted_by: x.conducted_by,
      questions: parts.flatMap((p) => p.questions),
      answered_count: parts.reduce((n, p) => n + p.answered_count, 0),
      answer_key_official: keyed.length === parts.length && keyed.every((p) => p.answer_key_official),
      key_partial: keyed.length > 0 && keyed.length < parts.length,
    });
  }
  return fulls.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}
// Runs of consecutive questions from the same paper (the sections of a combined attempt)
function sectionsOf(s) {
  const out = [];
  s.qids.forEach((id, i) => {
    const paper = DB.byQ[id].paper, last = out[out.length - 1];
    if (last && last.paper === paper) last.ids.push(id); else out.push({ paper, start: i, ids: [id] });
  });
  return out;
}
const imgSrc = (path) => DB.images[path] || path;

/* ---------- in-app dialogs and toasts (instead of the browser's confirm/alert) ---------- */
function dialog({ title, body = '', ok = 'OK', cancel = null, tone = 'primary', icon = 'info' }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <span class="ic ichead ${tone === 'danger' ? 'red' : tone === 'warn' ? 'amber' : 'green'}">${ic(icon)}</span>
      <h3 id="mTitle">${title}</h3>${body ? `<p>${body}</p>` : ''}
      <div class="modal-actions">${cancel ? `<button class="btn" data-r="0">${cancel}</button>` : ''}<button class="btn ${tone === 'danger' ? 'danger-solid' : 'primary'}" data-r="1">${ok}</button></div></div>`;
    const btns = () => [...wrap.querySelectorAll('[data-r]')];
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Tab') { e.preventDefault(); const b = btns(), i = b.indexOf(document.activeElement); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus(); }
    };
    const close = (r) => {
      document.removeEventListener('keydown', onKey, true);
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 160);
      if (prev && prev.focus) prev.focus();
      resolve(r);
    };
    wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) close(b.dataset.r === '1'); else if (e.target === wrap) close(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="1"]').focus();
  });
}
const uiConfirm = (o) => dialog({ cancel: 'Cancel', ...o });
function toast(msg, tone = 'good') {
  const t = document.createElement('div');
  t.className = `toast ${tone}`;
  t.setAttribute('role', 'status');
  t.innerHTML = `${ic(tone === 'good' ? 'check' : tone === 'bad' || tone === 'warn' ? 'alert' : 'info')}<span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3600);
}

/* ---------- attempts ---------- */
function recordAttempt(q, choice) {
  const prev = store.attempts[q.id];
  store.attempts[q.id] = {
    a: choice, c: scorable(q) ? isCorrect(q, choice) : null,
    s: q.paper.subject_code, u: q.unit || 0, n: (prev?.n || 0) + 1, t: Date.now(),
  };
}

/* ---------- sessions ---------- */
function startSession(opts) {
  store.session = Object.assign({ idx: 0, answers: {}, marked: {}, revealed: {}, started: Date.now() }, opts);
  if (opts.kind === 'exam') store.session.endsAt = Date.now() + opts.minutes * 60000;
  save();
  location.hash = '#/quiz';
  if (location.hash === '#/quiz') render();
}
async function submitExam(auto) {
  const s = store.session;
  if (!s || s.kind !== 'exam' || s.submitted) return;
  if (!auto) {
    const left = s.qids.filter((id) => s.answers[id] == null).length;
    const markedN = s.qids.filter((id) => s.marked[id]).length;
    const ok = await uiConfirm({
      title: 'Submit the exam?', icon: 'flag', tone: left ? 'warn' : 'primary', ok: 'Submit', cancel: 'Keep going',
      body: (left ? `You have <strong>${left}</strong> unanswered question${left === 1 ? '' : 's'}` : `All ${s.qids.length} questions are answered`)
        + (markedN ? ` and ${markedN} marked for review` : '') + '. You can’t change answers after you submit.',
    });
    if (!ok || store.session !== s || s.submitted) return;
  }
  let correct = 0, wrong = 0, dropped = 0, unscored = 0;
  for (const id of s.qids) {
    const q = DB.byQ[id], a = s.answers[id];
    if (q.answer_status === 'dropped') { dropped++; continue; }
    if (!scorable(q)) { unscored++; continue; }
    if (a == null) continue;
    recordAttempt(q, a);
    isCorrect(q, a) ? correct++ : wrong++;
  }
  const marksOutOf = s.qids.length - unscored;
  s.submitted = true;
  s.result = { correct, wrong, dropped, unscored, total: s.qids.length, marks: correct + dropped, outOf: marksOutOf, secs: Math.round((Date.now() - s.started) / 1000) };
  s.qids.forEach((id) => (s.revealed[id] = true));
  store.history.unshift({ paperId: s.paperId, title: s.title, t: Date.now(), ...s.result, qids: s.qids.slice(), answers: { ...s.answers } });
  s.historyT = store.history[0].t;
  // keep full answer sheets for the 60 most recent exams; older ones keep only their score
  store.history.slice(60).forEach((h) => { delete h.qids; delete h.answers; });
  store.history = store.history.slice(0, 200);
  save();
  location.hash = '#/result';
}

/* ---------- section scores and JRF cut-offs ---------- */
// Marks per paper of an attempt (2 marks a question; dropped questions count as correct, as NTA does)
function sectionScores(qids, answers) {
  const out = [];
  for (const id of qids) {
    const q = DB.byQ[id]; if (!q) continue;
    let sec = out[out.length - 1];
    if (!sec || sec.paper !== q.paper) out.push(sec = { paper: q.paper, c: 0, w: 0, d: 0, n: 0, total: 0 });
    sec.total++;
    const a = answers[id];
    if (q.answer_status === 'dropped') { sec.d++; sec.n++; continue; }
    if (!scorable(q)) continue;
    sec.n++; if (a != null) isCorrect(q, a) ? sec.c++ : sec.w++;
  }
  for (const sec of out) {
    sec.got = (sec.c + sec.d) * 2; sec.max = sec.total * 2;
    // CBSE Paper I (2009 to Jan 2017): 60 questions, any 50 answered; only the first 50 answered are marked, out of 100
    if (sec.paper.conducted_by === 'CBSE' && sec.paper.subject_code === '00' && sec.total === 60) {
      let seen = 0, got = 0;
      for (const id of qids) {
        const q = DB.byQ[id]; if (!q || q.paper !== sec.paper || answers[id] == null) continue;
        if (++seen > 50) break;
        if (q.answer_status === 'dropped' || (scorable(q) && isCorrect(q, answers[id]))) got += 2;
      }
      sec.got = got; sec.max = 100; sec.cbse50 = true;
    }
  }
  return out;
}
const CATS = { GEN: 'General', EWS: 'EWS', OBC: 'OBC-NCL', SC: 'SC', ST: 'ST', PwD: 'PwD' };
function cutoffFor(p) {
  if (!DB.cutoffs || !p) return null;
  const phil = p.full ? p.parts.find((x) => x.subject_code === '03') : p.subject_code === '03' ? p : null;
  if (!phil) return null;
  const c = DB.cutoffs.cycles?.[phil.session_key];
  return c && c.jrf ? c : null;
}
// Card comparing a full-exam score with that cycle's Philosophy cut-offs. secs: sectionScores(); null = no score yet.
function cutoffPanel(p, secs) {
  const c = cutoffFor(p);
  if (!c) return '';
  const cats = Object.keys(CATS).filter((k) => c.jrf[k] != null);
  const cat = cats.includes(store.prefs.cat) ? store.prefs.cat : cats[0];
  const pctU = c.unit === 'percent';
  const fmt = (v) => (pctU ? `${v}%` : `${v}`);
  const phil = p.full ? p.parts.find((x) => x.subject_code === '03') : p;
  let mine = null, got = 0, max = 0, partial = false;
  if (secs && p.full) {
    got = secs.reduce((m, x) => m + x.got, 0);
    max = secs.reduce((m, x) => m + x.max, 0);
    partial = secs.some((x) => x.n < x.total);
    mine = pctU ? Math.round((1000 * got) / max) / 10 : got;
  }
  const unitWord = (d) => (pctU ? `${Math.round(d * 100) / 100} point${d === 1 ? '' : 's'}` : `${d} mark${d === 1 ? '' : 's'}`);
  const goal = (label, key) => {
    const v = c[key]?.[cat];
    if (v == null) return '';
    if (mine == null) return `<div class="goal"><div class="gring idle"><b>${fmt(v)}</b></div><div><div class="n">${label}</div><div class="c">${pctU ? `${fmt(v)} of aggregate marks` : `About ${Math.round((100 * v) / c.out_of)}% of ${c.out_of} marks`}</div></div></div>`;
    const met = mine >= v, p100 = Math.min(100, Math.round((100 * mine) / v));
    const diff = Math.round(Math.abs(mine - v) * 100) / 100;
    return `<div class="goal${met ? ' met' : ''}"><div class="gring" style="--p:${met ? 100 : p100};--c:${met ? 'var(--good)' : p100 >= 75 ? 'var(--accent)' : 'var(--warn)'}">${met ? ic('check') : `<b>${p100}%</b>`}</div>
      <div><div class="n">${label}</div><div class="c">Cut-off ${fmt(v)}</div><span class="pill ${met ? 'good' : 'warn'}">${met ? (diff ? `Cleared by ${unitWord(diff)}` : 'Exactly at the cut-off') : `${unitWord(diff)} to go`}</span></div></div>`;
  };
  const you = mine != null
    ? `<div class="b-you"><div class="l">Your total</div><div class="v">${pctU ? `${mine}<span>%</span>` : `${got}<span>/${max}</span>`}</div>
        <div class="split">${secs.map((x) => `${x.paper.subject_code === '00' ? 'Paper 1' : 'Paper ' + (x.paper.conducted_by === 'CBSE' && x.paper.original_paper ? x.paper.original_paper : 2)}: ${x.got}`).join(' · ')}${pctU ? ` · ${got}/${max} marks` : ''}</div></div>`
    : `<div class="b-you"><div class="l">${secs ? 'Cut-offs apply to the full exam' : 'Your target'}</div><div class="split" style="margin-top:.35rem">${secs ? 'Attempt Paper 1 and Philosophy together to see where you stand.' : 'Take this as a full exam to see how your total compares.'}</div></div>`;
  return `<div class="card cutoff">
    <div class="cx-head"><div><h3>Cut-offs · ${esc(phil.session_label)}</h3><div class="sub">Philosophy · ${pctU ? `percentage of aggregate marks (out of ${c.out_of})` : `Paper 1 + Paper 2, out of ${c.out_of}`}${c.source_type === 'secondary' ? ' · secondary source' : ''}</div></div>
      <label class="cat">Category <select id="cutCat">${cats.map((k) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${CATS[k]}</option>`).join('')}</select></label></div>
    <div class="b-grid">${you}${goal('Assistant Professor', 'net')}${goal('JRF', 'jrf')}</div>
    ${pctU && c.out_of === 350 ? '<p class="small muted">In this period CBSE also required minimum marks in each paper (General: 40% in Papers I and II, 50% in Paper III) before the aggregate cut-off applied.</p>' : ''}
    ${partial ? '<p class="small muted">Some questions had no answer key or were dropped; dropped questions count as correct, as in the real result.</p>' : ''}
    ${c.source_url ? `<p class="small" style="margin-bottom:0"><a href="${esc(c.source_url)}" target="_blank" rel="noopener">${c.source_type === 'official' ? 'Official cut-off notice' : 'Source'}</a></p>` : ''}</div>`;
}
function bindCutoff(rerender) {
  const sel = $('#cutCat');
  if (sel) sel.onchange = (e) => { store.prefs.cat = e.target.value; save(); rerender(); };
}
function sectionTiles(secs) {
  if (secs.length < 2) return '';
  const got = secs.reduce((m, x) => m + x.got, 0), max = secs.reduce((m, x) => m + x.max, 0);
  const tile = (label, sub, g, m) => `<div class="sect"><div class="l">${label}</div><div class="v">${g}<span>/${m}</span></div><div class="s">${sub}</div><div class="bar"><div style="width:${pct(g, m)}%;background:${pct(g, m) >= 60 ? 'var(--good)' : pct(g, m) >= 40 ? 'var(--warn)' : 'var(--bad)'}"></div></div></div>`;
  return `<div class="sections">${secs.map((x, i) => tile(
    x.paper.subject_code === '00' ? 'Paper 1' : `Paper ${x.paper.original_paper && x.paper.conducted_by === 'CBSE' ? x.paper.original_paper : 2}<span class="hide-sm"> · Philosophy</span>`,
    `${x.cbse50 ? 'First 50 answered count · ' : ''}${x.c} correct · ${x.w} wrong · ${x.total - x.c - x.w - x.d} blank${x.d ? ` · ${x.d} dropped` : ''}`, x.got, x.max)).join('')}
    ${tile('Total', `${pct(got, max)}% of ${max} marks`, got, max)}</div>`;
}

/* ---------- views ---------- */
function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

function resumeBanner() {
  const s = store.session;
  if (!s || s.submitted) return '';
  const done = Object.keys(s.answers).length;
  return `<div class="resume"><span class="ic">${ic(s.kind === 'exam' ? 'clock' : 'play')}</span>
    <div style="flex:1;min-width:0"><div class="t">${s.kind === 'exam' ? 'Exam in progress' : 'Continue practice'}</div>
      <div class="s">${esc(s.title)} · ${done}/${s.qids.length} answered</div></div>
    <div class="progress mini"><div style="width:${pct(done, s.qids.length)}%;background:var(--sel)"></div></div>
    <a class="btn primary" href="#/quiz">Resume</a></div>`;
}

function viewHome() {
  setNav('home');
  const att = Object.values(store.attempts);
  const scored = att.filter((a) => a.c !== null);
  const right = scored.filter((a) => a.c).length;
  const wrongN = scored.length - right;
  const nQ = DB.papers.reduce((n, p) => n + p.questions.length, 0);
  const nExpl = DB.papers.reduce((n, p) => n + p.questions.filter((q) => q.explanation).length, 0);
  const latest = (code) => DB.papers.find((p) => p.subject_code === code && p.answered_count > 0);
  const latestFull = DB.fulls.find((p) => p.answered_count > 0);
  const p1 = latest('00'), ph = latest('03');
  const last = store.history.slice(0, 5);
  const qs = (attrs, icn, color, t, sub, feature) => {
    const tag = attrs.startsWith('href') ? 'a' : 'button';
    return `<${tag} class="qs${feature ? ' feature' : ''}" ${attrs}><span class="ic ${color}">${ic(icn)}</span>
      <span class="t">${t}</span><span class="s">${sub}</span><span class="go">${ic('arrowR')}</span></${tag}>`;
  };
  app().innerHTML = `
    <section class="hero">
      <div>
        <h1>Crack UGC NET with <em>real</em> previous-year papers</h1>
        <p>Paper 1 and Philosophy questions since 2009, with official answer keys and plain-English explanations from 2017.</p>
        <div class="facts"><span><b>${DB.papers.length}</b> papers</span><span><b>${nQ.toLocaleString('en-IN')}</b> questions</span><span><b>${nExpl.toLocaleString('en-IN')}</b> explained</span></div>
        <div class="row">${latestFull ? `<a class="btn primary" href="#/paper/${latestFull.paper_id}">${ic('play')}Start latest full exam</a>` : ''}<a class="btn hide-sm" href="#/papers">Browse papers</a></div>
      </div>
      <div class="hero-side">
        ${metric('target', 'green', att.length, 'questions attempted')}
        ${metric('check', 'green', scored.length ? pct(right, scored.length) + '%' : '–', `accuracy${scored.length ? ` (${right}/${scored.length})` : ''}`)}
        ${metric('rotate', 'red', wrongN, 'to revisit')}
        ${metric('trophy', 'neutral', store.history.length, store.history.length === 1 ? 'exam taken' : 'exams taken')}
      </div>
    </section>
    ${resumeBanner()}
    <div class="section-head"><h2>Start practising</h2></div>
    <div class="quick">
      ${latestFull ? qs(`href="#/paper/${latestFull.paper_id}"`, 'layers', '', 'Latest full exam', `${esc(latestFull.session_label)} · Paper 1 + Philosophy · ${latestFull.questions.length} questions`, true) : ''}
      ${qs('data-quick="00"', 'shuffle', 'green', '20 random · Paper 1', 'Mixed units from 2017 on, with answers as you go')}
      ${qs('data-quick="03"', 'shuffle', 'green', '20 random · Philosophy', 'Mixed units from 2017 on, with answers as you go')}
      ${p1 ? qs(`href="#/paper/${p1.paper_id}"`, 'file', 'neutral', 'Latest Paper 1', `${esc(paperWhen(p1))} · ${p1.questions.length} questions`) : ''}
      ${ph ? qs(`href="#/paper/${ph.paper_id}"`, 'book', 'neutral', 'Latest Philosophy', `${esc(paperWhen(ph))} · ${ph.questions.length} questions`) : ''}
      ${qs('href="#/practice"', 'target', 'green', 'Custom practice', 'Pick units, years and question types, or search a topic')}
      ${wrongN ? qs('href="#/review"', 'rotate', 'red', `Revisit mistakes (${wrongN})`, 'Questions you got wrong last time') : ''}
    </div>
    ${last.length ? `<div class="section-head"><h2>Recent exams</h2><span class="spacer"></span><a href="#/stats">All history</a></div><div class="card tablecard">${historyTable(last)}</div>` : ''}
    <p class="foot-note">Progress is saved in this browser only. Use <a href="#/stats">Stats → Export</a> to move it to another device.</p>`;
  app().querySelectorAll('[data-quick]').forEach((b) => (b.onclick = () => {
    const pool = DB.papers.filter((p) => p.subject_code === b.dataset.quick && yearOf(p) >= 2017)
      .flatMap((p) => p.questions).filter(scorable);
    startSession({ kind: 'practice', title: `20 random · ${SUBJECTS[b.dataset.quick]} (2017+)`, qids: shuffle(pool).slice(0, 20).map((q) => q.id) });
  }));
}

function historyTable(rows) {
  return `<table class="stats"><thead><tr><th>Paper</th><th class="hide-sm">When</th><th class="num">Score</th><th class="num hide-sm">Time</th><th></th></tr></thead><tbody>
    ${rows.map((h) => { const pc = pct(h.marks, h.outOf); return `<tr><td>${h.paperId ? `<a href="#/paper/${h.paperId}">${esc(h.title)}</a>` : esc(h.title)}</td>
      <td class="muted small hide-sm">${new Date(h.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
      <td class="num"><span class="score"><span class="muted">${h.marks}/${h.outOf}</span><span class="badge ${pc >= 60 ? 'good' : pc >= 40 ? 'warn' : 'bad'}">${pc}%</span></span></td>
      <td class="num muted hide-sm">${fmtTime(h.secs)}</td>
      <td class="num">${h.answers ? `<a class="btn small" href="#/attempt/${h.t}">Answers</a>` : '<span class="muted small" title="Answers were not saved for attempts made before this feature">–</span>'}</td></tr>`; }).join('')}</tbody></table>`;
}

function viewPapers() {
  setNav('papers');
  const pr = Object.assign({ subj: 'full', from: 2017 }, store.prefs.papers);
  if (!['full', '00', '03'].includes(pr.subj)) pr.subj = 'full';
  const years = [...new Set(DB.papers.map(yearOf))].sort((a, b) => b - a);
  const list = (pr.subj === 'full' ? DB.fulls : DB.papers.filter((p) => p.subject_code === pr.subj)).filter((p) => yearOf(p) >= pr.from);
  const extraP1 = DB.papers.filter((p) => p.subject_code === '00' && yearOf(p) >= pr.from).length - list.length;
  let html = `<div class="page-head"><div><h1>Papers</h1><p>${list.length} ${pr.subj === 'full' ? 'full exams' : 'papers'} from ${pr.from} onward, newest first</p></div></div>
    ${resumeBanner()}
    <div class="toolbar">
      <div class="seg" id="subj">${[['full', 'Full exam'], ['00', 'Paper 1'], ['03', 'Philosophy']].map(([v, l]) => `<button data-v="${v}" class="${pr.subj === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span class="spacer"></span>
      <label class="filters">From <select id="from">${years.map((y) => `<option ${y === pr.from ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
    </div>
    ${pr.subj === 'full' ? `<p class="muted small">A full exam is the Paper 1 and Philosophy paper of the same sitting, attempted together.${extraP1 > 0 ? ` ${extraP1} more Paper 1 shifts (no Philosophy paper that day) are under “Paper 1”.` : ''}</p>` : ''}`;
  let lastYear = null;
  for (const p of list) {
    const y = yearOf(p);
    if (y !== lastYear) { html += `<div class="year">${y}</div>`; lastYear = y; }
    const done = p.questions.filter((q) => store.attempts[q.id]).length;
    const best = store.history.filter((h) => h.paperId === p.paper_id).reduce((m, h) => Math.max(m, pct(h.marks, h.outOf)), -1);
    const [kl, kc] = paperKey(p);
    const [icn, col] = p.full ? ['layers', 'green'] : p.subject_code === '00' ? ['file', 'neutral'] : ['book', 'neutral'];
    html += `<a class="card paper" href="#/paper/${p.paper_id}">
      <span class="pi ic ${col}">${ic(icn)}</span>
      <div class="body"><div class="title">${esc(paperTitle(p))}</div>
        <div class="meta">${p.full ? p.parts.map((x) => `${esc(subjectName(x))} (${x.questions.length})`).join(' + ') + ' = ' : ''}${p.questions.length} questions · ${esc(p.session_label)} · ${p.conducted_by}</div>
        ${done ? `<div class="row" style="margin-top:.55rem;gap:.7rem;flex-wrap:nowrap"><div class="progress"><div style="width:${pct(done, p.questions.length)}%"></div></div><span class="muted small" style="white-space:nowrap">${done}/${p.questions.length} done</span></div>` : ''}</div>
      <div class="side"><span class="badge ${kc}">${kl}</span>${best >= 0 ? `<span class="badge accent">Best ${best}%</span>` : ''}</div>
      <span class="chev hide-sm">${ic('chevR')}</span>
    </a>`;
  }
  app().innerHTML = html;
  $('#subj').onclick = (e) => { if (e.target.dataset.v) { store.prefs.papers = { ...pr, subj: e.target.dataset.v }; save(); viewPapers(); } };
  $('#from').onchange = (e) => { store.prefs.papers = { ...pr, from: +e.target.value }; save(); viewPapers(); };
}

function defaultMinutes(p) {
  if (p.full) return p.conducted_by === 'NTA' ? 180 : p.parts.reduce((m, x) => m + defaultMinutes(x), 0);
  if (p.session_key === '2018-07') return p.subject_code === '00' ? 60 : 120;
  if (p.conducted_by === 'CBSE') return p.original_paper === 'III' ? 150 : 75;
  return Math.round(p.questions.length * 1.2);
}

function viewPaper(id) {
  setNav('papers');
  const p = DB.byPaper[id];
  if (!p) { app().innerHTML = `<div class="card empty">${ic('file')}<p>Paper not found.</p><a class="btn" href="#/papers">Back to papers</a></div>`; return; }
  const [kl, kc] = paperKey(p);
  const counts = {};
  p.questions.forEach((q) => (counts[q.answer_status] = (counts[q.answer_status] || 0) + 1));
  const nExpl = p.questions.filter((q) => q.explanation).length;
  const done = p.questions.filter((q) => store.attempts[q.id]);
  const right = done.filter((q) => store.attempts[q.id].c).length;
  const hist = store.history.filter((h) => h.paperId === id);
  const parts = p.parts || [p];
  const inFull = p.full ? null : DB.fulls.find((f) => f.parts.includes(p));
  let from = 1;
  const partInfo = parts.map((x) => {
    const src = x.source || {}, range = `Q${from}–${(from += x.questions.length) - 1}`;
    return `${p.full ? `<h2>${esc(subjectName(x))} <span class="muted small">${range} · <a href="#/paper/${x.paper_id}">attempt on its own</a></span></h2>` : ''}
      ${x.instructions_note ? `<p class="small">${esc(x.instructions_note)}</p>` : ''}
      ${!x.answer_key_official && x.answered_count ? `<div class="note warn">${ic('alert')}<span>${esc(src.answer_key_notes || 'Answers come from an unofficial source.')}</span></div>` : ''}
      ${!x.answered_count ? `<div class="note warn">${ic('alert')}<span>No answer key was published for this paper, so it is not scored.</span></div>` : ''}
      <p class="small links">${src.question_paper_url ? `<a href="${esc(src.question_paper_url)}" target="_blank" rel="noopener">Original question paper</a>` : ''}
        ${src.answer_key_url ? ` · <a href="${esc(src.answer_key_url)}" target="_blank" rel="noopener">Answer key source</a>` : ''}</p>`;
  }).join('');
  const fullNote = !p.full ? '' : p.conducted_by === 'NTA'
    ? 'Paper 1 and Philosophy in one sitting, as in the real exam: 3 hours, 2 marks per question, no negative marking.'
    : 'In this session the papers were sat separately on the same day. Here they run back to back in one attempt; the default time is the sum of the original time limits.';
  app().innerHTML = `
    <a class="crumb" href="#/papers">${ic('chevL')}Papers</a>
    <div class="page-head"><div><h1>${esc(paperTitle(p))}</h1><p>${p.questions.length} questions · ${esc(p.session_label)} session · ${p.conducted_by}</p></div></div>
    <div class="modes">
      <div class="card mode"><span class="ic green">${ic('target')}</span><h2>Practice mode</h2>
        <p class="small muted">See the answer${nExpl ? ' and explanation' : ''} as soon as you pick an option. No timer.</p>
        <div class="row"><button class="btn primary" id="practice">${ic('play')}Practice this paper</button>
          ${done.length && done.length < p.questions.length ? '<button class="btn" id="practiceRest">Only unattempted</button>' : ''}</div></div>
      <div class="card mode"><span class="ic blue">${ic('clock')}</span><h2>Exam mode</h2>
        <p class="small muted">Timed. Answers stay hidden until you submit. Dropped questions earn the mark for everyone, as in the real exam.</p>
        <div class="row"><label class="mins">Minutes <input type="number" id="mins" min="5" max="400" value="${defaultMinutes(p)}"></label>
          <button class="btn primary" id="exam">Start exam</button></div></div>
    </div>
    <div class="card info">
      <div class="kv"><span class="badge ${kc}">${kl}</span>${Object.entries(counts).map(([k, n]) => `<span class="badge">${n} ${({ official: 'with official answers', official_multiple: 'with several accepted answers', dropped: 'dropped', unofficial: 'with unofficial answers', pending: 'without a key', unavailable: 'without a key' })[k] || k}</span>`).join('')}${nExpl ? `<span class="badge accent">${nExpl} with explanations</span>` : ''}</div>
      ${fullNote ? `<p class="small">${fullNote}</p>` : ''}
      ${partInfo}
      ${done.length ? `<p class="small">You've attempted ${done.length}/${p.questions.length} (${right} correct).</p>` : ''}
      ${inFull ? `<p class="small"><a href="#/paper/${inFull.paper_id}">Attempt this as a full exam (${inFull.parts.map((x) => esc(subjectName(x))).join(' + ')}) →</a></p>` : ''}
    </div>
    ${cutoffPanel(p, null)}
    ${hist.length ? `<h2>Your attempts</h2><div class="card tablecard">${historyTable(hist)}</div>` : ''}`;
  bindCutoff(() => viewPaper(id));
  const all = p.questions.map((q) => q.id);
  $('#practice').onclick = () => startSession({ kind: 'practice', title: paperTitle(p), paperId: id, qids: all, sections: !!p.full });
  const rest = $('#practiceRest');
  if (rest) rest.onclick = () => startSession({ kind: 'practice', title: paperTitle(p) + ' (unattempted)', paperId: id, qids: all.filter((q) => !store.attempts[q]), sections: !!p.full });
  $('#exam').onclick = () => startSession({ kind: 'exam', title: paperTitle(p), paperId: id, qids: all, sections: !!p.full, minutes: Math.max(1, +$('#mins').value || defaultMinutes(p)) });
}

/* ---- custom practice builder ---- */
function practiceFilter(f) {
  const term = f.q.trim().toLowerCase();
  return DB.papers.filter((p) => p.subject_code === f.subj && yearOf(p) >= f.from && yearOf(p) <= f.to)
    .flatMap((p) => p.questions)
    .filter((q) => {
      if (!f.units.includes(q.unit || 0)) return false;
      if (f.types.length && !f.types.includes(q.type)) return false;
      if (f.keyed && !scorable(q)) return false;
      const a = store.attempts[q.id];
      if (f.which === 'new' && a) return false;
      if (f.which === 'wrong' && !(a && a.c === false)) return false;
      if (term) {
        const g = q.group_id ? DB.groups[q.group_id]?.md || '' : '';
        if (!(q.question_md + ' ' + q.options.join(' ') + ' ' + g).toLowerCase().includes(term)) return false;
      }
      return true;
    });
}
const TYPES = { single_choice: 'Direct', multi_statement: 'Statements', match_list: 'Match the list', assertion_reason: 'Assertion–reason', sequence: 'Sequence', passage: 'Passage', data_interpretation: 'Data interpretation', figure: 'Figure' };

function viewPractice() {
  setNav('practice');
  const years = [...new Set(DB.papers.map(yearOf))].sort((a, b) => a - b);
  const f = Object.assign({ subj: '00', from: 2017, to: years[years.length - 1], units: null, types: [], keyed: true, which: 'all', q: '', count: 20, order: 'random' }, store.prefs.practice);
  const unitIds = Object.keys(DB.units[f.subj].units).map(Number);
  if (!f.units) f.units = unitIds.concat(0);
  const draw = () => {
    const pool = practiceFilter(f);
    $('#matchN').textContent = `${pool.length} matching question${pool.length === 1 ? '' : 's'}`;
    $('#go').disabled = !pool.length;
    store.prefs.practice = f; save();
  };
  app().innerHTML = `<div class="page-head"><div><h1>Custom practice</h1><p>Build a set from any units, years and question types.</p></div></div>${resumeBanner()}
    <div class="card builder">
      <div class="filters">
        <div class="seg" id="subj">${Object.entries(SUBJECTS).map(([v, l]) => `<button data-v="${v}" class="${f.subj === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label>Years <select id="from">${years.map((y) => `<option ${y === f.from ? 'selected' : ''}>${y}</option>`).join('')}</select>
          to <select id="to">${years.map((y) => `<option ${y === f.to ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      </div>
      <h2>Units <span class="spacer"></span><button class="btn small" id="allUnits">All</button> <button class="btn small" id="noUnits">None</button></h2>
      <div class="units">${unitIds.map((u) => `<label><input type="checkbox" data-unit="${u}" ${f.units.includes(u) ? 'checked' : ''}> <span><strong>${u}.</strong> ${esc(unitName(f.subj, u))}</span></label>`).join('')}</div>
      <h2>Question types <span class="muted small">(none ticked = all)</span></h2>
      <div class="units">${Object.entries(TYPES).map(([t, l]) => `<label><input type="checkbox" data-type="${t}" ${f.types.includes(t) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <h2>Options</h2>
      <div class="filters">
        <label>Questions <select id="which">
          <option value="all" ${f.which === 'all' ? 'selected' : ''}>All</option>
          <option value="new" ${f.which === 'new' ? 'selected' : ''}>Not yet attempted</option>
          <option value="wrong" ${f.which === 'wrong' ? 'selected' : ''}>Got wrong last time</option></select></label>
        <label><input type="checkbox" id="keyed" ${f.keyed ? 'checked' : ''}> Only questions with an answer key</label>
        <label>Search <input type="search" id="q" value="${esc(f.q)}" placeholder="e.g. Nyāya, Kant, VLOOKUP"></label>
        <label>How many <select id="count">${[10, 20, 50, 100, 0].map((n) => `<option value="${n}" ${n === f.count ? 'selected' : ''}>${n || 'All'}</option>`).join('')}</select></label>
        <label>Order <select id="order"><option value="random" ${f.order === 'random' ? 'selected' : ''}>Random</option><option value="paper" ${f.order === 'paper' ? 'selected' : ''}>By paper, newest first</option></select></label>
      </div>
      <div class="go-row"><button class="btn primary" id="go">${ic('play')}Start practice</button><span class="muted" id="matchN"></span></div>
    </div>`;
  $('#subj').onclick = (e) => { if (e.target.dataset.v && e.target.dataset.v !== f.subj) { store.prefs.practice = { ...f, subj: e.target.dataset.v, units: null }; save(); viewPractice(); } };
  $('#from').onchange = (e) => { f.from = +e.target.value; draw(); };
  $('#to').onchange = (e) => { f.to = +e.target.value; draw(); };
  app().querySelectorAll('[data-unit]').forEach((c) => (c.onchange = () => {
    f.units = [...app().querySelectorAll('[data-unit]:checked')].map((x) => +x.dataset.unit).concat(0); draw();
  }));
  app().querySelectorAll('[data-type]').forEach((c) => (c.onchange = () => {
    f.types = [...app().querySelectorAll('[data-type]:checked')].map((x) => x.dataset.type); draw();
  }));
  $('#allUnits').onclick = () => { app().querySelectorAll('[data-unit]').forEach((c) => (c.checked = true)); f.units = unitIds.concat(0); draw(); };
  $('#noUnits').onclick = () => { app().querySelectorAll('[data-unit]').forEach((c) => (c.checked = false)); f.units = []; draw(); };
  $('#which').onchange = (e) => { f.which = e.target.value; draw(); };
  $('#keyed').onchange = (e) => { f.keyed = e.target.checked; draw(); };
  $('#q').oninput = (e) => { f.q = e.target.value; draw(); };
  $('#count').onchange = (e) => { f.count = +e.target.value; draw(); };
  $('#order').onchange = (e) => { f.order = e.target.value; draw(); };
  $('#go').onclick = () => {
    let pool = practiceFilter(f);
    pool = f.order === 'random' ? shuffle(pool) : pool;
    if (f.count) pool = pool.slice(0, f.count);
    startSession({ kind: 'practice', title: `${SUBJECTS[f.subj]} practice · ${pool.length} questions`, qids: pool.map((q) => q.id) });
  };
  draw();
}

/* ---- quiz ---- */
function viewQuiz() {
  setNav('');
  const s = store.session;
  if (!s) { app().innerHTML = `<div class="card empty">${ic('inbox')}<p>No active practice.</p><div class="row" style="justify-content:center"><a class="btn primary" href="#/papers">Pick a paper</a><a class="btn" href="#/practice">Build a practice set</a></div></div>`; return; }
  s.qids = s.qids.filter((id) => DB.byQ[id]);
  if (!s.qids.length) { store.session = null; save(); return viewQuiz(); }
  s.idx = Math.min(Math.max(0, s.idx), s.qids.length - 1);
  const q = DB.byQ[s.qids[s.idx]];
  const p = q.paper;
  const exam = s.kind === 'exam' && !s.submitted;
  const chosen = s.answers[q.id];
  const shown = !exam && s.revealed[q.id];
  const [sl, sc] = STATUS[q.answer_status] || [q.answer_status, ''];
  const g = q.group_id ? DB.groups[q.group_id] : null;
  const starred = !!store.bookmarks[q.id];

  let opts = '';
  q.options.forEach((o, i) => {
    let cls = '';
    if (shown) {
      if (scorable(q) && isCorrect(q, i)) cls = 'correct';
      else if (i === chosen) cls = scorable(q) ? 'wrong' : 'chosen';
      if (!scorable(q) && i === q.best_index) cls += ' suggested';
    } else if (i === chosen) cls = 'chosen';
    opts += `<li><button class="opt ${cls}" data-i="${i}" ${shown ? 'disabled' : ''}><span class="lab">${esc(q.option_labels[i])}</span><span class="md">${md(o)}</span>${shown && q.key_doubt && i === q.best_index ? '<span class="badge warn">Likely correct</span>' : ''}<span class="tick ok">${ic('check')}</span><span class="tick no">${ic('x')}</span></button></li>`;
  });

  let fb = '';
  if (shown) {
    const sugg = q.best_index != null ? ` Suggested answer (not official): <strong>(${esc(q.option_labels[q.best_index])})</strong>` : '';
    if (q.answer_status === 'dropped') fb = `<div class="feedback neutral">${ic('alert')}<span>This question was dropped in the official key (marks to all).${sugg}</span></div>`;
    else if (!scorable(q)) fb = `<div class="feedback neutral">${ic('alert')}<span>No answer key exists for this question.${sugg || ' Practice only.'}</span></div>`;
    else if (chosen == null) fb = `<div class="feedback neutral">${ic('minus')}<span>Not answered. Correct answer: <strong>${answerText(q)}</strong></span></div>`;
    else if (isCorrect(q, chosen)) fb = `<div class="feedback good">${ic('check')}<span>Correct${Array.isArray(q.answer_index) ? ` (the key accepts ${answerText(q)})` : ''}</span></div>`;
    else fb = `<div class="feedback bad">${ic('x')}<span>Incorrect. Correct answer: <strong>${answerText(q)}</strong></span></div>`;
    if (q.answer_status === 'unofficial') fb += `<div class="note warn">${ic('alert')}<span>This answer comes from an unofficial key. Double-check it.</span></div>`;
    if (q.answer_note) fb += `<div class="note">${ic('info')}<span>Key note: ${esc(q.answer_note)}</span></div>`;
    if (q.key_doubt) fb += `<div class="note warn">${ic('alert')}<span>The key's answer looks doubtful. The explanation below gives the reason.</span></div>`;
  }

  const palBtn = (id, i) => {
    const qq = DB.byQ[id], star = !!store.bookmarks[id];
    let c = '';
    if (!exam && s.revealed[id] && s.answers[id] != null && scorable(qq)) c = isCorrect(qq, s.answers[id]) ? 'correct' : 'wrong';
    else if (s.answers[id] != null) c = 'answered';
    return `<button data-go="${i}" class="${c} ${s.marked[id] ? 'marked' : ''} ${star ? 'starred' : ''} ${i === s.idx ? 'current' : ''}" title="Question ${i + 1}${star ? ' · bookmarked' : ''}${s.marked[id] ? ' · marked for review' : ''}">${i + 1}</button>`;
  };
  const pal = (s.sections ? sectionsOf(s) : [{ start: 0, ids: s.qids }]).map((sec) => `
    ${sec.paper ? `<div class="palhead">${esc(subjectName(sec.paper))} <span class="muted">Q${sec.start + 1}–${sec.start + sec.ids.length} · ${sec.ids.filter((id) => s.answers[id] != null).length}/${sec.ids.length} answered</span></div>` : ''}
    <div class="palette">${sec.ids.map((id, j) => palBtn(id, sec.start + j)).join('')}</div>`).join('');
  const starN = s.qids.filter((id) => store.bookmarks[id]).length;
  const markN = s.qids.filter((id) => s.marked[id]).length;
  const answeredN = Object.keys(s.answers).length;
  const when = p.exam_date ? fmtDate(p.exam_date) + (p.shift ? ' S' + p.shift : '') : p.session_label;

  app().innerHTML = `
    <div class="quizbar">
      <span class="title">${esc(s.title)}</span>
      <span class="badge ${s.kind === 'exam' ? (s.submitted ? 'accent' : 'solid') : 'good'}">${s.kind === 'exam' ? (s.submitted ? 'Exam review' : 'Exam') : 'Practice'}</span>
      <span class="spacer"></span>
      ${exam ? `<span class="timer" id="timer"></span><button class="btn primary" id="submit">Submit</button>` : ''}
      ${s.submitted ? '<a class="btn" href="#/result">Results</a>' : ''}
      ${s.kind === 'practice' ? '<button class="btn" id="end"><span>End<span class="hide-sm"> practice</span></span></button>' : ''}
      <div class="qprog"><span>Question ${s.idx + 1} of ${s.qids.length}</span><div class="progress"><div style="width:${pct(answeredN, s.qids.length)}%"></div></div><span>${answeredN} answered</span></div>
    </div>
    <div class="quizgrid">
      <div class="card qcard">
        <div class="qhead">
          <span class="qnum">Q${s.idx + 1}</span>
          <span class="badge" title="${esc(p.session_label)}">${esc(subjectName(p))} · ${esc(when)} · Q${q.number}</span>
          ${q.unit && !exam ? `<span class="badge accent" title="${esc(unitName(p.subject_code, q.unit))}">Unit ${q.unit}: ${esc(unitName(p.subject_code, q.unit))}</span>` : ''}
          ${!exam ? `<span class="badge ${sc}">${esc(sl)}</span>` : ''}
          <button class="star ${starred ? 'on' : ''}" id="star" title="Bookmark (S)" aria-label="Bookmark">${ic('star')}</button>
        </div>
        ${g ? `<details class="group" open><summary>${g.kind === 'passage' ? 'Passage' : g.kind === 'data_table' ? 'Data' : 'Figure'} for this question</summary>
          <div class="md">${md(g.md)}</div>${g.image ? `<img class="qimg" src="${imgSrc(g.image)}" alt="">` : ''}</details>` : ''}
        <div class="md qtext">${md(q.question_md)}</div>
        ${q.image ? `<img class="qimg" src="${imgSrc(q.image)}" alt="Figure for question ${q.number}">` : ''}
        <ol class="options">${opts}</ol>
        ${fb}
        ${shown && q.explanation ? `<div class="explain"><div class="explain-head"><span class="ic">${ic('bulb')}</span>Explanation</div><div class="md">${md(q.explanation)}</div></div>` : ''}
        ${shown && q.notes ? `<div class="note">${ic('info')}<span>Note: ${esc(q.notes)}</span></div>` : ''}
        <div class="qnav">
          <button class="btn" id="prev" ${s.idx === 0 ? 'disabled' : ''} aria-label="Previous">${ic('arrowL')}<span class="hide-sm">Previous</span></button>
          ${exam ? `<button class="btn${s.marked[q.id] ? ' on' : ''}" id="mark" title="${s.marked[q.id] ? 'Unmark' : 'Mark for review'} (M)" aria-label="${s.marked[q.id] ? 'Unmark' : 'Mark for review'}">${ic('flag')}<span class="hide-sm">${s.marked[q.id] ? 'Unmark' : 'Mark for review'}</span></button>${chosen != null ? `<button class="btn ghost" id="clear" title="Clear answer" aria-label="Clear answer">${ic('eraser')}<span class="hide-sm">Clear</span></button>` : ''}` : ''}
          <span class="spacer"></span>
          <button class="btn only-sm" id="toPal" aria-label="All questions">${ic('grid')}</button>
          ${s.idx < s.qids.length - 1 ? `<button class="btn primary" id="next">Next${ic('arrowR')}</button>` : s.kind === 'practice' ? '<button class="btn primary" id="finish">Finish</button>' : s.submitted ? '<a class="btn primary" href="#/result">Results</a>' : ''}
        </div>
      </div>
      <details class="card side-card" id="pal" ${store.prefs.palClosed ? '' : 'open'}><summary>All questions <span class="muted">${answeredN}/${s.qids.length} answered</span></summary>${pal}
        <div class="legend"><span><i class="key starred"></i>Bookmarked (${starN})</span>${exam ? `<span><i class="key marked"></i>For review (${markN})</span>` : ''}
          <span><i class="key answered"></i>Answered</span>${exam ? '' : '<span><i class="key correct"></i>Correct</span><span><i class="key wrong"></i>Wrong</span>'}</div>
        <p class="hint hide-sm">Keyboard: <kbd>1</kbd>–<kbd>4</kbd> choose, <kbd>←</kbd> <kbd>→</kbd> move,<br><kbd>S</kbd> bookmark${exam ? ', <kbd>M</kbd> mark' : ''}</p></details>
    </div>`;

  const go = (i) => { s.idx = i; save(); viewQuiz(); window.scrollTo(0, 0); };
  app().querySelectorAll('.opt').forEach((b) => (b.onclick = () => choose(+b.dataset.i)));
  app().querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(+b.dataset.go)));
  $('#prev').onclick = () => go(s.idx - 1);
  if ($('#next')) $('#next').onclick = () => go(s.idx + 1);
  if ($('#finish')) $('#finish').onclick = endPractice;
  if ($('#end')) $('#end').onclick = endPractice;
  if ($('#submit')) $('#submit').onclick = () => submitExam(false);
  if ($('#mark')) $('#mark').onclick = () => { s.marked[q.id] = !s.marked[q.id]; save(); viewQuiz(); };
  if ($('#clear')) $('#clear').onclick = () => { delete s.answers[q.id]; save(); viewQuiz(); };
  $('#star').onclick = toggleStar;
  $('#toPal').onclick = () => { $('#pal').open = true; $('#pal').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('#pal').ontoggle = (e) => { if (!!store.prefs.palClosed === e.target.open) { store.prefs.palClosed = !e.target.open; save(); } };
  if (exam) startTimer(); else stopTimer();
}

function choose(i) {
  const s = store.session;
  const q = DB.byQ[s.qids[s.idx]];
  const exam = s.kind === 'exam' && !s.submitted;
  if (!exam && s.revealed[q.id]) return;
  s.answers[q.id] = i;
  if (!exam) { s.revealed[q.id] = true; recordAttempt(q, i); }
  save(); viewQuiz();
}
function toggleStar() {
  const q = DB.byQ[store.session.qids[store.session.idx]];
  if (store.bookmarks[q.id]) delete store.bookmarks[q.id]; else store.bookmarks[q.id] = Date.now();
  save(); viewQuiz();
}
async function endPractice() {
  const s = store.session;
  const ids = s.qids.filter((id) => s.revealed[id] && s.answers[id] != null && scorable(DB.byQ[id]));
  const right = ids.filter((id) => isCorrect(DB.byQ[id], s.answers[id])).length;
  if (s.kind === 'practice' && ids.length < s.qids.length && !(await uiConfirm({
    title: 'End this practice?', icon: 'flag', ok: 'End practice', cancel: 'Keep practising',
    body: `You answered ${ids.length} of ${s.qids.length} questions. Your answers so far are saved.`,
  }))) return;
  if (store.session !== s) return;
  store.session = null; save();
  location.hash = s.paperId ? `#/paper/${s.paperId}` : '#/practice';
  toast(ids.length ? `Practice finished: <strong>${right}/${ids.length}</strong> correct (${pct(right, ids.length)}%)` : 'Practice ended.', ids.length ? 'good' : 'info');
}

function startTimer() {
  stopTimer();
  const tick = () => {
    const s = store.session, el = $('#timer');
    if (!s || s.submitted || !el) return stopTimer();
    const left = (s.endsAt - Date.now()) / 1000;
    el.innerHTML = ic('clock') + fmtTime(left);
    el.classList.toggle('low', left < 300);
    if (left <= 0) { stopTimer(); submitExam(true); toast('Time is up. Your exam has been submitted.', 'warn'); }
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}
function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; }

function viewResult() {
  setNav('');
  const s = store.session;
  if (!s || !s.submitted) { location.hash = '#/'; return; }
  const r = s.result;
  const byUnit = {};
  for (const id of s.qids) {
    const q = DB.byQ[id];
    if (!scorable(q)) continue;
    const k = q.paper.subject_code + ':' + String(q.unit || 0).padStart(2, '0');
    const u = byUnit[k] || (byUnit[k] = { n: 0, c: 0, code: q.paper.subject_code, unit: q.unit || 0 });
    u.n++; if (s.answers[id] != null && isCorrect(q, s.answers[id])) u.c++;
  }
  const mixed = new Set(Object.values(byUnit).map((v) => v.code)).size > 1;
  const tone = (x) => (x >= 60 ? 'var(--good)' : x >= 40 ? 'var(--warn)' : 'var(--bad)');
  const secs = sectionScores(s.qids, s.answers);
  const pc = pct(r.marks, r.outOf);
  app().innerHTML = `
    <div class="card result-hero">
      <div class="ring" style="--p:${pc};--c:${tone(pc)}"><div><div class="v">${pc}%</div><div class="l">${r.marks}/${r.outOf} marks</div></div></div>
      <div><h1>${pc >= 60 ? 'Great score' : pc >= 40 ? 'Good effort' : 'Keep practising'}</h1>
        <p class="sub">${esc(s.title)}<br>${r.marks * 2}/${r.outOf * 2} marks · ${fmtTime(r.secs)}${r.dropped ? ` · ${r.dropped} dropped counted as correct` : ''}${r.unscored ? ` · ${r.unscored} without a key not scored` : ''}</p>
        <div class="row"><button class="btn primary" id="review">Review answers</button>
          <button class="btn" id="wrongOnly">${ic('rotate')}Practise the ones I missed</button>
          <button class="btn ghost" id="close">Close</button></div></div>
      <div class="tiles">
        ${metric('check', 'green', r.correct, 'correct')}
        ${metric('x', 'red', r.wrong, 'wrong')}
        ${metric('minus', 'neutral', r.outOf - r.correct - r.wrong - r.dropped, 'unanswered')}
        ${metric('clock', 'neutral', fmtTime(r.secs), 'time taken')}
      </div>
    </div>
    ${secs.length > 1 ? `<h2>Score by paper</h2>${sectionTiles(secs)}` : ''}
    ${cutoffPanel(DB.byPaper[s.paperId], secs)}
    <h2>By unit</h2>
    <div class="card tablecard">${Object.keys(byUnit).sort().map((k) => byUnit[k]).map((v) => `
      <div class="unitrow"><div class="uname">${mixed ? `<span class="badge">${SUBJECTS[v.code]}</span>` : ''}<span>${v.unit > 0 ? `${v.unit}. ${esc(unitName(v.code, v.unit))}` : 'Untagged'}</span></div><div class="n">${v.c}/${v.n}</div>
      <div class="bar"><div style="width:${pct(v.c, v.n)}%;background:${tone(pct(v.c, v.n))}"></div></div></div>`).join('')}</div>`;
  $('#review').onclick = () => { s.idx = 0; save(); location.hash = '#/quiz'; };
  $('#wrongOnly').onclick = () => {
    const ids = s.qids.filter((id) => scorable(DB.byQ[id]) && !(s.answers[id] != null && isCorrect(DB.byQ[id], s.answers[id])));
    if (!ids.length) return toast('Nothing missed. Well done!');
    startSession({ kind: 'practice', title: `Missed in ${s.title}`, paperId: s.paperId, qids: ids, sections: s.sections });
  };
  $('#close').onclick = () => { const pid = s.paperId; store.session = null; save(); location.hash = pid ? `#/paper/${pid}` : '#/'; };
  bindCutoff(viewResult);
}

/* ---- review ---- */
function viewReview() {
  setNav('review');
  const wrong = Object.entries(store.attempts).filter(([id, a]) => a.c === false && DB.byQ[id]).sort((a, b) => b[1].t - a[1].t).map(([id]) => id);
  const marked = Object.entries(store.bookmarks).filter(([id]) => DB.byQ[id]).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const list = (ids, kind) => ids.length ? ids.slice(0, 300).map((id, i) => {
    const q = DB.byQ[id], pp = q.paper;
    return `<div class="list-q"><span class="badge" title="${esc(paperTitle(pp))}">${SUBJECTS[pp.subject_code]}${q.unit ? ` · Unit ${q.unit}` : ''} · ${yearOf(pp)}</span>
      <span class="txt">${esc(plainText(q.question_md).slice(0, 220))}</span><button class="btn small" data-open="${kind}:${i}">Open</button></div>`;
  }).join('') : `<div class="empty">${ic(kind === 'wrong' ? 'check' : 'bookmark')}<p>${kind === 'wrong' ? 'No mistakes to revisit yet.' : 'No bookmarks yet. Tap the star on any question to save it here.'}</p></div>`;
  app().innerHTML = `<div class="page-head"><div><h1>Review</h1><p>Questions you missed, and questions you bookmarked.</p></div></div>${resumeBanner()}
    <div class="card"><div class="row"><span class="ic red ichead">${ic('rotate')}</span><h2 style="margin:0">Got wrong last time</h2><span class="badge">${wrong.length}</span><span class="spacer"></span>
      ${wrong.length ? '<button class="btn primary" data-all="wrong">Practise all</button>' : ''}</div>${list(wrong, 'wrong')}</div>
    <div class="card"><div class="row"><span class="ic neutral ichead">${ic('bookmark')}</span><h2 style="margin:0">Bookmarked</h2><span class="badge">${marked.length}</span><span class="spacer"></span>
      ${marked.length ? '<button class="btn primary" data-all="marked">Practise all</button>' : ''}</div>${list(marked, 'marked')}</div>`;
  const sets = { wrong, marked };
  const titles = { wrong: 'Revisit mistakes', marked: 'Bookmarked questions' };
  app().querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => startSession({ kind: 'practice', title: titles[b.dataset.all], qids: sets[b.dataset.all].slice() })));
  app().querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => {
    const [k, i] = b.dataset.open.split(':');
    startSession({ kind: 'practice', title: titles[k], qids: sets[k].slice(), idx: +i });
  }));
}

/* ---- stats ---- */
function viewStats() {
  setNav('stats');
  let html = `<div class="page-head"><div><h1>Stats</h1><p>Accuracy by unit, your exam history and your saved data.</p></div></div>`;
  for (const code of Object.keys(SUBJECTS)) {
    const avail = {};
    DB.papers.filter((p) => p.subject_code === code).forEach((p) => p.questions.forEach((q) => (avail[q.unit || 0] = (avail[q.unit || 0] || 0) + 1)));
    const rows = {};
    Object.values(store.attempts).filter((a) => a.s === code).forEach((a) => {
      const r = rows[a.u] || (rows[a.u] = { n: 0, sc: 0, c: 0 });
      r.n++; if (a.c !== null) { r.sc++; if (a.c) r.c++; }
    });
    const tot = Object.values(rows).reduce((t, r) => ({ n: t.n + r.n, sc: t.sc + r.sc, c: t.c + r.c }), { n: 0, sc: 0, c: 0 });
    const acc = pct(tot.c, tot.sc);
    html += `<div class="subj-head"><h2>${SUBJECTS[code]}</h2><span class="badge">${tot.n} attempted</span>${tot.sc ? `<span class="badge ${acc >= 60 ? 'good' : acc >= 40 ? 'warn' : 'bad'}">${acc}% accuracy</span>` : '<span class="badge">no scored attempts yet</span>'}</div>
      <div class="card tablecard"><table class="stats"><thead><tr><th>Unit</th><th class="num">Attempted</th><th class="num">Accuracy</th><th class="hide-sm"></th></tr></thead><tbody>
      ${Object.keys(avail).map(Number).sort((a, b) => a - b).filter((u) => u || rows[0]).map((u) => {
        const r = rows[u] || { n: 0, sc: 0, c: 0 }, a = pct(r.c, r.sc);
        return `<tr><td>${u ? `${u}. ${esc(unitName(code, u))}` : 'Untagged'}</td><td class="num">${r.n}/${avail[u]}</td>
          <td class="num">${r.sc ? a + '%' : '—'}</td>
          <td class="hide-sm" style="width:28%"><div class="bar"><div style="width:${r.sc ? a : 0}%;background:${a >= 60 ? 'var(--good)' : a >= 40 ? 'var(--warn)' : 'var(--bad)'}"></div></div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  if (store.history.length) html += `<h2>Exam history</h2><div class="card tablecard">${historyTable(store.history.slice(0, 30))}</div>`;
  html += `<h2>Your data</h2><div class="card"><p class="small muted" style="margin-top:0">Progress lives in this browser's storage. Export it to back up, or to carry it to another device or browser.</p>
    <div class="row"><button class="btn" id="export">${ic('download')}Export progress</button>
    <label class="btn">${ic('upload')}Import progress<input type="file" id="import" accept=".json,application/json" hidden></label>
    <span class="spacer"></span><button class="btn danger" id="reset">${ic('trash')}Reset all progress</button></div></div>`;
  app().innerHTML = html;
  $('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(store)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `phronesis-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  $('#import').onchange = async (e) => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!data.attempts) throw new Error('not a progress file');
      if (!(await uiConfirm({ title: 'Import progress?', icon: 'upload', ok: 'Merge', body: 'This adds the file to your current progress. Where both have an answer to the same question, the newer one wins.' }))) return;
      for (const [id, a] of Object.entries(data.attempts)) if (!store.attempts[id] || store.attempts[id].t < a.t) store.attempts[id] = a;
      Object.assign(store.bookmarks, data.bookmarks || {});
      const seen = new Set(store.history.map((h) => h.t));
      store.history = store.history.concat((data.history || []).filter((h) => !seen.has(h.t))).sort((a, b) => b.t - a.t);
      save(); viewStats(); toast('Progress imported.');
    } catch (err) { toast('Could not import: ' + esc(err.message), 'bad'); }
    e.target.value = '';
  };
  $('#reset').onclick = async () => {
    if (!(await uiConfirm({ title: 'Reset all progress?', icon: 'trash', tone: 'danger', ok: 'Delete everything', body: 'This deletes all attempts, bookmarks and exam history from this browser. Export first if you want a backup.' }))) return;
    store = { attempts: {}, bookmarks: {}, history: [], session: null, prefs: store.prefs };
    save(); viewStats(); toast('All progress deleted.', 'info');
  };
}

/* ---- answer sheet of a past exam ---- */
const SHEET = { right: ['Correct', 'good'], wrong: ['Wrong', 'bad'], blank: ['Not answered', ''], dropped: ['Dropped', 'warn'], nokey: ['No key', ''] };
function viewAttempt(t) {
  setNav('stats');
  const h = store.history.find((x) => String(x.t) === String(t));
  if (!h) { app().innerHTML = `<div class="card empty">${ic('inbox')}<p>This attempt was not found.</p><a class="btn" href="#/stats">Back to stats</a></div>`; return; }
  const pc = pct(h.marks, h.outOf);
  const when = new Date(h.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const head = `<a class="crumb" href="${h.paperId ? '#/paper/' + h.paperId : '#/stats'}">${ic('chevL')}${h.paperId ? 'Back to paper' : 'Stats'}</a>
    <div class="page-head"><div><h1>${esc(h.title)}</h1><p>Your answers · ${when} · ${h.marks}/${h.outOf} (${pc}%) · ${fmtTime(h.secs)}</p></div></div>`;
  if (!h.answers) {
    app().innerHTML = head + `<div class="card empty">${ic('inbox')}<p>Answers weren't saved for this attempt, only its score.<br>Exams you take from now on keep every answer, so you can review them here.</p></div>`;
    return;
  }
  const qids = h.qids.filter((id) => DB.byQ[id]);
  const stat = (id) => {
    const q = DB.byQ[id], a = h.answers[id];
    if (q.answer_status === 'dropped') return 'dropped';
    if (!scorable(q)) return 'nokey';
    if (a == null) return 'blank';
    return isCorrect(q, a) ? 'right' : 'wrong';
  };
  const all = qids.map((id, i) => ({ id, i, s: stat(id) }));
  const n = (k) => all.filter((r) => r.s === k).length;
  if (viewAttempt.t !== t) { viewAttempt.t = t; viewAttempt.f = 'all'; }
  const f = viewAttempt.f;
  const rows = all.filter((r) => f === 'all' || r.s === f);
  const lab = (q, i) => (i == null ? '–' : `(${esc(q.option_labels[i])})`);
  app().innerHTML = head + `
    <div class="tiles" style="margin-bottom:1rem">
      ${metric('check', 'green', n('right'), 'correct')}${metric('x', 'red', n('wrong'), 'wrong')}
      ${metric('minus', 'neutral', n('blank'), 'not answered')}${metric('clock', 'neutral', fmtTime(h.secs), 'time taken')}
    </div>
    ${(() => { const sc = sectionScores(qids, h.answers); return (sc.length > 1 ? sectionTiles(sc) : '') + cutoffPanel(DB.byPaper[h.paperId], sc); })()}
    <div class="toolbar"><div class="seg" id="sheetF">${[['all', 'All', all.length], ['wrong', 'Wrong', n('wrong')], ['blank', 'Not answered', n('blank')], ['right', 'Correct', n('right')]]
      .map(([v, l, c]) => `<button data-v="${v}" class="${f === v ? 'on' : ''}">${l} <span class="muted">${c}</span></button>`).join('')}</div></div>
    ${rows.length ? rows.map(({ id, i, s }) => {
      const q = DB.byQ[id], [sl, st] = SHEET[s];
      return `<details class="card arow" data-id="${id}"><summary>
        <span class="qnum">Q${i + 1}</span><span class="badge ${st}">${sl}</span>
        <span class="txt">${esc(plainText(q.question_md).slice(0, 200))}</span>
        <span class="ans">You <b class="${s === 'wrong' ? 'bad' : s === 'right' ? 'good' : ''}">${lab(q, h.answers[id])}</b>${scorable(q) ? ` · Key <b>${answerText(q)}</b>` : ''}</span></summary><div class="abody"></div></details>`;
    }).join('') : `<div class="card empty">${ic('check')}<p>Nothing here.</p></div>`}`;
  bindCutoff(() => viewAttempt(t));
  $('#sheetF').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { viewAttempt.f = b.dataset.v; viewAttempt(t); } };
  app().querySelectorAll('details.arow').forEach((d) => (d.ontoggle = () => {
    const body = d.querySelector('.abody');
    if (!d.open || body.innerHTML) return;
    const q = DB.byQ[d.dataset.id], chosen = h.answers[q.id], g = q.group_id ? DB.groups[q.group_id] : null;
    const opts = q.options.map((o, i) => {
      let cls = '';
      if (scorable(q) && isCorrect(q, i)) cls = 'correct';
      else if (i === chosen) cls = scorable(q) ? 'wrong' : 'chosen';
      if (!scorable(q) && i === q.best_index) cls += ' suggested';
      return `<li><div class="opt ${cls}"><span class="lab">${esc(q.option_labels[i])}</span><span class="md">${md(o)}</span>${q.key_doubt && i === q.best_index ? '<span class="badge warn">Likely correct</span>' : ''}<span class="tick ok">${ic('check')}</span><span class="tick no">${ic('x')}</span></div></li>`;
    }).join('');
    body.innerHTML = `${g ? `<details class="group"><summary>${g.kind === 'passage' ? 'Passage' : g.kind === 'data_table' ? 'Data' : 'Figure'} for this question</summary><div class="md">${md(g.md)}</div>${g.image ? `<img class="qimg" src="${imgSrc(g.image)}" alt="">` : ''}</details>` : ''}
      <div class="md qtext">${md(q.question_md)}</div>${q.image ? `<img class="qimg" src="${imgSrc(q.image)}" alt="">` : ''}
      <ol class="options">${opts}</ol>
      ${q.key_doubt ? `<div class="note warn">${ic('alert')}<span>The key's answer looks doubtful. The explanation gives the reason.</span></div>` : ''}
      ${q.explanation ? `<div class="explain"><div class="explain-head"><span class="ic">${ic('bulb')}</span>Explanation</div><div class="md">${md(q.explanation)}</div></div>` : ''}
      ${q.notes ? `<div class="note">${ic('info')}<span>Note: ${esc(q.notes)}</span></div>` : ''}
      <p class="small muted" style="margin:.8rem 0 0">${esc(paperTitle(q.paper))} · Q${q.number}${q.unit ? ` · Unit ${q.unit}: ${esc(unitName(q.paper.subject_code, q.unit))}` : ''}</p>`;
  }));
}

/* ---------- router ---------- */
function render() {
  if (!DB) return;
  const [, route, arg] = location.hash.split('/');
  if (route !== 'quiz') stopTimer();
  document.body.classList.toggle('in-quiz', route === 'quiz');
  const m = app(); m.classList.remove('enter'); void m.offsetWidth; m.classList.add('enter');
  clearTimeout(render.t); render.t = setTimeout(() => m.classList.remove('enter'), 400); // later re-renders (e.g. choosing an option) stay still
  switch (route) {
    case 'papers': return viewPapers();
    case 'paper': return viewPaper(decodeURIComponent(arg || ''));
    case 'practice': return viewPractice();
    case 'quiz': return viewQuiz();
    case 'result': return viewResult();
    case 'review': return viewReview();
    case 'stats': return viewStats();
    case 'attempt': return viewAttempt(arg);
    default: return viewHome();
  }
}

document.addEventListener('keydown', (e) => {
  if (!location.hash.startsWith('#/quiz') || !store.session || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const s = store.session, q = DB.byQ[s.qids[s.idx]], k = e.key.toLowerCase();
  const exam = s.kind === 'exam' && !s.submitted;
  let n = -1;
  if (/^[1-9]$/.test(k)) n = +k - 1;
  else if (/^[a-d]$/.test(k)) n = k.charCodeAt(0) - 97;
  if (n >= 0 && n < q.options.length) choose(n);
  else if (k === 's') toggleStar();
  else if (k === 'm' && exam) { s.marked[q.id] = !s.marked[q.id]; save(); viewQuiz(); }
  else if (k === 'arrowright' && s.idx < s.qids.length - 1) { s.idx++; save(); viewQuiz(); }
  else if (k === 'arrowleft' && s.idx > 0) { s.idx--; save(); viewQuiz(); }
});
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* ---------- theme: follows the OS until the toggle is used; the choice is remembered ---------- */
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme || (darkMQ.matches ? 'dark' : 'light');
function syncThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}
$('#themeBtn').onclick = () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('netpyq.theme', next); } catch (e) { /* private mode */ }
  syncThemeColor();
};
if (document.documentElement.dataset.theme) syncThemeColor();

function backfillLastAttempt() {
  const s = store.session;
  if (!s || !s.submitted || !s.result) return;
  const h = store.history.find((x) => (s.historyT ? x.t === s.historyT : x.paperId === s.paperId && x.secs === s.result.secs && x.marks === s.result.marks));
  if (h && !h.answers) { h.qids = s.qids.slice(); h.answers = { ...s.answers }; save(); }
}
loadData().then(() => { backfillLastAttempt(); render(); }).catch((err) => {
  app().innerHTML = `<div class="card"><h2>Couldn't load the questions</h2><p>${esc(err.message)}</p>
    <p class="small muted">Make sure <code>quiz-data.json</code> sits next to <code>index.html</code>. Opening the file directly (file://) doesn't work in most browsers; use the GitHub Pages URL or run <code>python3 -m http.server</code> in this folder.</p></div>`;
});
