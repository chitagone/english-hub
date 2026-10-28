/* ════════════════════════════════════════════════════════════════
   WriteRight ✎ — dictation practice
   data: window.DICT (built by build_dictation.py from Master Vocab)
   ════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const $ = (s) => document.querySelector(s);
const D = window.DICT;

const TRICKY_KEY = 'writeRight.tricky.v1';
const STATS_KEY = 'writeRight.stats.v1';
const THEME_KEY = 'writeRight.theme';
const VOICE_KEY = 'writeRight.voice';
const RATE_KEY = 'writeRight.rate';
const MIX_KEY = 'writeRight.mix';
const ARTICLE_KEY = 'writeRight.article';

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ── state ─────────────────────────────────────────────────── */

const S = {
  level: 'A1',            // selected deck
  mode: 'sentence',       // 'word' | 'sentence'
  answer: 'type',         // 'type' | 'book'
  len: 10,                // items per session (0 = all)
  shuffle: true,
  letters: new Set(),     // empty = ALL; otherwise first letters to keep
  queue: [],              // [{m,t,i,p,g,w,hint}]
  i: 0,
  right: 0, wrong: 0,
  missed: [],
  checked: false,         // current card checked/revealed
  review: false,          // session from tricky / missed
  fromTricky: false,
  rate: load(RATE_KEY, 0.9),   // speaking speed (voice picker)
  mix: load(MIX_KEY, false),   // shuffle voices: new voice each card
  curVoice: null,              // voice for the current card
  article: load(ARTICLE_KEY, ''),  // last pasted article text
  fromArticle: false,          // current session is article dictation
};

let tricky = load(TRICKY_KEY, {});
let stats = load(STATS_KEY, { total: 0, right: 0 });

/* ── speech ────────────────────────────────────────────────── */

let VOICE = null;
let VOICES = [];

const voiceKey = (v) => `${v.name} (${v.lang})`;
const GOOD_VOICE = /google|natural|neural|siri|premium|enhanced|samantha|aria|jenny|guy|libby|sonia|daniel|zira/i;

function autoVoice() {
  return (
    VOICES.find((v) => /en[-_]US/i.test(v.lang) && /google/i.test(v.name)) ||
    VOICES.find((v) => /en[-_]US/i.test(v.lang) && /natural|neural/i.test(v.name)) ||
    VOICES.find((v) => /en[-_]US/i.test(v.lang) && GOOD_VOICE.test(v.name)) ||
    VOICES.find((v) => /en[-_]US/i.test(v.lang)) ||
    VOICES.find((v) => /^en/i.test(v.lang)) || null
  );
}

function applyStoredVoice() {
  const stored = load(VOICE_KEY, '');
  VOICE = (stored && VOICES.find((v) => voiceKey(v) === stored)) || autoVoice();
}

function loadVoices() {
  VOICES = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
  applyStoredVoice();
  populateVoiceSel();
}

function populateVoiceSel() {
  const sel = $('#voice-sel');
  if (!sel) return;
  if (!VOICES.length) {
    sel.innerHTML = '<option value="">No voices found — using browser default</option>';
    return;
  }
  let list = VOICES.filter((v) => /^en/i.test(v.lang));
  if (!list.length) list = [...VOICES];
  // clearest first: recommended voices on top, then en-US, en-GB, rest A-Z
  list.sort((a, b) => {
    const ga = GOOD_VOICE.test(a.name) ? 0 : 1, gb = GOOD_VOICE.test(b.name) ? 0 : 1;
    if (ga !== gb) return ga - gb;
    const la = a.lang.replace('_', '-'), lb = b.lang.replace('_', '-');
    const rank = (l) => (l === 'en-US' ? 0 : l === 'en-GB' ? 1 : /^en/.test(l) ? 2 : 3);
    if (rank(la) !== rank(lb)) return rank(la) - rank(lb);
    return a.name.localeCompare(b.name);
  });
  const current = VOICE ? voiceKey(VOICE) : '';
  sel.innerHTML =
    list.map((v) => {
      const star = GOOD_VOICE.test(v.name) ? '★ ' : '';
      return `<option value="${esc(voiceKey(v))}"${voiceKey(v) === current ? ' selected' : ''}>${star}${esc(v.name)} — ${esc(v.lang)}</option>`;
    }).join('');
}

function speak(text, rate, voice) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voice || S.curVoice || VOICE;
    u.lang = v ? v.lang : 'en-US';
    u.rate = rate;
    u.pitch = 1;
    if (v) u.voice = v;
    const btn = $('#btn-play');
    btn.classList.add('speaking');
    u.onend = u.onerror = () => btn.classList.remove('speaking');
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

/* a random English voice for shuffle mode */
function randomVoice() {
  const en = VOICES.filter((v) => /^en/i.test(v.lang));
  const pool = en.length ? en : VOICES;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : VOICE;
}

/* ── voice modal ───────────────────────────────────────────── */

function openVoice() {
  loadVoices();                      // refresh list & selection
  $('#rate').value = S.rate;
  $('#rate-val').textContent = S.rate.toFixed(2) + '×';
  $('#mix-toggle').setAttribute('aria-checked', S.mix);
  $('#voice-modal').hidden = false;
}
const closeVoice = () => { $('#voice-modal').hidden = true; };

function bindVoiceModal() {
  $('#btn-voice').addEventListener('click', openVoice);
  $('#btn-voice-p').addEventListener('click', openVoice);
  $('#voice-close').addEventListener('click', closeVoice);
  $('#voice-modal').addEventListener('click', (e) => {
    if (e.target === $('#voice-modal')) closeVoice();
  });
  $('#voice-sel').addEventListener('change', (e) => {
    save(VOICE_KEY, e.target.value);
    applyStoredVoice();
    if (!S.mix) S.curVoice = VOICE;
    speak('This is how I sound now. Can you hear me clearly?', S.rate, VOICE);
  });
  $('#rate').addEventListener('input', (e) => {
    S.rate = +e.target.value;
    $('#rate-val').textContent = S.rate.toFixed(2) + '×';
    save(RATE_KEY, S.rate);
  });
  $('#rate').addEventListener('change', () => speak('Normal speed sounds like this.', S.rate, VOICE));
  $('#mix-toggle').addEventListener('click', () => {
    S.mix = !S.mix;
    $('#mix-toggle').setAttribute('aria-checked', S.mix);
    save(MIX_KEY, S.mix);
    if (!S.mix) S.curVoice = VOICE;
  });
  $('#voice-test').addEventListener('click', () => {
    speak('The thought of a Thursday birthday really threw me.', S.rate, VOICE);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#voice-modal').hidden) closeVoice();
  });
}

/* ── normalization + diff ──────────────────────────────────── */

const clean = (s) =>
  s.toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

// compare letters (word mode) — ignore case/outer punctuation
const normWord = (s) => clean(s).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
// compare words (sentence mode) — forgiving about punctuation & doubling spaces
const normSent = (s) =>
  clean(s).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* LCS diff -> ops: {o:'m'|'del'|'ins', t?, y?} over units */
function diff(target, typed) {
  const n = target.length, m = typed.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = target[i] === typed[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (target[i] === typed[j]) { ops.push({ o: 'm', t: target[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ o: 'del', t: target[i] }); i++; }
    else { ops.push({ o: 'ins', y: typed[j] }); j++; }
  }
  while (i < n) ops.push({ o: 'del', t: target[i++] });
  while (j < m) ops.push({ o: 'ins', y: typed[j++] });
  return ops;
}

function renderDiff(item, typedRaw) {
  const isWord = item.m !== 'sentence';   // letter diff for word & meaning modes
  const goal = isWord ? normWord(item.t) : normSent(item.t).split(' ');
  const yours = isWord ? normWord(typedRaw) : normSent(typedRaw).split(' ');
  const ops = diff(goal, yours);
  let yHtml = '', gHtml = '';
  for (const op of ops) {
    if (isWord) {
      if (op.o === 'm') { yHtml += `<b class="w-ok">${esc(op.t)}</b>`; gHtml += esc(op.t); }
      else if (op.o === 'del') { gHtml += `<b class="w-miss">${esc(op.t)}</b>`; }
      else { yHtml += `<b class="w-extra">${esc(op.y)}</b>`; }
    } else {
      if (op.o === 'm') { yHtml += `<b class="w-ok">${esc(op.t)}</b> `; gHtml += `${esc(op.t)} `; }
      else if (op.o === 'del') { gHtml += `<b class="w-miss">${esc(op.t)}</b> `; }
      else { yHtml += `<b class="w-extra">${esc(op.y)}</b> `; }
    }
  }
  const nUnits = goal.length;
  const matched = ops.filter((o) => o.o === 'm').length;
  return { yHtml, gHtml, pct: nUnits ? Math.round((matched / nUnits) * 100) : 0 };
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* keep the writing box growing with what you write (keyboard or Apple Pencil) */
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4)) + 'px';
}

/* ── article mode: split pasted text into dictation sentences ── */

function splitSentences(text) {
  if (!text || !text.trim()) return [];
  let t = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ');
  // protect dots that are NOT sentence ends: abbreviations, initials-style e.g./i.e., decimals
  t = t.replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|approx|Inc|Ltd|Co|No|Fig|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./gi, '$1\u0001');
  // internal dots only: the trailing dot stays a real sentence boundary
  t = t.replace(/\b(e)\.(g)\b/gi, '$1\u0001$2');
  t = t.replace(/\b(i)\.(e)\b/gi, '$1\u0001$2');
  t = t.replace(/\b(a)\.(m)\b/gi, '$1\u0001$2');
  t = t.replace(/\b(p)\.(m)\b/gi, '$1\u0001$2');
  t = t.replace(/\b(U)\.(S)\b/g, '$1\u0001$2');
  t = t.replace(/\b(U)\.(K)\b/g, '$1\u0001$2');
  t = t.replace(/(\d)\.(\d)/g, '$1\u0001$2');

  const out = [];
  let buf = '';
  const push = () => {
    const s = buf.replace(/\u0001/g, '.').replace(/\s+/g, ' ')
      .replace(/^[\s"'“‘]+/, '').replace(/[\s"'”’]+$/, '').trim();
    if (s.length > 1) out.push(s);
    buf = '';
  };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    buf += c;
    if (c === '.' || c === '!' || c === '?' || c === '\n') {
      let j = i + 1;
      let ws = '';
      while (j < t.length && /[ \n]/.test(t[j])) { ws += ' '; j++; }
      const next = t[j] || '';
      // boundary: end of text, paragraph break, or next chunk starts a new sentence
      if (c === '\n' && !buf.trim()) { buf = ''; i = j - 1; continue; }
      if (next === '' || /[A-Z0-9"'“‘(\[]/.test(next) || c === '\n') {
        push();
      } else {
        buf += ws;   // keep the space inside the sentence
      }
      i = j - 1;
    }
  }
  push();
  return out;
}

/* ── home: decks + letters + options ───────────────────────── */

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// source list for the current level+mode (before the A–Z letter filter)
function basePool() {
  if (S.mode === 'sentence') return D.sentences[S.level] || [];
  const base = D.words[S.level] || [];
  // meaning mode needs a gloss to read out
  return S.mode === 'meaning' ? base.filter((e) => e.g) : base;
}

// pool for the current level+mode, honoring the A–Z letter filter
function poolFor() {
  const base = basePool();
  if (!S.letters.size) return base;
  const key = (e) => (S.mode === 'sentence' ? (e.w || e.t) : e.t).charAt(0).toUpperCase();
  return base.filter((e) => S.letters.has(key(e)));
}

function renderLetters() {
  const base = basePool();
  const counts = {};
  for (const e of base) {
    const L = (S.mode === 'sentence' ? (e.w || e.t) : e.t).charAt(0).toUpperCase();
    counts[L] = (counts[L] || 0) + 1;
  }
  const letters = AZ.filter((L) => counts[L]);

  const html =
    `<button class="lt lt-all" data-lt="*" aria-pressed="${!S.letters.size}">ALL</button>` +
    letters
      .map((L) => `<button class="lt" data-lt="${L}" aria-pressed="${S.letters.has(L)}">${L}</button>`)
      .join('');
  $('#letters').innerHTML = html;

  const n = poolFor().length;
  const kind = S.mode === 'word' ? 'words' : S.mode === 'meaning' ? 'meanings' : 'sentences';
  const sel = S.letters.size ? [...S.letters].sort().join(', ') : 'ALL';
  $('#letters-count').textContent = `${n.toLocaleString()} ${kind} · ${sel}`;
}

/* mode-aware home UI: article box vs letters/length panels */
function updateArticleUI() {
  const n = splitSentences(S.article).length;
  $('#article-count').textContent = n
    ? `${n} sentence${n === 1 ? '' : 's'} found`
    : 'Paste or write your text here';
  $('#btn-start').disabled = S.mode === 'article' && n === 0;
}

function updateModeUI() {
  const isArt = S.mode === 'article';
  $('#article-wrap').hidden = !isArt;
  $('#letters-wrap').hidden = isArt;
  $('#row-opts').hidden = isArt;          // order & length are fixed for articles
  if (!isArt) renderLetters();
  updateArticleUI();
}

function renderHome() {
  // decks
  const counts = D.meta.counts;
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'EXTRA'];
  $('#decks').innerHTML = order
    .map((k) => {
      const c = counts[k];
      return `<button class="deck" data-lvl="${k}" aria-pressed="${k === S.level}">
        <div class="dk-lvl">${k}</div>
        <div class="dk-name">${esc(c.name)}</div>
        <div class="dk-meta"><b>${c.words}</b> words<br><b>${c.sentences}</b> sentences</div>
      </button>`;
    })
    .join('');

  renderLetters();
  const ai = $('#article-in');
  if (document.activeElement !== ai) ai.value = S.article;
  updateModeUI();

  // tricky
  const n = Object.keys(tricky).length;
  $('#tricky-quick').hidden = n === 0;
  $('#tricky-n').textContent = n;
  $('#tricky-text').innerHTML = `<b id="tricky-n">${n}</b> tricky item${n === 1 ? '' : 's'} waiting`;

  // overall stats
  const pct = stats.total ? Math.round((stats.right / stats.total) * 100) + '%' : '—';
  $('#stats-pct').textContent = pct;
  $('#stats-n').textContent = stats.total ? `${stats.total} done` : 'no practice yet';
}

function bindHome() {
  $('#decks').addEventListener('click', (e) => {
    const b = e.target.closest('.deck');
    if (!b) return;
    S.level = b.dataset.lvl;
    document.querySelectorAll('.deck').forEach((d) => d.setAttribute('aria-pressed', d === b));
    renderLetters();
  });

  // A–Z / ALL multi-select
  $('#letters').addEventListener('click', (e) => {
    const b = e.target.closest('.lt');
    if (!b) return;
    const lt = b.dataset.lt;
    if (lt === '*') S.letters.clear();
    else if (S.letters.has(lt)) S.letters.delete(lt);
    else S.letters.add(lt);
    renderLetters();
  });

  // 4-way mode group: word / sentence / meaning / article
  const MODES = { '#mode-word': 'word', '#mode-sentence': 'sentence', '#mode-meaning': 'meaning', '#mode-article': 'article' };
  Object.entries(MODES).forEach(([sel, val]) => {
    $(sel).addEventListener('click', () => {
      S.mode = val;
      Object.keys(MODES).forEach((s) => $(s).setAttribute('aria-pressed', s === sel));
      updateModeUI();
    });
  });

  // article box: live count + autosave
  $('#article-in').addEventListener('input', (e) => {
    S.article = e.target.value;
    save(ARTICLE_KEY, S.article);
    updateArticleUI();
  });
  $('#btn-article-clear').addEventListener('click', () => {
    S.article = '';
    save(ARTICLE_KEY, '');
    $('#article-in').value = '';
    updateArticleUI();
    $('#article-in').focus();
  });

  const pick = (id, key, val) => {
    $(id).addEventListener('click', () => {
      S[key] = val;
      const pair = [id, id.endsWith('type') ? id.replace(/type$/, 'book') : '#answer-type'];
      pair.forEach((sel) => $(sel).setAttribute('aria-pressed', sel === id));
    });
  };
  pick('#answer-type', 'answer', 'type');
  pick('#answer-book', 'answer', 'book');

  $('#len-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip-ch'); if (!b) return;
    S.len = +b.dataset.len;
    $$('#len-chips .chip-ch').forEach((c) => c.setAttribute('aria-pressed', c === b));
  });
  $('#ord-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip-ch'); if (!b) return;
    S.shuffle = b.dataset.shuf === '1';
    $$('#ord-chips .chip-ch').forEach((c) => c.setAttribute('aria-pressed', c === b));
  });

  $('#btn-start').addEventListener('click', () => startSession(false));
  $('#btn-tricky').addEventListener('click', () => startSession(true));
}

const $$ = (s) => [...document.querySelectorAll(s)];

/* ── session ───────────────────────────────────────────────── */

function itemOf(mode, e) {
  return {
    m: mode, t: e.t, i: e.i || '', p: e.p || '', g: e.g || '', w: e.w || '',
    ex: mode === 'sentence' ? [] : (e.ex || []),
    hint: false,
  };
}

function startSession(fromTricky) {
  let pool;
  const isArticle = !fromTricky && S.mode === 'article';
  if (fromTricky) {
    pool = Object.values(tricky).map((x) => ({ ...x, hint: false }));
    S.review = true; S.fromTricky = true; S.fromArticle = false;
  } else if (isArticle) {
    const sents = splitSentences($('#article-in').value || S.article);
    if (!sents.length) return;
    S.article = $('#article-in').value;
    save(ARTICLE_KEY, S.article);
    pool = sents.map((t) => ({ m: 'sentence', t, i: '', p: '', g: '', w: '', ex: [], hint: false }));
    S.review = false; S.fromTricky = false; S.fromArticle = true;
  } else {
    pool = poolFor().map((e) => itemOf(S.mode, e));
    S.review = false; S.fromTricky = false; S.fromArticle = false;
  }
  if (!pool.length) return;

  pool = [...pool];
  if (S.shuffle && !isArticle) shuffle(pool);
  else if (!isArticle) pool.sort((a, b) => a.t.localeCompare(b.t));
  if (S.len > 0 && !isArticle) pool = pool.slice(0, S.len);

  S.queue = pool;
  S.i = 0; S.right = 0; S.wrong = 0; S.missed = [];
  show('practice');
  loadCard();
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── practice card ─────────────────────────────────────────── */

/* show/hide BOTH next buttons (sticky top bar + bottom) together */
const setNext = (v) => {
  $('#btn-next').hidden = !v;
  $('#btn-next-top').hidden = !v;
};

function cur() { return S.queue[S.i]; }

/* what the speaker says for a card: the word/sentence itself, or its meaning */
const promptOf = (it) => (it.m === 'meaning' ? it.g : it.t);

/* hide the target word if a gloss happens to contain it */
function maskWordInGloss(g, w) {
  if (!g || !w) return g || '';
  try {
    return g.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), '___');
  } catch { return g; }
}

function loadCard() {
  const it = cur();
  S.checked = false;

  // voice for this card: a fresh random one in shuffle mode
  S.curVoice = S.mix ? randomVoice() : VOICE;

  const kind = it.m === 'word' ? 'word' : it.m === 'meaning' ? 'meaning' : 'sentence';
  $('#listen-tag').textContent =
    `${kind} · ${S.fromTricky ? 'tricky' : S.fromArticle ? 'article' : S.level}${S.mix ? ' · 🎙' : ''}`;
  $('#listen-sub').textContent =
    (it.m === 'word'
      ? 'Listen and write the word'
      : it.m === 'meaning'
        ? 'Which word means this? Write the word'
        : 'Listen and write the sentence') +
    (S.mix ? ' — a new voice each card' : '');

  // meaning mode: show the gloss (with the answer masked out of it)
  const mb = $('#meaning-box');
  if (it.m === 'meaning') {
    mb.hidden = false;
    $('#meaning-txt').textContent = maskWordInGloss(it.g, it.t);
    const pos = $('#meaning-pos');
    if (it.p) { pos.hidden = false; pos.textContent = it.p; }
    else pos.hidden = true;
  } else {
    mb.hidden = true;
  }

  $('#type-label').textContent = it.m === 'meaning' ? 'Type the word it means' : 'Write what you hear';
  $('#hint-line').hidden = true;

  // reset answer areas
  $('#area-type').hidden = S.answer !== 'type';
  $('#area-book').hidden = S.answer !== 'book';
  $('#result-card').hidden = true;
  $('#grade-row').hidden = true;
  setNext(false);
  const inp = $('#type-in');
  inp.value = '';
  inp.classList.remove('done-ok', 'done-bad');
  inp.readOnly = false;
  autoGrow(inp);

  // progress + score
  $('#prac-i').textContent = S.i + 1;
  $('#prac-n').textContent = S.queue.length;
  $('#bar-fill').style.width = `${(S.i / S.queue.length) * 100}%`;
  $('#sc-ok').textContent = `✓ ${S.right}`;
  $('#sc-bad').textContent = `✗ ${S.wrong}`;

  if (S.answer === 'type') setTimeout(() => inp.focus(), 60);
  play();
}

function play() { speak(promptOf(cur()), S.rate); }

function showHint() {
  const it = cur();
  it.hint = true;
  const el = $('#hint-line');
  if (it.m === 'sentence') {
    const ws = it.t.split(' ');
    el.textContent = ws.map((w) => w[0] + '·').join(' ') + `  (${ws.length} words)`;
  } else {
    // word & meaning: reveal the first letter, dot the rest
    const letters = it.t.split('');
    el.textContent = letters.map((c, i) =>
      i === 0 || !/[a-z]/i.test(c) ? c : '·').join('');
  }
  el.hidden = false;
}

function reveal(diffData, selfAssess) {
  const it = cur();
  S.checked = true;
  $('#result-card').hidden = false;

  const v = $('#verdict');
  if (selfAssess) {
    v.className = 'verdict self';
    v.textContent = 'Check your book ✎';
  } else if (diffData.ok) {
    v.className = 'verdict ok';
    v.textContent = '✓ Perfect!';
  } else {
    v.className = 'verdict bad';
    v.textContent = `✗ ${diffData.pct}% close — look again`;
  }

  $('#reveal-text').textContent = it.t;
  $('#reveal-ipa').textContent = it.m !== 'sentence' && it.i ? it.i : '';
  $('#reveal-gloss').innerHTML = it.g
    ? `<b>${it.m === 'sentence' ? esc(it.w) + ' — ' : ''}${esc(it.g)}</b>`
    : '';

  // word & meaning modes: a different example sentence each time this word appears
  const exBox = $('#reveal-ex');
  if (it.m !== 'sentence' && it.ex && it.ex.length) {
    const s = it.ex[Math.floor(Math.random() * it.ex.length)];
    exBox.hidden = false;
    $('#reveal-ex-text').innerHTML =
      `<span class="ex-lab">example · tap to hear</span>${esc(s)}`;
  } else {
    exBox.hidden = true;
  }

  // meaning mode: now say the answer word out loud so it sticks
  if (it.m === 'meaning') setTimeout(() => speak(it.t, S.rate * 0.95), 420);

  // diff (type mode only)
  const box = $('#diff-box');
  if (diffData && !selfAssess) {
    box.hidden = false;
    $('#diff-yours').innerHTML = diffData.yHtml || '<b class="w-extra">(nothing)</b>';
    $('#diff-goal').innerHTML = diffData.gHtml;
  } else {
    box.hidden = true;
  }

  if (S.answer === 'type') {
    const inp = $('#type-in');
    inp.readOnly = true;
    inp.classList.add(diffData.ok ? 'done-ok' : 'done-bad');
    setNext(true);
    $('#btn-next-top').focus();   // top button: no scrolling down
  } else {
    $('#grade-row').hidden = false;
  }
}

function checkTyped() {
  if (S.checked) return next();
  const it = cur();
  const raw = $('#type-in').value;
  const norm = it.m === 'sentence' ? normSent : normWord;   // meaning answer is a single word
  const ok = norm(raw) === norm(it.t) && norm(it.t).length > 0;
  const d = renderDiff(it, raw);
  d.ok = ok;
  reveal(d, false);
  grade(ok);
}

function grade(ok) {
  const it = cur();
  if (ok) {
    S.right++;
    delete tricky[it.m + '|' + it.t];
  } else {
    S.wrong++;
    S.missed.push(it);
    tricky[it.m + '|' + it.t] = { m: it.m, t: it.t, i: it.i, p: it.p, g: it.g, w: it.w, ex: it.ex || [] };
    const keys = Object.keys(tricky);
    if (keys.length > 300) delete tricky[keys[0]];
  }
  stats.total++;
  if (ok) stats.right++;
  save(TRICKY_KEY, tricky);
  save(STATS_KEY, stats);
  $('#sc-ok').textContent = `✓ ${S.right}`;
  $('#sc-bad').textContent = `✗ ${S.wrong}`;
}

function next() {
  if (S.i + 1 >= S.queue.length) return results();
  S.i++;
  loadCard();
}

/* ── results ───────────────────────────────────────────────── */

function results() {
  speechSynthesis?.cancel?.();
  const total = S.queue.length;
  const pct = total ? Math.round((S.right / total) * 100) : 0;
  show('results');
  $('#res-ring').style.background =
    `conic-gradient(var(--teal) ${pct}%, var(--line) ${pct}%)`;
  $('#res-pct').textContent = pct + '%';
  $('#res-sub').textContent =
    `${S.right} right · ${S.wrong} to review · ${total} item${total === 1 ? '' : 's'}`;
  $('#res-title').textContent =
    pct === 100 ? 'Flawless!' : pct >= 70 ? 'Great work!' : 'Good practice!';

  const wrap = $('#res-missed-wrap');
  if (S.missed.length) {
    wrap.hidden = false;
    $('#missed-list').innerHTML = S.missed
      .map((it, idx) => {
        const gloss = it.g ? `<small>${esc(it.g)}</small>` : '';
        const hb = it.hint ? '<span class="mi-hint">hint</span>' : '';
        return `<div class="missed-item">
          <button class="mi-play" data-play="${idx}" title="Play" aria-label="Play">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <div class="mi-txt"><b>${esc(it.t)}</b>${gloss}</div>${hb}
        </div>`;
      })
      .join('');
  } else {
    wrap.hidden = true;
  }
}

/* ── screens + theme ───────────────────────────────────────── */

function show(name) {
  ['home', 'practice', 'results'].forEach((s) => {
    $(`#screen-${s}`).hidden = s !== name;
  });
  window.scrollTo(0, 0);
}

function bindTheme() {
  const apply = (t) => document.documentElement.classList.toggle('dark', t === 'dark');
  apply(load(THEME_KEY, 'light'));
  $('#btn-theme').addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark');
    apply(dark ? 'dark' : 'light');
    save(THEME_KEY, dark ? 'dark' : 'light');
  });
}

/* ── practice events ───────────────────────────────────────── */

function bindPractice() {
  $('#btn-back').addEventListener('click', () => { speechSynthesis?.cancel?.(); renderHome(); show('home'); });
  $('#btn-play').addEventListener('click', play);
  $('#btn-slow').addEventListener('click', () => speak(promptOf(cur()), Math.max(0.4, S.rate * 0.55)));
  $('#btn-hint').addEventListener('click', showHint);

  $('#btn-check').addEventListener('click', checkTyped);
  $('#type-in').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); checkTyped(); }
  });
  $('#type-in').addEventListener('input', (e) => autoGrow(e.target));
  $('#btn-clear').addEventListener('click', () => {
    const inp = $('#type-in');
    inp.value = '';
    autoGrow(inp);
    if (!inp.readOnly) inp.focus();
  });

  $('#btn-reveal').addEventListener('click', () => reveal(null, true));
  $('#reveal-ex').addEventListener('click', () => {
    const s = $('#reveal-ex-text').textContent.replace(/^example · tap to hear/, '').trim();
    speak(s || cur().t, S.rate * 0.95);
  });
  $('#btn-right').addEventListener('click', () => { grade(true); afterSelf(); });
  $('#btn-wrong').addEventListener('click', () => { grade(false); afterSelf(); });
  $('#btn-next').addEventListener('click', next);
  $('#btn-next-top').addEventListener('click', next);

  // global keys (only when no interactive element is focused)
  document.addEventListener('keydown', (e) => {
    if ($('#screen-practice').hidden || $('#screen-results').hidden === false) return;
    if (!$('#voice-modal').hidden) return;   // voice picker is open
    const t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('button')) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') { e.preventDefault(); play(); }
    if (k === 's') speak(promptOf(cur()), Math.max(0.4, S.rate * 0.55));
    if (k === 'h') showHint();
    // book-mode self grade
    if (S.answer === 'book' && S.checked) {
      if (e.key === '1') $('#btn-right').click();
      if (e.key === '2') $('#btn-wrong').click();
    }
  });

  // results
  $('#missed-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-play]');
    if (!b) return;
    const it = S.missed[+b.dataset.play];
    if (it) speak(it.t, S.rate, VOICE);   // review with your base voice
  });
  $('#btn-again').addEventListener('click', () => {
    S.queue = S.missed.map((it) => ({ ...it, hint: false }));
    S.i = 0; S.right = 0; S.wrong = 0; S.missed = [];
    S.review = true;
    show('practice');
    loadCard();
  });
  $('#btn-newsession').addEventListener('click', () => { renderHome(); show('home'); });
  $('#btn-home').addEventListener('click', () => { renderHome(); show('home'); });
}

function afterSelf() {
  $('#grade-row').hidden = true;
  setNext(true);
  $('#verdict').className = S.lastSelfOk ? 'verdict ok' : 'verdict bad';
  $('#btn-next-top').focus();
}

/* patch grade() to remember self-assessment for afterSelf */
const _grade = grade;
grade = function (ok) { S.lastSelfOk = ok; _grade(ok); };

/* ── boot ──────────────────────────────────────────────────── */

bindTheme();
bindHome();
bindPractice();
bindVoiceModal();
renderHome();
show('home');

// speech setup
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
} else {
  const b = document.createElement('div');
  b.className = 'no-speech';
  b.textContent = '⚠ This browser has no speech synthesis — try Chrome or Edge to hear the words.';
  $('#screen-home .hero').after(b);
}
})();
