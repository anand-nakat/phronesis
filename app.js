/* UGC NET PYQ practice — static single-page app. Data: quiz-data.json. Progress: localStorage. */
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
function paperTitle(p) {
  const when = p.exam_date ? `${fmtDate(p.exam_date)}${p.shift ? ' · Shift ' + p.shift : ''}` : p.session_label;
  return `${subjectName(p)} — ${when}`;
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
function unitName(code, u) { return DB.units[code]?.units[String(u)] || (u ? 'Unit ' + u : 'Untagged'); }
function plainText(md) { return md.replace(/\|/g, ' ').replace(/[*`#>-]+/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

/* ---------- markdown (subset: paragraphs, pipe tables, lists, bold/italic/code, sub/sup/u) ---------- */
function mdInline(s) {
  let h = esc(s);
  h = h.replace(/&lt;(\/?)(sub|sup|u|b|i|em|strong)&gt;/g, '<$1$2>').replace(/&lt;br\s*\/?&gt;/g, '<br>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>');
  h = h.replace(/(\w)\*([A-Za-z])\*(?!\w)/g, '$1<em>$2</em>'); // logic notation like B*x*
  return h;
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
    para.push(line); i++;
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
  DB = { papers, fulls, byPaper, byQ, groups, units: raw.units, images: raw.images };
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
function submitExam(auto) {
  const s = store.session;
  if (!s || s.kind !== 'exam' || s.submitted) return;
  if (!auto) {
    const left = s.qids.filter((id) => s.answers[id] == null).length;
    if (!confirm(left ? `${left} question(s) unanswered. Submit anyway?` : 'Submit the exam?')) return;
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
  store.history.unshift({ paperId: s.paperId, title: s.title, t: Date.now(), ...s.result });
  store.history = store.history.slice(0, 200);
  save();
  location.hash = '#/result';
}

/* ---------- views ---------- */
function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

function resumeBanner() {
  const s = store.session;
  if (!s || s.submitted) return '';
  const done = Object.keys(s.answers).length;
  return `<div class="card row"><div><strong>${s.kind === 'exam' ? 'Exam in progress' : 'Practice in progress'}:</strong> ${esc(s.title)}
    <div class="muted small">${done}/${s.qids.length} answered</div></div><span class="spacer"></span>
    <a class="btn primary" href="#/quiz">Resume</a></div>`;
}

function viewHome() {
  setNav('');
  const att = Object.values(store.attempts);
  const scored = att.filter((a) => a.c !== null);
  const right = scored.filter((a) => a.c).length;
  const wrongN = scored.length - right;
  const recent = DB.papers.filter((p) => yearOf(p) >= 2017);
  const latest = (code) => DB.papers.find((p) => p.subject_code === code && p.answered_count > 0);
  const latestFull = DB.fulls.find((p) => p.answered_count > 0);
  const last = store.history.slice(0, 5);
  app().innerHTML = `
    <h1>UGC NET previous-year questions</h1>
    ${resumeBanner()}
    <div class="tiles">
      <div class="card"><div class="big">${DB.papers.length}</div><div class="muted small">papers (${recent.length} from 2017 on)</div></div>
      <div class="card"><div class="big">${att.length}</div><div class="muted small">questions attempted</div></div>
      <div class="card"><div class="big">${scored.length ? pct(right, scored.length) + '%' : '—'}</div><div class="muted small">accuracy (${right}/${scored.length})</div></div>
      <div class="card"><div class="big">${wrongN}</div><div class="muted small">to revisit</div></div>
    </div>
    <h2>Start</h2>
    <div class="card row">
      ${latestFull ? `<a class="btn primary" href="#/paper/${latestFull.paper_id}">Latest full exam (Paper 1 + Philosophy): ${esc(latestFull.session_label)}</a>` : ''}
      ${['00', '03'].map((c) => { const p = latest(c); return p ? `<a class="btn" href="#/paper/${p.paper_id}">Latest ${SUBJECTS[c]}: ${esc(p.session_label)}</a>` : ''; }).join('')}
      <button class="btn" data-quick="00">20 random · Paper 1</button>
      <button class="btn" data-quick="03">20 random · Philosophy</button>
      ${wrongN ? `<a class="btn" href="#/review">Revisit mistakes (${wrongN})</a>` : ''}
    </div>
    ${last.length ? `<h2>Recent exams</h2><div class="card">${historyTable(last)}</div>` : ''}
    <p class="muted small">Progress is saved in this browser only. Use <a href="#/stats">Stats → Export</a> to move it to another device.</p>`;
  app().querySelectorAll('[data-quick]').forEach((b) => (b.onclick = () => {
    const pool = DB.papers.filter((p) => p.subject_code === b.dataset.quick && yearOf(p) >= 2017)
      .flatMap((p) => p.questions).filter(scorable);
    startSession({ kind: 'practice', title: `20 random · ${SUBJECTS[b.dataset.quick]} (2017+)`, qids: shuffle(pool).slice(0, 20).map((q) => q.id) });
  }));
}

function historyTable(rows) {
  return `<table class="stats"><thead><tr><th>Paper</th><th>When</th><th class="num">Score</th><th class="num">Time</th></tr></thead><tbody>
    ${rows.map((h) => `<tr><td>${h.paperId ? `<a href="#/paper/${h.paperId}">${esc(h.title)}</a>` : esc(h.title)}</td>
      <td class="muted small">${new Date(h.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
      <td class="num">${h.marks}/${h.outOf} <span class="muted">(${pct(h.marks, h.outOf)}%)</span></td>
      <td class="num muted">${fmtTime(h.secs)}</td></tr>`).join('')}</tbody></table>`;
}

function viewPapers() {
  setNav('papers');
  const pr = Object.assign({ subj: 'full', from: 2017 }, store.prefs.papers);
  if (!['full', '00', '03'].includes(pr.subj)) pr.subj = 'full';
  const years = [...new Set(DB.papers.map(yearOf))].sort((a, b) => b - a);
  const list = (pr.subj === 'full' ? DB.fulls : DB.papers.filter((p) => p.subject_code === pr.subj)).filter((p) => yearOf(p) >= pr.from);
  const extraP1 = DB.papers.filter((p) => p.subject_code === '00' && yearOf(p) >= pr.from).length - list.length;
  let html = `<h1>Papers</h1>${resumeBanner()}
    <div class="card filters">
      <div class="seg" id="subj">${[['full', 'Full exam (Paper 1 + Philosophy)'], ['00', 'Paper 1 only'], ['03', 'Philosophy only']].map(([v, l]) => `<button data-v="${v}" class="${pr.subj === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label>From <select id="from">${years.map((y) => `<option ${y === pr.from ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <span class="muted small">${list.length} ${pr.subj === 'full' ? 'full exams' : 'papers'} · newest first</span>
    </div>
    ${pr.subj === 'full' && extraP1 > 0 ? `<p class="muted small">Each full exam is the Paper 1 and Philosophy paper of the same sitting, attempted together. ${extraP1} more Paper 1 shifts (no Philosophy paper that day) are under “Paper 1 only”.</p>` : ''}`;
  let lastYear = null;
  for (const p of list) {
    const y = yearOf(p);
    if (y !== lastYear) { html += `<div class="year">${y}</div>`; lastYear = y; }
    const done = p.questions.filter((q) => store.attempts[q.id]).length;
    const best = store.history.filter((h) => h.paperId === p.paper_id).reduce((m, h) => Math.max(m, pct(h.marks, h.outOf)), -1);
    const [kl, kc] = paperKey(p);
    html += `<a class="card paper" href="#/paper/${p.paper_id}" style="text-decoration:none;color:inherit">
      <div style="flex:1;min-width:220px"><div class="title">${esc(paperTitle(p))}</div>
        <div class="meta">${esc(p.session_label)} session · ${p.full ? p.parts.map((x) => `${esc(subjectName(x))} (${x.questions.length})`).join(' + ') + ' = ' : ''}${p.questions.length} questions · ${p.conducted_by}</div></div>
      <span class="badge ${kc}">${kl}</span>
      ${best >= 0 ? `<span class="badge accent">Best ${best}%</span>` : ''}
      ${done ? `<span class="muted small">${done}/${p.questions.length} done</span>` : ''}
      ${done ? `<div class="progress"><div style="width:${pct(done, p.questions.length)}%"></div></div>` : ''}
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
  if (!p) { app().innerHTML = '<p>Paper not found. <a href="#/papers">Back to papers</a></p>'; return; }
  const [kl, kc] = paperKey(p);
  const counts = {};
  p.questions.forEach((q) => (counts[q.answer_status] = (counts[q.answer_status] || 0) + 1));
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
      ${!x.answer_key_official && x.answered_count ? `<p class="small">⚠️ ${esc(src.answer_key_notes || 'Answers come from an unofficial source.')}</p>` : ''}
      ${!x.answered_count ? '<p class="small">⚠️ No answer key was published for this paper, so it is not scored.</p>' : ''}
      <p class="small">${src.question_paper_url ? `<a href="${esc(src.question_paper_url)}" target="_blank" rel="noopener">Original question paper</a>` : ''}
        ${src.answer_key_url ? ` · <a href="${esc(src.answer_key_url)}" target="_blank" rel="noopener">Answer key source</a>` : ''}</p>`;
  }).join('');
  const fullNote = !p.full ? '' : p.conducted_by === 'NTA'
    ? 'Paper 1 and Philosophy in one sitting, as in the real exam: 3 hours, 2 marks per question, no negative marking.'
    : 'In this session the papers were sat separately on the same day. Here they run back to back in one attempt; the default time is the sum of the original time limits.';
  app().innerHTML = `
    <p><a href="#/papers">← Papers</a></p>
    <h1>${esc(paperTitle(p))}</h1>
    <div class="card">
      <div class="row"><span class="badge ${kc}">${kl}</span><span class="muted">${p.questions.length} questions · ${esc(p.session_label)} session · ${p.conducted_by}</span></div>
      ${fullNote ? `<p class="small">${fullNote}</p>` : ''}
      <p class="small muted">${Object.entries(counts).map(([k, n]) => `${n} ${(STATUS[k] || [k])[0].toLowerCase()}`).join(' · ')}</p>
      ${partInfo}
      ${done.length ? `<p class="small">You've attempted ${done.length}/${p.questions.length} (${right} correct).</p>` : ''}
      ${inFull ? `<p class="small"><a href="#/paper/${inFull.paper_id}">Attempt this as a full exam (${inFull.parts.map((x) => esc(subjectName(x))).join(' + ')}) →</a></p>` : ''}
    </div>
    <div class="card">
      <h2 style="margin-top:0">Practice mode</h2>
      <p class="small muted">See the answer as soon as you pick an option. No timer.</p>
      <div class="row"><button class="btn primary" id="practice">Practice this paper</button>
        ${done.length && done.length < p.questions.length ? '<button class="btn" id="practiceRest">Only unattempted</button>' : ''}</div>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Exam mode</h2>
      <p class="small muted">Timed. Answers are hidden until you submit. Dropped questions earn the mark for everyone, as in the real exam.</p>
      <div class="row"><label>Minutes <input type="number" id="mins" min="5" max="400" value="${defaultMinutes(p)}" style="width:5rem;padding:.3rem;border:1px solid var(--line);border-radius:6px;background:var(--card)"></label>
        <button class="btn primary" id="exam">Start exam</button></div>
    </div>
    ${hist.length ? `<h2>Your attempts</h2><div class="card">${historyTable(hist)}</div>` : ''}`;
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
  app().innerHTML = `<h1>Custom practice</h1>${resumeBanner()}
    <div class="card">
      <div class="filters">
        <div class="seg" id="subj">${Object.entries(SUBJECTS).map(([v, l]) => `<button data-v="${v}" class="${f.subj === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label>Years <select id="from">${years.map((y) => `<option ${y === f.from ? 'selected' : ''}>${y}</option>`).join('')}</select>
          to <select id="to">${years.map((y) => `<option ${y === f.to ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      </div>
      <h2>Units <button class="btn small" id="allUnits">All</button> <button class="btn small" id="noUnits">None</button></h2>
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
      <div class="row" style="margin-top:1rem"><button class="btn primary" id="go">Start practice</button><span class="muted" id="matchN"></span></div>
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
  if (!s) { app().innerHTML = '<p>No active practice. <a href="#/papers">Pick a paper</a> or <a href="#/practice">build a practice set</a>.</p>'; return; }
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
    } else if (i === chosen) cls = 'chosen';
    opts += `<li><button class="opt ${cls}" data-i="${i}" ${shown ? 'disabled' : ''}><span class="lab">${esc(q.option_labels[i])}</span><span class="md">${md(o)}</span></button></li>`;
  });

  let fb = '';
  if (shown) {
    if (q.answer_status === 'dropped') fb = `<div class="feedback neutral">This question was dropped in the official key (marks to all).</div>`;
    else if (!scorable(q)) fb = `<div class="feedback neutral">No answer key exists for this question. Practice only.</div>`;
    else if (chosen == null) fb = `<div class="feedback neutral">Not answered. Correct answer: <strong>${answerText(q)}</strong></div>`;
    else if (isCorrect(q, chosen)) fb = `<div class="feedback good">✓ Correct${Array.isArray(q.answer_index) ? ` (the key accepts ${answerText(q)})` : ''}</div>`;
    else fb = `<div class="feedback bad">✗ Incorrect. Correct answer: <strong>${answerText(q)}</strong></div>`;
    if (q.answer_status === 'unofficial') fb += `<div class="note">⚠️ This answer comes from an unofficial key. Double-check it.</div>`;
    if (q.answer_note) fb += `<div class="note">Key note: ${esc(q.answer_note)}</div>`;
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
  app().innerHTML = `
    <div class="quizbar">
      <span class="title">${esc(s.title)}</span>
      <span class="badge">${s.kind === 'exam' ? (s.submitted ? 'Exam review' : 'Exam') : 'Practice'}</span>
      <span class="spacer"></span>
      ${exam ? `<span class="timer" id="timer"></span><button class="btn primary" id="submit">Submit</button>` : ''}
      ${s.submitted ? '<a class="btn" href="#/result">Results</a>' : ''}
      ${s.kind === 'practice' ? `<span class="muted small">${answeredN}/${s.qids.length} answered</span><button class="btn" id="end">End</button>` : ''}
    </div>
    <div class="card">
      <div class="qhead">
        <span class="qnum">Q${s.idx + 1}/${s.qids.length}</span>
        <span class="badge">${esc(p.session_label)} · ${esc(subjectName(p))}${p.exam_date ? ' · ' + fmtDate(p.exam_date) + (p.shift ? ' S' + p.shift : '') : ''} · Q${q.number}</span>
        ${q.unit ? `<span class="badge accent" title="${esc(unitName(p.subject_code, q.unit))}">Unit ${q.unit}: ${esc(unitName(p.subject_code, q.unit))}</span>` : ''}
        ${!exam ? `<span class="badge ${sc}">${esc(sl)}</span>` : ''}
        <button class="star ${starred ? 'on' : ''}" id="star" title="Bookmark (S)">${starred ? '★' : '☆'}</button>
      </div>
      ${g ? `<details class="group" open><summary>${g.kind === 'passage' ? 'Passage' : g.kind === 'data_table' ? 'Data' : 'Figure'} for this question</summary>
        <div class="md">${md(g.md)}</div>${g.image ? `<img class="qimg" src="${imgSrc(g.image)}" alt="">` : ''}</details>` : ''}
      <div class="md">${md(q.question_md)}</div>
      ${q.image ? `<img class="qimg" src="${imgSrc(q.image)}" alt="Figure for question ${q.number}">` : ''}
      <ol class="options">${opts}</ol>
      ${fb}
      ${shown && q.notes ? `<div class="note">Note: ${esc(q.notes)}</div>` : ''}
      <div class="qnav">
        <button class="btn" id="prev" ${s.idx === 0 ? 'disabled' : ''}>← Previous</button>
        ${exam ? `<button class="btn" id="mark">${s.marked[q.id] ? 'Unmark' : 'Mark for review'}</button>${chosen != null ? '<button class="btn" id="clear">Clear</button>' : ''}` : ''}
        <span class="spacer"></span>
        ${s.idx < s.qids.length - 1 ? '<button class="btn primary" id="next">Next →</button>' : s.kind === 'practice' ? '<button class="btn primary" id="finish">Finish</button>' : s.submitted ? '<a class="btn primary" href="#/result">Results</a>' : ''}
      </div>
    </div>
    <details class="card" id="pal" ${store.prefs.palClosed ? '' : 'open'}><summary class="muted small">All questions</summary>${pal}
      <div class="legend"><span><i class="key starred"></i>Bookmarked (${starN})</span>${exam ? `<span><i class="key marked"></i>Marked for review (${markN})</span>` : ''}
        <span><i class="key answered"></i>Answered</span>${exam ? '' : '<span><i class="key correct"></i>Correct</span><span><i class="key wrong"></i>Wrong</span>'}</div></details>
    <p class="hint">Keys: 1–4 or A–D choose · ← → move · S bookmark${exam ? ' · M mark' : ''}</p>`;

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
function endPractice() {
  const s = store.session;
  const ids = s.qids.filter((id) => s.revealed[id] && s.answers[id] != null && scorable(DB.byQ[id]));
  const right = ids.filter((id) => isCorrect(DB.byQ[id], s.answers[id])).length;
  if (s.kind === 'practice' && ids.length < s.qids.length && !confirm(`End this practice? You answered ${ids.length} of ${s.qids.length}.`)) return;
  store.session = null; save();
  alert(ids.length ? `Practice finished: ${right}/${ids.length} correct (${pct(right, ids.length)}%).` : 'Practice ended.');
  location.hash = s.paperId ? `#/paper/${s.paperId}` : '#/practice';
}

function startTimer() {
  stopTimer();
  const tick = () => {
    const s = store.session, el = $('#timer');
    if (!s || s.submitted || !el) return stopTimer();
    const left = (s.endsAt - Date.now()) / 1000;
    el.textContent = '⏱ ' + fmtTime(left);
    el.classList.toggle('low', left < 300);
    if (left <= 0) { stopTimer(); alert('Time is up. Submitting your exam.'); submitExam(true); }
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
  const secRows = !s.sections ? '' : sectionsOf(s).map((sec) => {
    let c = 0, w = 0, d = 0, n = 0;
    for (const id of sec.ids) {
      const q = DB.byQ[id], a = s.answers[id];
      if (q.answer_status === 'dropped') { d++; n++; continue; }
      if (!scorable(q)) continue;
      n++; if (a != null) isCorrect(q, a) ? c++ : w++;
    }
    return `<tr><td>${esc(subjectName(sec.paper))}</td><td class="num">${n ? `${c + d}/${n}` : 'no key'}</td><td class="num">${n ? `${(c + d) * 2}/${n * 2} marks` : '—'}</td>
      <td class="num muted">${n ? `${c} correct · ${w} wrong · ${n - c - w - d} blank${d ? ` · ${d} dropped` : ''}` : ''}</td>
      <td style="width:22%"><div class="bar"><div style="width:${pct(c + d, n)}%;background:${pct(c + d, n) >= 60 ? 'var(--good)' : 'var(--bad)'}"></div></div></td></tr>`;
  }).join('');
  app().innerHTML = `
    <h1>Result</h1><p class="muted">${esc(s.title)}</p>
    <div class="tiles">
      <div class="card"><div class="big">${r.marks}/${r.outOf}</div><div class="muted small">score (${pct(r.marks, r.outOf)}%) · ${r.marks * 2}/${r.outOf * 2} marks</div></div>
      <div class="card"><div class="big">${r.correct}</div><div class="muted small">correct</div></div>
      <div class="card"><div class="big">${r.wrong}</div><div class="muted small">wrong</div></div>
      <div class="card"><div class="big">${r.outOf - r.correct - r.wrong - r.dropped}</div><div class="muted small">unanswered</div></div>
      <div class="card"><div class="big">${fmtTime(r.secs)}</div><div class="muted small">time taken</div></div>
    </div>
    <p class="small muted">${r.dropped ? `${r.dropped} dropped question(s) counted as correct (marks to all). ` : ''}${r.unscored ? `${r.unscored} question(s) without a key not scored.` : ''}</p>
    ${secRows ? `<h2>By section</h2><div class="card"><table class="stats"><tbody>${secRows}</tbody></table></div>` : ''}
    <h2>By unit</h2>
    <div class="card"><table class="stats"><tbody>${Object.keys(byUnit).sort().map((k) => [byUnit[k].unit, byUnit[k]]).map(([u, v]) => `
      <tr><td>${mixed ? `<span class="badge">${SUBJECTS[v.code]}</span> ` : ''}${u > 0 ? `${u}. ${esc(unitName(v.code, +u))}` : 'Untagged'}</td><td class="num">${v.c}/${v.n}</td>
      <td style="width:30%"><div class="bar"><div style="width:${pct(v.c, v.n)}%;background:${pct(v.c, v.n) >= 60 ? 'var(--good)' : 'var(--bad)'}"></div></div></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn primary" id="review">Review answers</button>
      <button class="btn" id="wrongOnly">Practise the ones I missed</button>
      <button class="btn" id="close">Close</button></div>`;
  $('#review').onclick = () => { s.idx = 0; save(); location.hash = '#/quiz'; };
  $('#wrongOnly').onclick = () => {
    const ids = s.qids.filter((id) => scorable(DB.byQ[id]) && !(s.answers[id] != null && isCorrect(DB.byQ[id], s.answers[id])));
    if (!ids.length) return alert('Nothing missed. Well done!');
    startSession({ kind: 'practice', title: `Missed in ${s.title}`, paperId: s.paperId, qids: ids, sections: s.sections });
  };
  $('#close').onclick = () => { const pid = s.paperId; store.session = null; save(); location.hash = pid ? `#/paper/${pid}` : '#/'; };
}

/* ---- review ---- */
function viewReview() {
  setNav('review');
  const wrong = Object.entries(store.attempts).filter(([id, a]) => a.c === false && DB.byQ[id]).sort((a, b) => b[1].t - a[1].t).map(([id]) => id);
  const marked = Object.entries(store.bookmarks).filter(([id]) => DB.byQ[id]).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const list = (ids, kind) => ids.length ? ids.slice(0, 300).map((id, i) => {
    const q = DB.byQ[id];
    return `<div class="list-q"><span class="badge">${SUBJECTS[q.paper.subject_code]} · ${esc(q.paper.session_label)}</span>
      <span class="txt">${esc(plainText(q.question_md).slice(0, 220))}</span><button class="btn small" data-open="${kind}:${i}">Open</button></div>`;
  }).join('') : '<p class="muted">Nothing here yet.</p>';
  app().innerHTML = `<h1>Review</h1>${resumeBanner()}
    <div class="card"><div class="row"><h2 style="margin:0">Got wrong last time (${wrong.length})</h2><span class="spacer"></span>
      ${wrong.length ? '<button class="btn primary" data-all="wrong">Practise all</button>' : ''}</div>${list(wrong, 'wrong')}</div>
    <div class="card"><div class="row"><h2 style="margin:0">Bookmarked (${marked.length})</h2><span class="spacer"></span>
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
  let html = `<h1>Stats</h1>`;
  for (const code of Object.keys(SUBJECTS)) {
    const avail = {};
    DB.papers.filter((p) => p.subject_code === code).forEach((p) => p.questions.forEach((q) => (avail[q.unit || 0] = (avail[q.unit || 0] || 0) + 1)));
    const rows = {};
    Object.values(store.attempts).filter((a) => a.s === code).forEach((a) => {
      const r = rows[a.u] || (rows[a.u] = { n: 0, sc: 0, c: 0 });
      r.n++; if (a.c !== null) { r.sc++; if (a.c) r.c++; }
    });
    const tot = Object.values(rows).reduce((t, r) => ({ n: t.n + r.n, sc: t.sc + r.sc, c: t.c + r.c }), { n: 0, sc: 0, c: 0 });
    html += `<h2>${SUBJECTS[code]} <span class="muted small">${tot.n} attempted · ${tot.sc ? pct(tot.c, tot.sc) + '% accuracy' : 'no scored attempts yet'}</span></h2>
      <div class="card"><table class="stats"><thead><tr><th>Unit</th><th class="num">Done</th><th class="num">Accuracy</th><th></th></tr></thead><tbody>
      ${Object.keys(avail).map(Number).sort((a, b) => a - b).filter((u) => u || rows[0]).map((u) => {
        const r = rows[u] || { n: 0, sc: 0, c: 0 }, a = pct(r.c, r.sc);
        return `<tr><td>${u ? `${u}. ${esc(unitName(code, u))}` : 'Untagged'}</td><td class="num">${r.n}/${avail[u]}</td>
          <td class="num">${r.sc ? a + '%' : '—'}</td>
          <td style="width:25%"><div class="bar"><div style="width:${r.sc ? a : 0}%;background:${a >= 60 ? 'var(--good)' : a >= 40 ? 'var(--warn)' : 'var(--bad)'}"></div></div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  if (store.history.length) html += `<h2>Exam history</h2><div class="card">${historyTable(store.history.slice(0, 30))}</div>`;
  html += `<h2>Your data</h2><div class="card"><p class="small muted">Progress lives in this browser's storage. Export it to back up, or to carry it to another device or browser.</p>
    <div class="row"><button class="btn" id="export">Export progress</button>
    <label class="btn">Import progress<input type="file" id="import" accept=".json,application/json" hidden></label>
    <span class="spacer"></span><button class="btn danger" id="reset">Reset all progress</button></div></div>`;
  app().innerHTML = html;
  $('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(store)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `netpyq-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  $('#import').onchange = async (e) => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!data.attempts) throw new Error('not a progress file');
      if (!confirm('Merge this file into your current progress? Newer answers win.')) return;
      for (const [id, a] of Object.entries(data.attempts)) if (!store.attempts[id] || store.attempts[id].t < a.t) store.attempts[id] = a;
      Object.assign(store.bookmarks, data.bookmarks || {});
      const seen = new Set(store.history.map((h) => h.t));
      store.history = store.history.concat((data.history || []).filter((h) => !seen.has(h.t))).sort((a, b) => b.t - a.t);
      save(); viewStats();
    } catch (err) { alert('Could not import: ' + err.message); }
  };
  $('#reset').onclick = () => {
    if (!confirm('Delete all attempts, bookmarks and exam history from this browser?')) return;
    store = { attempts: {}, bookmarks: {}, history: [], session: null, prefs: store.prefs };
    save(); viewStats();
  };
}

/* ---------- router ---------- */
function render() {
  if (!DB) return;
  const [, route, arg] = location.hash.split('/');
  if (route !== 'quiz') stopTimer();
  switch (route) {
    case 'papers': return viewPapers();
    case 'paper': return viewPaper(decodeURIComponent(arg || ''));
    case 'practice': return viewPractice();
    case 'quiz': return viewQuiz();
    case 'result': return viewResult();
    case 'review': return viewReview();
    case 'stats': return viewStats();
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

loadData().then(render).catch((err) => {
  app().innerHTML = `<div class="card"><h2>Couldn't load the questions</h2><p>${esc(err.message)}</p>
    <p class="small muted">Make sure <code>quiz-data.json</code> sits next to <code>index.html</code>. Opening the file directly (file://) doesn't work in most browsers; use the GitHub Pages URL or run <code>python3 -m http.server</code> in this folder.</p></div>`;
});
