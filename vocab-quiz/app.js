/* ════════════════════════════════════════════════════════════════
   QuizWiz 🎯 — vocabulary quiz games
   data: window.VQ (built by build_vocab_quiz.py from Master Vocab)
   games: word→meaning · meaning→word · listen&guess · missing word
          scramble · speed round · true/false
   ════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const VQ = window.VQ;

const STATS_KEY = 'quizwiz-v1';
const TRICKY_KEY = 'quizwiz.tricky.v1';
const SET_KEY = 'quizwiz.set.v1';
const THEME_KEY = 'writeRight.theme';          // shared with the hub
const VOICE_KEY = 'writeRight.voice';          // shared with WriteRight
const RATE_KEY = 'writeRight.rate';

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GAMES = {
  wm:      { ico: '🎯', name: 'Word → Meaning', sub: 'see the word, pick the meaning', tag: '🎯 word → meaning' },
  mw:      { ico: '💬', name: 'Meaning → Word', sub: 'see the meaning, pick the word', tag: '💬 meaning → word' },
  listen:  { ico: '🎧', name: 'Listen & Guess', sub: 'hear the word, pick it — listening', tag: '🎧 listen & guess' },
  cloze:   { ico: '🧩', name: 'Missing Word', sub: 'example with a gap, pick the word', tag: '🧩 missing word' },
  scramble:{ ico: '🔀', name: 'Scramble', sub: 'unscramble the letters, type it', tag: '🔀 scramble' },
  speed:   { ico: '⚡', name: 'Speed Round', sub: '60 seconds · rapid-fire mix', tag: '⚡ speed round' },
  tf:      { ico: '✅', name: 'True or False', sub: 'is this really its meaning?', tag: '✅ true or false' },
};
const GAME_ORDER = ['wm', 'mw', 'listen', 'cloze', 'scramble', 'speed', 'tf'];

/* ── state ─────────────────────────────────────────────────── */

const set0 = load(SET_KEY, {});
const S = {
  level: set0.level || 'A1',
  game: set0.game || 'wm',
  len: set0.len ?? 10,
  shuffle: set0.shuffle ?? true,
  letters: new Set(set0.letters || []),
  // session
  queue: [],            // word items for this session
  i: 0,
  right: 0, wrong: 0,
  missed: [],           // word items answered wrong
  q: null,              // current question object
  answered: false,
  fromTricky: false,
  replayOf: null,       // missed-replay source queue
  speedLeft: 60,
  speedTimer: null,
};

let stats = load(STATS_KEY, { total: 0, right: 0, days: [], best: { speed: 0 } });
let tricky = load(TRICKY_KEY, {});

const todayStr = () => new Date().toISOString().slice(0, 10);

function logDay() {
  if (!stats.days) stats.days = [];
  if (!stats.days.includes(todayStr())) stats.days.push(todayStr());
}

function persistStats() { save(STATS_KEY, stats); }

function persistSet() {
  save(SET_KEY, { level: S.level, game: S.game, len: S.len, shuffle: S.shuffle, letters: [...S.letters] });
}

/* ── speech (voice shared with WriteRight) ─────────────────── */

let VOICE = null, VOICES = [];
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

function loadVoices() {
  VOICES = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
  const stored = load(VOICE_KEY, '');
  VOICE = (stored && VOICES.find((v) => voiceKey(v) === stored)) || autoVoice();
  populateVoiceSel();
}

function populateVoiceSel() {
  const sel = $('#voice-sel');
  if (!sel) return;
  if (!VOICES.length) { sel.innerHTML = '<option value="">No voices found</option>'; return; }
  let list = VOICES.filter((v) => /^en/i.test(v.lang));
  if (!list.length) list = [...VOICES];
  list.sort((a, b) => {
    const ga = GOOD_VOICE.test(a.name) ? 0 : 1, gb = GOOD_VOICE.test(b.name) ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
  });
  sel.innerHTML = list.map((v) => {
    const star = GOOD_VOICE.test(v.name) ? '★ ' : '';
    return `<option value="${esc(voiceKey(v))}"${VOICE && voiceKey(v) === voiceKey(VOICE) ? ' selected' : ''}>${star}${esc(v.name)} — ${esc(v.lang)}</option>`;
  }).join('');
}

function speak(text, rate) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE ? VOICE.lang : 'en-US';
    u.rate = rate ?? load(RATE_KEY, 0.9);
    if (VOICE) u.voice = VOICE;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

/* ── theme (shared with the hub) ───────────────────────────── */

function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#12100B' : '#F6EFDF');
}
applyTheme(load(THEME_KEY, null) ||
  (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

/* ── pools ─────────────────────────────────────────────────── */

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function basePool(level) {
  return (VQ.words[level || S.level] || []);
}

// pool honoring the A–Z filter
function poolFor(level) {
  const base = basePool(level);
  if (!S.letters.size) return base;
  return base.filter((e) => S.letters.has(e.t.charAt(0).toUpperCase()));
}

// pool for the selected game (needs gloss / matching example…)
function gamePool(game, level) {
  const p = poolFor(level);
  if (game === 'wm' || game === 'mw' || game === 'tf' || game === 'speed') return p.filter((e) => e.g);
  if (game === 'cloze') return p.filter((e) => e.g && clozeFor(e));
  return p;
}

/* ── cloze: blank the word inside one of its examples ─────── */

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function clozeFor(w) {
  const forms = [w.t, w.t + 's', w.t + 'es', w.t + 'd', w.t + 'ed', w.t + 'ing'];
  for (const ex of w.ex || []) {
    for (const f of forms) {
      const re = new RegExp(`\\b(${reEsc(f)})\\b`, 'i');
      if (re.test(ex)) {
        // blank it out — the word must NOT be visible in the gap
        const html = esc(ex).replace(new RegExp(`\\b(${reEsc(esc(f))})\\b`, 'i'), '<span class="gap">______</span>');
        return { html, raw: ex };
      }
    }
  }
  return null;
}

/* ── question builders ─────────────────────────────────────── */

const rnd = (n) => Math.floor(Math.random() * n);
function pickDistractors(pool, correct, keyFn, n) {
  const out = [];
  const seen = new Set([String(keyFn(correct)).toLowerCase()]);
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const c = pool[rnd(pool.length)];
    if (!c) break;
    const k = String(keyFn(c)).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQ(game, w, pool) {
  const q = { game, w, options: null, correctIdx: 0 };
  if (game === 'wm') {
    const ds = pickDistractors(pool, w, (x) => x.g, 3);
    q.options = shuffleArr([w, ...ds]).map((x) => ({ text: x.g, word: x }));
    q.correctIdx = q.options.findIndex((o) => o.word === w);
    return q;
  }
  if (game === 'mw' || game === 'listen') {
    const ds = pickDistractors(pool, w, (x) => x.t, 3);
    q.options = shuffleArr([w, ...ds]).map((x) => ({ text: x.t, word: x }));
    q.correctIdx = q.options.findIndex((o) => o.word === w);
    return q;
  }
  if (game === 'cloze') {
    const ds = pickDistractors(pool, w, (x) => x.t, 3);
    q.options = shuffleArr([w, ...ds]).map((x) => ({ text: x.t, word: x }));
    q.correctIdx = q.options.findIndex((o) => o.word === w);
    q.cloze = clozeFor(w);
    return q;
  }
  if (game === 'tf') {
    const isTrue = Math.random() < 0.5;
    let claim = w.g;
    if (!isTrue) {
      const other = pickDistractors(pool, w, (x) => x.g, 1)[0];
      if (!other) return buildQ('wm', w, pool);   // fallback
      claim = other.g;
    }
    q.claim = claim;
    q.isTrue = isTrue;
    return q;
  }
  if (game === 'scramble') {
    const letters = (w.t.match(/[a-z]/gi) || []);
    let scr = [...letters];
    let guard = 0;
    do { scr = shuffleArr([...scr]); } while (letters.length > 1 && scr.join('') === letters.join('') && guard++ < 20);
    q.tiles = scr.map((c) => c.toUpperCase());
    return q;
  }
  return q;
}

/* ── home rendering ────────────────────────────────────────── */

function renderDecks() {
  const counts = VQ.meta.counts;
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'EXTRA'].filter((k) => counts[k]);
  if (!counts[S.level]) S.level = order[0];
  $('#decks').innerHTML = order.map((k) => {
    const c = counts[k];
    return `<button class="deck" data-lvl="${k}" aria-pressed="${k === S.level}">
      <div class="dk-lvl">${k}</div>
      <div class="dk-name">${esc(c.name)}</div>
      <div class="dk-meta"><b>${c.words.toLocaleString()}</b> words</div>
    </button>`;
  }).join('');
}

function renderLetters() {
  const base = basePool();
  const counts = {};
  for (const e of base) {
    const L = e.t.charAt(0).toUpperCase();
    counts[L] = (counts[L] || 0) + 1;
  }
  const letters = AZ.filter((L) => counts[L]);
  $('#letters').innerHTML =
    `<button class="lt lt-all" data-lt="*" aria-pressed="${!S.letters.size}">ALL</button>` +
    letters.map((L) => `<button class="lt" data-lt="${L}" aria-pressed="${S.letters.has(L)}">${L}</button>`).join('');

  const n = poolFor().length;
  const sel = S.letters.size ? [...S.letters].sort().join(', ') : 'ALL';
  $('#letters-count').textContent = `${n.toLocaleString()} words · ${sel}`;

  const gp = gamePool(S.game);
  $('#btn-start').disabled = !gp.length;
  if (gp.length && gp.length < 4 && ['wm', 'mw', 'listen', 'cloze'].includes(S.game)) {
    $('#btn-start').disabled = true;   // not enough distractors
  }
}

function renderGames() {
  $('#games').innerHTML = GAME_ORDER.map((k) => {
    const g = GAMES[k];
    return `<button class="game" data-game="${k}" aria-pressed="${k === S.game}">
      <div class="g-ico">${g.ico}</div>
      <div class="g-name">${esc(g.name)}</div>
      <span class="g-sub">${esc(g.sub)}</span>
    </button>`;
  }).join('');
}

function updateHomeUI() {
  const isSpeed = S.game === 'speed';
  $('#row-opts').hidden = isSpeed;               // fixed 60s, no length/order
  renderLetters();
}

function renderHome() {
  renderDecks();
  renderGames();
  updateHomeUI();

  // tricky quick-start
  const tKeys = Object.keys(tricky);
  $('#tricky-quick').hidden = !tKeys.length;
  $('#tricky-n').textContent = tKeys.length;
  $('#tricky-text').innerHTML = `<b id="tricky-n">${tKeys.length}</b> tricky word${tKeys.length === 1 ? '' : 's'} waiting`;

  // overall stats chip (+ streak)
  const pct = stats.total ? Math.round((stats.right / stats.total) * 100) + '%' : '—';
  const set = new Set(stats.days || []);
  let streak = 0;
  const d = new Date();
  if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  $('#stats-pct').textContent = pct;
  $('#stats-n').textContent = stats.total
    ? `${stats.total.toLocaleString()} answered${streak >= 1 ? ` · 🔥 ${streak}` : ''}`
    : 'no practice yet';
}

function bindHome() {
  $('#decks').addEventListener('click', (e) => {
    const b = e.target.closest('.deck');
    if (!b) return;
    S.level = b.dataset.lvl;
    $$('#decks .deck').forEach((d) => d.setAttribute('aria-pressed', d === b));
    persistSet();
    updateHomeUI();
  });

  $('#letters').addEventListener('click', (e) => {
    const b = e.target.closest('.lt');
    if (!b) return;
    const lt = b.dataset.lt;
    if (lt === '*') S.letters.clear();
    else if (S.letters.has(lt)) S.letters.delete(lt);
    else S.letters.add(lt);
    persistSet();
    renderLetters();
  });

  $('#games').addEventListener('click', (e) => {
    const b = e.target.closest('.game');
    if (!b) return;
    S.game = b.dataset.game;
    $$('#games .game').forEach((g) => g.setAttribute('aria-pressed', g === b));
    persistSet();
    updateHomeUI();
  });

  $('#len-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip-ch');
    if (!b) return;
    S.len = +b.dataset.len;
    $$('#len-chips .chip-ch').forEach((c) => c.setAttribute('aria-pressed', c === b));
    persistSet();
  });

  $('#ord-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip-ch');
    if (!b) return;
    S.shuffle = b.dataset.shuf === '1';
    $$('#ord-chips .chip-ch').forEach((c) => c.setAttribute('aria-pressed', c === b));
    persistSet();
  });

  $('#btn-start').addEventListener('click', startSession);
  $('#btn-tricky').addEventListener('click', startTricky);
}

/* ── session ───────────────────────────────────────────────── */

function startSession() {
  let pool = gamePool(S.game);
  if (!pool.length) return;
  if (S.shuffle) shuffleArr(pool);
  let q = [...pool];
  if (S.game === 'speed') {
    // endless-feeling rapid fire: repeat the shuffled pool up to ~120 cards
    const big = [];
    while (big.length < 120 && big.length < q.length * 4) big.push(...q);
    q = big;
  } else if (S.len > 0) {
    q = q.slice(0, S.len);
  }
  beginQueue(q, S.game, false);
}

function startTricky() {
  // mixed games over the tricky pool
  let pool = Object.values(tricky).map((e) => e.item).filter(Boolean);
  if (!pool.length) return;
  shuffleArr(pool);
  const len = S.len > 0 ? S.len : 10;
  beginQueue(pool.slice(0, len), 'mix', true);
}

function beginQueue(queue, game, fromTricky, replayOf) {
  S.queue = queue;
  S.gameMode = game;                 // 'mix' means per-question game
  S.i = 0; S.right = 0; S.wrong = 0;
  S.missed = [];
  S.fromTricky = !!fromTricky;
  S.replayOf = replayOf || null;
  show('practice');
  if (S.gameMode === 'speed') startTimer();
  loadCard();
}

function startTimer() {
  S.speedLeft = 60;
  updateTimer();
  clearInterval(S.speedTimer);
  S.speedTimer = setInterval(() => {
    S.speedLeft -= 1;
    updateTimer();
    if (S.speedLeft <= 0) endSession();
  }, 1000);
}

function updateTimer() {
  $('#time-n').textContent = Math.max(0, S.speedLeft);
  $('#bar-fill').style.width = Math.max(0, S.speedLeft / 60 * 100) + '%';
  $('#sc-time').style.color = S.speedLeft <= 10 ? 'var(--coral)' : '';
}

/* ── practice screen ───────────────────────────────────────── */

const PROMPTS = { wm: '#q-word', mw: '#q-meaning', listen: '#q-listen', cloze: '#q-cloze', scramble: '#q-scramble', tf: '#q-tf' };

function curGame() {
  if (S.gameMode === 'speed') return Math.random() < 0.5 ? 'wm' : 'mw';
  if (S.gameMode !== 'mix') return S.gameMode;
  // tricky review: random workable game for this word
  const w = S.queue[S.i];
  const opts = ['wm', 'mw', 'listen'];
  if (w.g && clozeFor(w)) opts.push('cloze');
  return opts[rnd(opts.length)];
}

function loadCard() {
  const w = S.queue[S.i];
  if (!w) { endSession(); return; }
  const game = curGame();
  let pool = gamePool(game);
  if (pool.length < 5) pool = basePool();
  S.q = buildQ(game, w, pool);
  S.answered = false;

  // header
  const isSpeed = S.gameMode === 'speed';
  $('#sc-time').hidden = !isSpeed;
  $('.prac-count').hidden = isSpeed;
  if (isSpeed) { $('#prac-i').textContent = S.right + S.wrong + 1; $('#prac-n').textContent = '∞'; }
  else { $('#prac-i').textContent = S.i + 1; $('#prac-n').textContent = S.queue.length; }
  if (!isSpeed) $('#bar-fill').style.width = (S.i / S.queue.length * 100) + '%';
  $('#sc-ok').textContent = '✓ ' + S.right;
  $('#sc-bad').textContent = '✗ ' + S.wrong;

  // card
  $('#q-tag').textContent = GAMES[game].tag + ' · ' + (S.fromTricky ? '⭐ tricky' : S.level);

  Object.values(PROMPTS).forEach((sel) => { $(sel).hidden = true; });
  $('#choices').innerHTML = '';
  $('#choices').hidden = true;
  $('#scr-answer').hidden = true;
  $('#tf-row').hidden = true;
  $('#reveal').hidden = true;

  if (game === 'wm') {
    $('#q-word').hidden = false;
    $('#qw-text').textContent = w.t;
    $('#qw-ipa').textContent = w.i || '';
    $('#qw-ipa').hidden = !w.i;
    $('#qw-pos').textContent = w.p || '';
    $('#qw-pos').hidden = !w.p;
  } else if (game === 'mw') {
    $('#q-meaning').hidden = false;
    $('#qm-text').textContent = w.g;
    $('#qm-pos').textContent = w.p || '';
    $('#qm-pos').hidden = !w.p;
  } else if (game === 'listen') {
    $('#q-listen').hidden = false;
    setTimeout(() => speak(w.t), 250);
  } else if (game === 'cloze') {
    $('#q-cloze').hidden = false;
    $('#qc-text').innerHTML = S.q.cloze.html;
  } else if (game === 'scramble') {
    $('#q-scramble').hidden = false;
    $('#scr-tiles').innerHTML = S.q.tiles.map((c) => `<span class="scr-tile">${c}</span>`).join('');
    $('#scr-hint').textContent = w.g || '';
    $('#scr-pos').textContent = (w.p ? w.p + ' · ' : '') + `${w.t.replace(/[^a-z]/gi, '').length} letters`;
    $('#scr-in').value = '';
    setTimeout(() => $('#scr-in').focus(), 100);
  } else if (game === 'tf') {
    $('#q-tf').hidden = false;
    $('#tf-word').textContent = w.t;
    $('#tf-claim').textContent = S.q.claim;
  }

  if (game === 'scramble') { $('#scr-answer').hidden = false; }
  else if (game === 'tf') { $('#tf-row').hidden = false; }
  else {
    $('#choices').hidden = false;
    $('#choices').innerHTML = S.q.options.map((o, idx) =>
      `<button class="choice" data-idx="${idx}"><span class="c-num">${idx + 1}</span><span>${esc(o.text)}</span></button>`
    ).join('');
  }
}

function scoreAnswer(ok) {
  const w = S.queue[S.i];
  const key = (w.lvl || S.level) + ':' + w.t;
  if (ok) S.right++;
  else {
    S.wrong++;
    S.missed.push(w);
    tricky[key] = { item: w };
    save(TRICKY_KEY, tricky);
  }
  // mastered in a tricky review → set it free
  if (ok && S.fromTricky) {
    delete tricky[key];
    save(TRICKY_KEY, tricky);
  }
  stats.total++;
  if (ok) stats.right++;
  logDay();
  persistStats();
  $('#sc-ok').textContent = '✓ ' + S.right;
  $('#sc-bad').textContent = '✗ ' + S.wrong;
}

function answerChoice(idx) {
  if (S.answered || !S.q || !S.q.options) return;
  S.answered = true;
  const ok = idx === S.q.correctIdx;
  scoreAnswer(ok);
  $$('#choices .choice').forEach((b, i) => {
    b.disabled = true;
    if (i === S.q.correctIdx) b.classList.add('correct');
    else if (i === idx) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  showReveal(ok);
}

function answerTF(said) {
  if (S.answered || !S.q) return;
  S.answered = true;
  const ok = said === S.q.isTrue;
  scoreAnswer(ok);
  const bt = $('#btn-true'), bf = $('#btn-false');
  [bt, bf].forEach((b) => (b.disabled = true));
  (S.q.isTrue ? bt : bf).classList.add('correct');
  if (!ok) (said ? bt : bf).classList.add('wrong');
  showReveal(ok);
}

function checkScramble() {
  if (S.answered || !S.q) return;
  const val = $('#scr-in').value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const goal = S.q.w.t.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!val) return;
  S.answered = true;
  const ok = val === goal;
  scoreAnswer(ok);
  $('#scr-in').disabled = true;
  $('#btn-scr-check').disabled = true;
  $('#btn-scr-hint').disabled = true;
  if (!ok) $('#scr-in').style.borderColor = 'var(--coral)';
  showReveal(ok);
}

function showReveal(ok) {
  const w = S.q.w;
  const game = S.q.game;

  // speed round: quick flash, no reveal card
  if (S.gameMode === 'speed') {
    setTimeout(() => { if (S.speedLeft > 0) nextCard(); }, 320);
    return;
  }

  $('#reveal').hidden = false;
  const v = $('#verdict');
  v.textContent = ok ? '✓ Correct!' : '✗ Not quite';
  v.className = 'verdict ' + (ok ? 'ok' : 'no');
  $('#rv-word').textContent = w.t;
  $('#rv-ipa').textContent = `${w.i || ''}${w.i && w.p ? ' · ' : ''}${w.p || ''}`;
  $('#rv-gloss').textContent = w.g || '';
  const more = (w.gs || []).filter((g) => g && g !== w.g);
  $('#rv-gloss-more').hidden = !more.length;
  $('#rv-gloss-more').textContent = more.length ? 'also: ' + more.slice(0, 3).join(' · ') : '';

  const ex = (w.ex || [])[0];
  const exBtn = $('#rv-ex');
  if (ex) {
    const hl = esc(ex).replace(new RegExp(`\\b(${reEsc(esc(w.t))})\\b`, 'i'), '<em>$1</em>');
    exBtn.hidden = false;
    $('#rv-ex-text').innerHTML = hl;
    exBtn.onclick = () => speak(ex);
  } else exBtn.hidden = true;

  const syn = w.syn || [];
  $('#rv-syn').hidden = !syn.length;
  $('#rv-syn').innerHTML = syn.length
    ? '🔀 close in meaning: ' + syn.map((s) => `<b>${esc(s.w)}</b>${s.n ? ` (${esc(s.n)})` : ''}`).join(' · ')
    : '';

  $('#btn-next').focus();
  if (game === 'listen') setTimeout(() => speak(w.t), 300);   // hear it again while reading
}

function nextCard() {
  S.i++;
  if (S.i >= S.queue.length) endSession();
  else loadCard();
}

/* ── results ───────────────────────────────────────────────── */

function endSession() {
  clearInterval(S.speedTimer);
  const answered = S.right + S.wrong;
  if (!answered && !S.replayOf) { show('home'); renderHome(); return; }

  show('results');
  const pct = answered ? Math.round(S.right / answered * 100) : 0;
  $('#res-ring').style.setProperty('--p', pct);
  $('#res-pct').textContent = pct + '%';

  const isSpeed = S.gameMode === 'speed';
  if (isSpeed) {
    $('#res-title').textContent = S.right >= 25 ? 'Lightning! ⚡' : S.right >= 15 ? 'Quick brain!' : 'Keep training!';
    $('#res-sub').textContent = `${S.right} correct of ${answered} answered in 60s`;
    const best = stats.best?.speed || 0;
    const newBest = S.right > best;
    if (newBest) { stats.best = { ...(stats.best || {}), speed: S.right }; persistStats(); }
    $('#res-best').hidden = !newBest;
    if (!newBest && best) $('#res-best').textContent = `🏆 Best: ${best} in 60s`;
    else $('#res-best').textContent = '🏆 New best score!';
  } else {
    $('#res-title').textContent = pct >= 90 ? 'Perfect-ish! 🏆' : pct >= 70 ? 'Nice work!' : pct >= 50 ? 'Getting there!' : 'Word by word 💪';
    $('#res-sub').textContent = `You got ${S.right} of ${answered}`;
    $('#res-best').hidden = true;
  }

  // missed list
  const m = S.missed;
  $('#res-missed').hidden = !m.length;
  if (m.length) {
    $('#missed-n').textContent = `(${m.length})`;
    $('#missed-list').innerHTML = m.slice(0, 40).map((w) =>
      `<div class="missed-item">
        <div><div class="mi-word">${esc(w.t)}</div><div class="mi-gloss">${esc(w.g || '')}</div></div>
        <button class="mi-speak" data-w="${esc(w.t)}" aria-label="Say ${esc(w.t)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a3.5 3.5 0 0 0-2-3.2v6.4a3.5 3.5 0 0 0 2-3.2zm-2-7v2.1a5 5 0 0 1 0 9.8V19a7 7 0 0 0 0-14z"/></svg>
        </button>
      </div>`).join('');
  }

  // replay buttons
  $('#btn-again-missed').hidden = !m.length;
}

function bindPractice() {
  $('#choices').addEventListener('click', (e) => {
    const b = e.target.closest('.choice');
    if (b) answerChoice(+b.dataset.idx);
  });
  $('#btn-true').addEventListener('click', () => answerTF(true));
  $('#btn-false').addEventListener('click', () => answerTF(false));
  $('#btn-scr-check').addEventListener('click', checkScramble);
  $('#scr-in').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); checkScramble(); }
  });
  $('#btn-scr-hint').addEventListener('click', () => {
    const w = S.q?.w;
    if (!w) return;
    $('#scr-in').value = $('#scr-in').value || w.t.charAt(0);
    $('#scr-in').focus();
    speak(w.t, 0.6);
  });
  $('#btn-next').addEventListener('click', nextCard);
  $('#btn-play').addEventListener('click', () => speak(S.queue[S.i].t));
  $('#btn-slow').addEventListener('click', () => speak(S.queue[S.i].t, Math.max(0.5, load(RATE_KEY, 0.9) - 0.3)));
  $('#btn-speak').addEventListener('click', () => speak(S.queue[S.i].t));
  $('#btn-back').addEventListener('click', () => {
    clearInterval(S.speedTimer);
    if (S.right + S.wrong > 0) endSession();
    else { show('home'); renderHome(); }
  });

  // keyboard: 1-4 answer · Enter next · Space replay · T/F
  document.addEventListener('keydown', (e) => {
    if ($('#screen-practice').hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Enter') {
      if (typing) return;
      if (S.answered && !$('#reveal').hidden) { e.preventDefault(); nextCard(); }
      return;
    }
    if (e.key === ' ') {
      if (!typing && S.q && S.q.game === 'listen') { e.preventDefault(); speak(S.queue[S.i].t); }
    }
    if (typing) return;
    if (!S.answered && /^[1-4]$/.test(e.key)) {
      const n = +e.key - 1;
      if (S.q?.options && n < S.q.options.length) answerChoice(n);
    }
    if (!S.answered && S.q?.game === 'tf') {
      if (e.key === 't' || e.key === 'T') answerTF(true);
      if (e.key === 'f' || e.key === 'F') answerTF(false);
    }
  });
}

function bindResults() {
  $('#missed-list').addEventListener('click', (e) => {
    const b = e.target.closest('.mi-speak');
    if (b) speak(b.dataset.w);
  });
  $('#btn-again-missed').addEventListener('click', () => {
    if (!S.missed.length) return;
    const pool = S.missed.slice();
    beginQueue(pool, S.gameMode === 'speed' ? 'wm' : S.gameMode, false, pool);
  });
  $('#btn-replay').addEventListener('click', () => {
    if (S.replayOf) { beginQueue([...S.replayOf], S.gameMode, false, S.replayOf); return; }
    if (S.fromTricky) { startTricky(); return; }
    startSession();
  });
}

/* ── voice modal ───────────────────────────────────────────── */

function bindVoice() {
  const open = () => {
    loadVoices();
    $('#rate').value = load(RATE_KEY, 0.9);
    $('#rate-val').textContent = (+$('#rate').value).toFixed(2) + '×';
    $('#voice-modal').hidden = false;
  };
  const close = () => { $('#voice-modal').hidden = true; };
  $('#btn-voice').addEventListener('click', open);
  $('#btn-voice-p').addEventListener('click', open);
  $('#voice-close').addEventListener('click', close);
  $('#voice-modal').addEventListener('click', (e) => { if (e.target === $('#voice-modal')) close(); });
  $('#voice-sel').addEventListener('change', (e) => {
    save(VOICE_KEY, e.target.value);
    loadVoices();
    speak('This is how I sound now. Can you hear me clearly?');
  });
  $('#rate').addEventListener('input', (e) => {
    save(RATE_KEY, +e.target.value);
    $('#rate-val').textContent = (+e.target.value).toFixed(2) + '×';
  });
  $('#rate').addEventListener('change', (e) => speak('Normal speed sounds like this.', +e.target.value));
  $('#voice-test').addEventListener('click', () => speak('The thought of a Thursday birthday really threw me.'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#voice-modal').hidden) close(); });
}

/* ── screens & boot ────────────────────────────────────────── */

function show(name) {
  ['home', 'practice', 'results'].forEach((s) => {
    $('#screen-' + s).hidden = s !== name;
  });
  window.scrollTo(0, 0);
}

$('#btn-theme').addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  save(THEME_KEY, dark ? 'dark' : 'light');
});

if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

bindHome();
bindPractice();
bindResults();
bindVoice();
renderHome();
show('home');
})();
