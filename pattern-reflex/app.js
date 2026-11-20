/* Pattern Reflex ⚡ — situation / question → answer-pattern reflex.
   Home → play (round of ~10, wrong cards return until answered right) → done.
   Options show FORMULA + EXAMPLE only (no tense names) — names appear in the feedback.
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

  /* ── state ── */
  let mode = null, queue = [], current = null, locked = false, roundLen = 10;
  let roundScore = 0, roundPos = 0, roundShown = 0, roundStreak = 0, bestStreak = 0, requeued = {};

  const cardsOf = (m) => D.cards.filter((c) => c.mode === m);

  /* exactly 4 unique pattern ids: the right one + 3 RANDOM distractors (fresh every play) */
  function choiceIds(tid) {
    const ids = [tid];
    shuffle(D.confuse[tid] || []).forEach((d) => { if (ids.length < 4 && d !== tid && !ids.includes(d)) ids.push(d); });
    shuffle(ALL_IDS.slice()).forEach((d) => { if (ids.length < 4 && !ids.includes(d)) ids.push(d); });
    return ids.slice(0, 4);
  }

  /* ── home ── */
  function renderHome() {
    const s = store();
    const grid = $('#mode-grid');
    grid.innerHTML = '';
    D.modes.forEach((m) => {
      const total = cardsOf(m.id).length;
      const trickyN = cardsOf(m.id).filter((c) => s.tricky[c.id]).length;
      const el = document.createElement('div');
      el.className = 'mode-card ' + (m.id === 'situation' ? 'sit' : 'que');
      el.innerHTML =
        '<div class="mode-ico">' + m.emoji + '</div>' +
        '<div class="mode-name">' + m.name + '</div>' +
        '<div class="mode-desc">' + m.desc + '</div>' +
        '<div class="mode-stats">' +
          '<span class="mst">' + total + ' <small>cards</small></span>' +
          '<span class="mst">✓ ' + pct(s) + ' <small>accuracy</small></span>' +
          (trickyN ? '<span class="mst">⭐ ' + trickyN + ' <small>tricky</small></span>' : '') +
        '</div>';
      const row = document.createElement('div');
      row.className = 'len-row';
      [5, 10, 20, 'All'].forEach((len) => {
        const n = len === 'All' ? total : len;
        const chip = document.createElement('button');
        chip.className = 'len-chip' + (len === 10 ? ' hot' : '');
        chip.textContent = String(len);
        chip.title = n + ' cards';
        chip.addEventListener('click', () => startRound(m.id, n));
        row.appendChild(chip);
      });
      el.appendChild(row);
      el.addEventListener('click', (ev) => { if (ev.target === el) startRound(m.id, 10); });
      grid.appendChild(el);
    });
  }

  /* ── round ── */
  function startRound(m, len) {
    mode = m;
    roundLen = Math.max(1, len || 10);
    const s = store();
    const cards = cardsOf(m);
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
    $('#scene-tag').className = 'scene-tag ' + (current.mode === 'situation' ? 'sit' : 'que');
    $('#scene-txt').textContent = current.scene;
    $('#scene-hint').textContent = current.mode === 'question'
      ? 'How do you answer it — pick the pattern you need.'
      : 'Which pattern fits this moment?';
    $('#feedback').hidden = true;
    $('#btn-next').hidden = true;
    const s = store();
    $('#m-count').textContent = Math.min(roundPos + 1, roundLen) + ' / ' + roundLen;
    $('#m-streak').textContent = roundStreak;
    $('#m-acc').textContent = pct(s);

    const box = $('#choices');
    box.innerHTML = '';
    shuffle(choiceIds(current.tense)).forEach((tid) => {
      const t = D.tenses[tid];
      const ex = (current.examples && current.examples[tid]) || t.example;
      const b = document.createElement('button');
      b.className = 'choice';
      b.dataset.tid = tid;
      b.innerHTML =
        '<span class="cn">' + t.formula + '</span>' +
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
    $('#fb-head').textContent = (right ? '✓ Exactly — ' : '✗ The right pattern was ') + t.name + ' · ' + t.formula;
    $('#fb-answer').textContent = '“' + current.answer + '”';
    $('#fb-why').textContent = current.why;
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
  $('#btn-quit').addEventListener('click', () => { show('home'); renderHome(); });
  $('#btn-again').addEventListener('click', () => startRound(mode, roundLen));
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
    ['home', 'play', 'done'].forEach((n) => { $('#scr-' + n).hidden = n !== name; });
    window.scrollTo(0, 0);
  }

  renderHome();
})();
