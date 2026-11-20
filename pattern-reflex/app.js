/* Pattern Reflex ⚡ — situation / question → answer-pattern reflex.
   Home (clean cards) → setup (topic categories · multi-select + round length) → play → done.
   Options show FORMULA + THIS-situation example (no tense names) — names appear in feedback.
   Progress in localStorage (patternReflex-v1); theme shared with the Hub. */
(function () {
  'use strict';

  const D = window.REFLEX_DATA;
  if (!D || !D.cards || !D.cards.length) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Cards didn\'t load — refresh the page once.</p>';
    return;
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const KEY = 'patternReflex-v1';
  const ALL_IDS = Object.keys(D.tenses);
  const LENGTHS = [10, 20, 30, 50, 100, 150, 'All'];

  /* ── storage ── */
  const jparse = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
  const store = () => jparse(localStorage.getItem(KEY), { answered: 0, correct: 0, tricky: {}, days: [] });
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  function markDay(s) {
    const t = new Date().toISOString().slice(0, 10);
    if (!s.days.includes(t)) s.days.push(t);
  }

  /* ── theme (shared with hub) ── */
  function readTheme() {
    const t = jparse(localStorage.getItem('writeRight.theme'), null);
    if (t === 'dark' || t === 'light') return t;
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function applyTheme(t) { document.documentElement.classList.toggle('dark', t === 'dark'); }
  applyTheme(readTheme());
  const flip = () => {
    const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem('writeRight.theme', JSON.stringify(t)); } catch {}
  };
  $('#btn-theme').addEventListener('click', flip);
  $('#btn-theme2').addEventListener('click', flip);

  /* ── speech ── */
  const say = (txt) => {
    if (!('speechSynthesis' in window) || !txt) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(txt));
    u.lang = 'en-US'; u.rate = 0.95;
    speechSynthesis.speak(u);
  };

  /* ── helpers ── */
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (s) => s.answered ? Math.round(100 * s.correct / s.answered) + '%' : '—';

  const MODE_META = {};
  D.modes.forEach((m) => { MODE_META[m.id] = m; });
  const LVL_RANK = {};
  (D.levels || ['A1', 'A2', 'B1', 'B2', 'C1']).forEach((l, i) => { LVL_RANK[l] = i; });

  /* ── state ── */
  let mode = null, queue = [], current = null, locked = false, roundLen = 10, lastCats = null, lastLvl = null;
  let roundScore = 0, roundPos = 0, roundShown = 0, roundStreak = 0, bestStreak = 0, requeued = {};

  const cardsOf = (m) => D.cards.filter((c) => c.mode === m);

  /* exactly 4 unique pattern ids: the right one + 3 RANDOM distractors (fresh every play) */
  function choiceIds(tid) {
    const ids = [tid];
    shuffle(D.confuse[tid] || []).forEach((d) => { if (ids.length < 4 && d !== tid && !ids.includes(d)) ids.push(d); });
    shuffle(ALL_IDS.slice()).forEach((d) => { if (ids.length < 4 && !ids.includes(d)) ids.push(d); });
    return ids.slice(0, 4);
  }

  /* ── home: clean mode cards, one Continue button each ── */
  function renderHome() {
    const s = store();
    const grid = $('#mode-grid');
    grid.innerHTML = '';
    D.modes.forEach((m) => {
      const cards = cardsOf(m.id);
      const trickyN = cards.filter((c) => s.tricky[c.id]).length;
      const el = document.createElement('div');
      el.className = 'mode-card ' + ({situation: 'sit', question: 'que', makeq: 'mk'}[m.id] || 'que');
      el.innerHTML =
        '<div class="mode-ico">' + m.emoji + '</div>' +
        '<div class="mode-name">' + m.name + '</div>' +
        '<div class="mode-desc">' + m.desc + '</div>' +
        '<div class="mode-stats">' +
          '<span class="mst">' + cards.length + ' <small>cards</small></span>' +
          '<span class="mst">✓ ' + pct(s) + ' <small>accuracy</small></span>' +
          (trickyN ? '<span class="mst">⭐ ' + trickyN + ' <small>tricky</small></span>' : '') +
        '</div>';
      const go = document.createElement('button');
      go.className = 'go-btn';
      go.textContent = 'Continue →';
      go.addEventListener('click', () => openSetup(m.id));
      el.appendChild(go);
      grid.appendChild(el);
    });
  }

  /* ── setup: choose categories (multi-select) + round length ── */
  function openSetup(modeId) {
    mode = modeId;
    const m = MODE_META[modeId];
    const cards = cardsOf(modeId);
    const counts = {};
    cards.forEach((c) => { counts[c.cat] = (counts[c.cat] || 0) + 1; });
    const state = { sel: new Set(Object.keys(counts)), len: 10, lvl: (D.levels || ['C1'])[((D.levels || ['C1']).length - 1)] };

    const scr = $('#scr-setup');
    scr.className = 'screen ' + ({ situation: 'sit', question: 'que', makeq: 'mk' }[modeId] || '');

    $('#su-emoji').textContent = m.emoji;
    $('#su-title').textContent = m.name;
    $('#su-sub').textContent = cards.length + ' cards · pick your categories and round length';

    const catRow = $('#su-cat-row');
    catRow.innerHTML = '';
    (D.cats || []).forEach((cat) => {
      if (!counts[cat.id]) return;
      const chip = document.createElement('button');
      chip.className = 'cat-chip on';
      chip.innerHTML = cat.emoji + ' ' + cat.name + ' <small>· ' + counts[cat.id] + '</small>';
      chip.dataset.cat = cat.id;
      chip.addEventListener('click', () => {
        if (state.sel.has(cat.id)) state.sel.delete(cat.id); else state.sel.add(cat.id);
        if (!state.sel.size) Object.keys(counts).forEach((k) => state.sel.add(k));  /* never empty */
        refresh();
      });
      catRow.appendChild(chip);
    });

    const lenRow = $('#su-len-row');
    lenRow.innerHTML = '';
    LENGTHS.forEach((len) => {
      const chip = document.createElement('button');
      chip.className = 'len-chip' + (len === 10 ? ' on' : '');
      chip.textContent = String(len);
      chip.dataset.len = String(len);
      chip.addEventListener('click', () => { state.len = len; refresh(); });
      lenRow.appendChild(chip);
    });

    const lvlRow = $('#su-lvl-row');
    lvlRow.innerHTML = '';
    (D.levels || []).forEach((lvl) => {
      const chip = document.createElement('button');
      chip.className = 'cat-chip lvl-chip' + (lvl === state.lvl ? ' on' : '');
      chip.textContent = (lvl === 'C1' ? 'All levels' : 'Up to ' + lvl);
      chip.dataset.lvl = lvl;
      chip.addEventListener('click', () => { state.lvl = lvl; refresh(); });
      lvlRow.appendChild(chip);
    });

    const go = $('#su-start');
    const pool = () => cards.filter((c) => state.sel.has(c.cat) && LVL_RANK[c.level] <= LVL_RANK[state.lvl]).length;
    function refresh() {
      Array.prototype.forEach.call(catRow.children, (ch) => {
        ch.classList.toggle('on', state.sel.has(ch.dataset.cat));
      });
      Array.prototype.forEach.call(lvlRow.children, (ch) => {
        ch.classList.toggle('on', ch.dataset.lvl === state.lvl);
      });
      const p = pool();
      Array.prototype.forEach.call(lenRow.children, (ch) => {
        const v = ch.dataset.len === 'All' ? p : Number(ch.dataset.len);
        ch.classList.toggle('on', String(state.len) === ch.dataset.len);
        ch.classList.toggle('off', ch.dataset.len !== 'All' && v > p);
      });
      const n = state.len === 'All' ? p : Math.min(state.len, p);
      go.textContent = 'Start · ' + n + ' cards →';
    }
    go.addEventListener('click', () => {
      const p = pool();
      const n = state.len === 'All' ? p : Math.min(state.len, p);
      startRound(modeId, n, Array.from(state.sel), state.lvl);
    });
    refresh();
    show('setup');
  }

  /* ── round ── */
  function startRound(m, len, cats, lvl) {
    mode = m;
    lastCats = cats || lastCats;
    lastLvl = lvl || lastLvl;
    let cards = cardsOf(m);
    if (lastCats && lastCats.length) {
      const set = new Set(lastCats);
      cards = cards.filter((c) => set.has(c.cat));
    }
    if (lastLvl) cards = cards.filter((c) => LVL_RANK[c.level] <= LVL_RANK[lastLvl]);
    roundLen = Math.max(1, len || 10);
    const s = store();
    const tricky = cards.filter((c) => s.tricky[c.id]);
    const rest = shuffle(cards.filter((c) => !s.tricky[c.id]));
    /* every missed card returns, mixed randomly with fresh ones */
    const fill = rest.slice(0, Math.max(0, roundLen - tricky.length));
    queue = shuffle(tricky.concat(fill)).slice(0, roundLen);   /* wrong answers extend it again */
    roundScore = 0; roundPos = 0; roundShown = 0; roundStreak = 0; bestStreak = 0; requeued = {};
    show('play');
    nextCard();
  }

  function nextCard() {
    if (!queue.length) { finish(); return; }
    current = queue.shift();
    locked = false;
    roundShown += 1;
    const m = MODE_META[current.mode];
    $('#scene-tag').textContent = m.emoji + ' ' + m.name;
    $('#scene-tag').className = 'scene-tag ' + (current.mode === 'situation' ? 'sit' : current.mode === 'makeq' ? 'mk' : 'que');
    $('#scene-txt').textContent = current.scene;
    $('#scene-hint').textContent = current.mode === 'question'
      ? 'How do you answer it — pick the pattern you need.'
      : (current.mode === 'makeq' ? 'Which question pattern fits this answer?' : 'Which pattern fits this moment?');
    $('#feedback').hidden = true;
    $('#btn-next').hidden = true;
    $('#fb-head').textContent = '';
    $('#fb-answer').textContent = '';
    $('#fb-why').innerHTML = '';
    $('#fb-extra').innerHTML = '';
    const s = store();
    $('#m-count').textContent = Math.min(roundPos + 1, roundLen) + ' / ' + roundLen;
    $('#m-streak').textContent = roundStreak;
    $('#m-acc').textContent = pct(s);

    const box = $('#choices');
    box.innerHTML = '';
    shuffle(choiceIds(current.tense)).forEach((tid) => {
      const t = D.tenses[tid];
      const isQ = current.mode === 'makeq';
      const f = isQ ? (t.qformula || t.formula) : t.formula;
      const ex = (current.examples && current.examples[tid]) ||
                 (isQ ? (t.qexample || t.example) : t.example);
      const b = document.createElement('button');
      b.className = 'choice';
      b.dataset.tid = tid;
      b.innerHTML =
        '<span class="cn">' + f + '</span>' +
        '<span class="cf">' + ex + '</span>';
      b.addEventListener('click', () => pick(tid, b));
      box.appendChild(b);
    });
    $('#prog').style.width = Math.min(100, Math.round(100 * roundPos / roundLen)) + '%';
    window.scrollTo(0, 0);
  }

  function pick(tid, btn) {
    if (locked || !current) return;
    locked = true;
    const right = tid === current.tense;
    const s = store();
    s.answered += 1;
    if (right) {
      s.correct += 1;
      roundScore += 1;
      roundStreak += 1;
      bestStreak = Math.max(bestStreak, roundStreak);
      if (!requeued[current.id]) delete s.tricky[current.id];
    } else {
      roundStreak = 0;
      s.tricky[current.id] = (s.tricky[current.id] || 0) + 1;
      if (!requeued[current.id]) { queue.push(current); requeued[current.id] = true; }
    }
    markDay(s);
    save(s);

    /* paint the options: correct = green, your wrong pick = red, rest dimmed — names revealed */
    $$('.choice').forEach((b) => {
      b.disabled = true;
      const tn = D.tenses[b.dataset.tid] ? D.tenses[b.dataset.tid].name : '';
      b.innerHTML = b.innerHTML + '<span class="ct">' + tn + '</span>';
      if (b.dataset.tid === current.tense) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
      else b.classList.add('dim');
    });

    const t = D.tenses[current.tense];
    const fHead = current.mode === 'makeq' ? (t.qformula || t.formula) : t.formula;
    $('#fb-head').textContent = (right ? '✓ Exactly — ' : '✗ The right pattern was ') + t.name + ' · ' + fHead;
    $('#fb-answer').textContent = '“' + current.answer + '”';

    /* teaching block: wrong pick = full labeled lesson; right pick = why + nearest trap */
    let teach;
    if (!right) {
      const w = D.tenses[tid] || {};
      const wex = (current.examples && current.examples[tid]) || w.example || '';
      teach =
        '<div class="fb-box bad">' +
          '<span class="fb-lab">❌ Why “' + (w.name || 'that') + '” is wrong here</span>' +
          '<div class="fb-picked">You said: <span class="fb-said">“' + wex + '”</span></div>' +
          '<div class="fb-lesson">' + (w.mistake || 'Check the time words and the situation again.') + '</div>' +
        '</div>' +
        '<div class="fb-box good">' +
          '<span class="fb-lab">✅ Why ' + t.name + ' is correct</span>' +
          '<div class="fb-lesson">' + current.why + '</div>' +
        '</div>';
    } else {
      const c = D.tenses[(D.confuse[current.tense] || [])[0]] || {};
      teach =
        '<div class="fb-box good">' +
          '<span class="fb-lab">✅ Correct — why</span>' +
          '<div class="fb-lesson">' + current.why + '</div>' +
        '</div>' +
        (c.name
          ? '<div class="fb-box warn">' +
              '<span class="fb-lab">⚠ Watch out for ' + c.name + '</span>' +
              '<div class="fb-lesson">' + (c.mistake || '') + '</div>' +
            '</div>'
          : '');
    }
    $('#fb-why').innerHTML = teach;
    $('#fb-extra').innerHTML =
      '<span class="fb-name">' + t.name + '</span><br><b>' + t.idea + '</b><br><span class="fb-sig">🔔 ' + t.signals + '</span>';
    const fb = $('#feedback');
    fb.hidden = false;
    fb.className = 'feedback ' + (right ? 'good' : 'bad');
    $('#btn-next').hidden = false;
    $('#btn-next').textContent = queue.length ? 'Next →' : 'See results →';
    $('#m-streak').textContent = roundStreak;
    $('#m-acc').textContent = pct(s);
    $('#btn-speak').onclick = () => say(current.answer);
    if (fb.scrollIntoView) fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#btn-next').addEventListener('click', () => { roundPos += 1; nextCard(); });
  $('#btn-quit').addEventListener('click', () => { show('setup'); openSetup(mode); });
  $('#btn-back').addEventListener('click', () => { show('home'); renderHome(); });
  $('#btn-again').addEventListener('click', () => startRound(mode, roundLen, lastCats, lastLvl));
  $('#btn-home').addEventListener('click', () => { show('home'); renderHome(); });

  /* ── done ── */
  function finish() {
    const s = store();
    const trickyN = Object.keys(s.tricky).length;
    $('#d-score').textContent = roundScore + ' / ' + roundShown;
    $('#d-emoji').textContent = roundScore >= 9 ? '🏆' : roundScore >= 7 ? '🎉' : roundScore >= 5 ? '💪' : '🌱';
    $('#d-title').textContent = roundScore >= 9 ? 'Reflex level: lightning!' : roundScore >= 7 ? 'Strong reflexes!' : roundScore >= 5 ? 'Getting faster!' : 'Keep training — it sticks!';
    $('#d-stats').innerHTML =
      '<span class="mst">🔥 <b>' + bestStreak + '</b> <small>best streak</small></span>' +
      '<span class="mst">✓ <b>' + pct(s) + '</b> <small>all-time</small></span>' +
      '<span class="mst">⚡ <b>' + s.answered + '</b> <small>answered</small></span>' +
      (trickyN ? '<span class="mst">⭐ <b>' + trickyN + '</b> <small>tricky cards</small></span>' : '');
    show('done');
  }

  function show(name) {
    ['home', 'setup', 'play', 'done'].forEach((n) => { $('#scr-' + n).hidden = n !== name; });
    window.scrollTo(0, 0);
  }

  renderHome();
})();
