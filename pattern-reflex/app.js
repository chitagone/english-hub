/* Pattern Reflex ⚡ — situation / question → answer-pattern reflex.
   Home (clean cards) → setup (topic categories · multi-select + round length) → play → done.
   Categories: click toggles one · right-click (double-click on touch) keeps only that one ·
   the Add button lists the categories that are off, to add them back · the All button re-selects everything.
   Options show FORMULA + THIS-situation example (no tense names) — names appear in feedback.
   4th mode “Active → Passive”: the scene is an ACTIVE sentence and every option is that same
   sentence in the passive of another pattern — “be” carries the tense, the main verb is V₃.
   Situation cards carry a "moment" (the context: who is speaking · when · what you want to say),
   the line to build ("gap") and a "clue" behind the 💡 button; the feedback explains the moment.
   Progress in localStorage (patternReflex-v1); theme shared with the Hub. */
(function () {
  'use strict';

  const BUILD = 'v34';   /* shown in the footer so you always know which version you're running */

  const D = window.REFLEX_DATA;
  if (!D || !D.cards || !D.cards.length) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Cards didn\'t load — refresh the page once.</p>';
    return;
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const KEY = 'patternReflex-v1';
  const ALL_IDS = Object.keys(D.tenses);
  const PASSIVE_IDS = ALL_IDS.filter((t) => D.tenses[t].pformula);   /* the patterns that have a passive form */
  const LENGTHS = [10, 20, 30, 50, 100, 150, 'All'];
  const MODE_CLASS = { situation: 'sit', question: 'que', makeq: 'mk', passive: 'pv' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── storage ── */
  const jparse = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
  const store = () => jparse(localStorage.getItem(KEY), { answered: 0, correct: 0, tricky: {}, days: [] });
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  function markDay(s) {
    s.days = Array.isArray(s.days) ? s.days : [];          /* progress saved before “days” existed */
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

  /* how to read a card — one line per mode, shown on the setup screen */
  const SETUP_TIP = {
    situation: '📖 Each card first explains the moment — who is speaking, when, and what you want to say. ' +
                'Then you pick the pattern for your line. Not sure? Tap 💡 Hint.',
    question: '💬 Someone asks you a question. Pick the pattern you need for your answer.',
    makeq: '❓ You see the answer. Pick the question pattern that produced it.',
    passive: '🔁 You see an ACTIVE sentence. Pick the PASSIVE pattern that says the same thing — same time, new subject.',
  };

  /* ── state ── */
  let mode = null, queue = [], current = null, locked = false, roundLen = 10, lastCats = null, lastLvl = null;
  let roundScore = 0, roundPos = 0, roundShown = 0, roundStreak = 0, bestStreak = 0, requeued = {};

  const cardsOf = (m) => D.cards.filter((c) => c.mode === m);

  /* 4 unique ids: the right one + 3 distractors — mostly its real confusions,
     but truly randomized every play (a confuse slot can swap for any pattern).
     The passive mode only offers patterns that have a passive for this sentence. */
  function choiceIds(card) {
    const passive = card.mode === 'passive';
    const conf = shuffle(((passive ? D.pconfuse : D.confuse)[card.tense] || []).slice());
    const others = shuffle((passive ? PASSIVE_IDS : ALL_IDS).filter((x) => x !== card.tense && conf.indexOf(x) < 0));
    return [card.tense].concat(conf.concat(others).slice(0, 3));
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
      el.className = 'mode-card ' + (MODE_CLASS[m.id] || 'que');
      el.innerHTML =
        '<div class="mode-ico">' + m.emoji + '</div>' +
        '<div class="mode-name">' + esc(m.name) + '</div>' +
        '<div class="mode-desc">' + esc(m.desc) + '</div>' +
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
    const catIds = Object.keys(counts);
    const state = { sel: new Set(catIds), len: 10, lvl: (D.levels || ['C1'])[((D.levels || ['C1']).length - 1)] };

    const scr = $('#scr-setup');
    scr.className = 'screen ' + (MODE_CLASS[modeId] || '');

    $('#su-emoji').textContent = m.emoji;
    $('#su-title').textContent = m.name;
    $('#su-sub').textContent = cards.length + ' cards · pick your categories and round length';
    $('#su-tip').textContent = SETUP_TIP[modeId] || '';

    /* the header buttons + the add panel are fixed elements, so assign (not addEventListener) — openSetup runs again per mode */
    const allBtn = $('#su-cat-all'), addBtn = $('#su-cat-add'), panel = $('#su-add-panel'), addRow = $('#su-add-row'), addEmpty = $('#su-add-empty');
    allBtn.onclick = () => { state.sel = new Set(catIds); refresh(); };
    let addOpen = false;
    const setAddOpen = (v) => {
      addOpen = !!v;
      panel.hidden = !addOpen;
      addBtn.classList.toggle('on', addOpen);
      addBtn.setAttribute('aria-expanded', String(addOpen));
    };
    addBtn.onclick = () => setAddOpen(!addOpen);
    $('#su-add-close').onclick = () => { setAddOpen(false); addBtn.focus(); };
    panel.onkeydown = (e) => { if (e.key === 'Escape') { setAddOpen(false); addBtn.focus(); } };
    setAddOpen(false);
    /* phones have no right-click — name the gesture that works there */
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const only = coarse ? 'Double-tap' : 'Right-click';
    $('#su-cat-hint').textContent = (coarse ? 'Tap' : 'Click') + ' = switch a category on / off · ' + only + ' = only that category';
    $('#su-add-empty').textContent = 'Every category is already selected. ' + only + ' a category to start with just that one, then add more here.';

    const catRow = $('#su-cat-row');
    catRow.innerHTML = '';
    addRow.innerHTML = '';
    const solo = (id) => { state.sel = new Set([id]); refresh(); };   /* right-click → only this category */
    (D.cats || []).forEach((cat) => {
      if (!counts[cat.id]) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cat-chip on';
      chip.innerHTML = cat.emoji + ' ' + esc(cat.name) + ' <small>· ' + counts[cat.id] + '</small>';
      chip.title = (coarse ? 'Tap' : 'Click') + ': switch on / off · ' + only + ': only this category';
      chip.dataset.cat = cat.id;
      /* a few touch browsers also fire a click right after a long-press "right-click" — that one is ignored */
      let soloAt = 0;
      chip.addEventListener('click', (e) => {
        if (Date.now() - soloAt < 350) return;
        if (e.detail >= 2) { solo(cat.id); return; }                /* double-click: the same gesture where there is no right-click */
        if (state.sel.has(cat.id)) state.sel.delete(cat.id); else state.sel.add(cat.id);
        if (!state.sel.size) catIds.forEach((k) => state.sel.add(k));  /* never empty */
        refresh();
      });
      chip.addEventListener('dblclick', (e) => { e.preventDefault(); solo(cat.id); });
      chip.addEventListener('contextmenu', (e) => { e.preventDefault(); soloAt = Date.now(); solo(cat.id); });   /* right-click / long-press — no browser menu */
      catRow.appendChild(chip);

      /* the same category in the Add list — shown only while it is switched off */
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'add-chip';
      add.dataset.cat = cat.id;
      add.innerHTML = '+ ' + cat.emoji + ' ' + esc(cat.name) + ' <small>· ' + counts[cat.id] + '</small>';
      add.addEventListener('click', () => {
        const rest = Array.prototype.slice.call(addRow.children);     /* where keyboard focus goes next */
        const next = rest.slice(rest.indexOf(add) + 1).filter((k) => !k.hidden)[0];
        state.sel.add(cat.id);
        refresh();
        (addOpen && next ? next : chip).focus();                      /* list closed → focus the chip that just lit up */
      });
      addRow.appendChild(add);
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
      /* the add list = exactly the categories that are off; with everything selected it explains instead */
      Array.prototype.forEach.call(addRow.children, (ch) => { ch.hidden = state.sel.has(ch.dataset.cat); });
      const allOn = state.sel.size === catIds.length;
      addEmpty.hidden = !allOn;
      /* the All button doubles as the status light: filled = every category is selected */
      allBtn.classList.toggle('on', allOn);
      allBtn.textContent = allOn ? '✓ All' : 'All';
      if (allOn && addOpen) setAddOpen(false);   /* the list ran out while it was open → fold it away */
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
    /* assign (not addEventListener): openSetup runs again on every visit, and stacked listeners
       made one Start click begin the round several times — throwing cards out of the round */
    go.onclick = () => {
      const p = pool();
      const n = state.len === 'All' ? p : Math.min(state.len, p);
      startRound(modeId, n, Array.from(state.sel), state.lvl);
    };
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
    s.recent = Array.isArray(s.recent) ? s.recent : [];
    const recentSet = new Set(s.recent);
    /* missed cards return — but at most HALF a round, so new cards always get in */
    const maxTricky = Math.max(1, Math.floor(roundLen / 2));
    const tricky = shuffle(cards.filter((c) => s.tricky[c.id])).slice(0, maxTricky);
    const fresh = shuffle(cards.filter((c) => !s.tricky[c.id] && !recentSet.has(c.id)));
    const seen = shuffle(cards.filter((c) => !s.tricky[c.id] && recentSet.has(c.id)));
    const rest = fresh.concat(seen);
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
    /* remember recently played — future rounds prefer unseen cards */
    try {
      const s = store();
      s.recent = Array.isArray(s.recent) ? s.recent : [];
      if (s.recent[s.recent.length - 1] !== current.id) s.recent.push(current.id);
      if (s.recent.length > 80) s.recent = s.recent.slice(-80);
      save(s);
    } catch (e) { /* storage unavailable */ }
    const m = MODE_META[current.mode];
    const isSituation = current.mode === 'situation';
    const isP = current.mode === 'passive';   /* Active → Passive: the scene is the ACTIVE sentence, shown in quotes */
    $('#scr-play').className = 'screen ' + (MODE_CLASS[current.mode] || '');
    $('#scene-tag').textContent = m.emoji + ' ' + m.name;
    $('#scene-tag').className = 'scene-tag ' + (MODE_CLASS[current.mode] || 'que');

    /* the situation: with context → the moment (a short story); without → the bare scene text */
    const hasMoment = isSituation && !!current.moment;
    $('#scene-txt').textContent = isP ? '“' + current.scene + '”' : current.scene;
    $('#scene-txt').hidden = hasMoment;
    $('#scene-moment').textContent = hasMoment ? current.moment : '';
    $('#scene-moment').hidden = !hasMoment;

    /* the line the learner builds: “The wind ______ when we heard a loud crash.” */
    const hasGap = !!current.gap;
    $('#task-lab').textContent = current.mode === 'question' ? 'Your answer' : (isP ? 'Say it in the passive' : 'Your line');
    $('#scene-gap').innerHTML = hasGap
      ? current.gap.split('_____').map(esc).join('<span class="blank" aria-label="gap"></span>')
      : '';
    $('#scene-task').hidden = !hasGap;

    $('#scene-hint').textContent = current.mode === 'question'
      ? 'How do you answer it — pick the pattern you need.'
      : (current.mode === 'makeq' ? 'Which question pattern fits this answer?'
         : (isP ? 'This is the ACTIVE sentence — which passive pattern says the same thing?'
         : (hasGap ? 'Which pattern completes your line?' : 'Which pattern fits this moment?')));

    /* the clue waits behind the hint button — context first, help only if wanted */
    $('#btn-hint').hidden = !(isSituation && current.clue);
    $('#hint-box').hidden = true;
    $('#hint-box').textContent = '';

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
    shuffle(choiceIds(current)).forEach((tid) => {
      const t = D.tenses[tid];
      const isQ = current.mode === 'makeq';
      const f = isQ ? (t.qformula || t.formula) : (isP ? (t.pformula || t.formula) : t.formula);
      const ex = (current.examples && current.examples[tid]) ||
                 (isQ ? (t.qexample || t.example) : (isP ? (t.pexample || t.example) : t.example));
      const b = document.createElement('button');
      b.className = 'choice';
      b.dataset.tid = tid;
      b.innerHTML =
        '<span class="cn">' + esc(f) + '</span>' +
        '<span class="cf">' + esc(ex) + '</span>';
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
      delete s.tricky[current.id];   /* answered right → instantly forgiven */
    } else {
      roundStreak = 0;
      s.tricky[current.id] = (s.tricky[current.id] || 0) + 1;
      if (!requeued[current.id]) { queue.push(current); requeued[current.id] = true; }
    }
    markDay(s);
    save(s);
    $('#btn-hint').hidden = true;          /* the clue now lives in the explanation */
    $('#hint-box').hidden = true;

    /* paint the options: correct = green, your wrong pick = red, rest dimmed — names revealed */
    $$('.choice').forEach((b) => {
      b.disabled = true;
      const tn = D.tenses[b.dataset.tid] ? D.tenses[b.dataset.tid].name : '';
      b.innerHTML = b.innerHTML + '<span class="ct">' + esc(tn) + '</span>';
      if (b.dataset.tid === current.tense) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
      else b.classList.add('dim');
    });

    const t = D.tenses[current.tense];
    const isP = current.mode === 'passive';
    const fHead = current.mode === 'makeq' ? (t.qformula || t.formula) : (isP ? (t.pformula || t.formula) : t.formula);
    $('#fb-head').textContent = (right ? '✓ Exactly — ' : '✗ The right pattern was ') + t.name + ' · ' + fHead;
    $('#fb-answer').textContent = '“' + current.answer + '”';

    /* teaching block — situation cards explain the moment (story + rule), then the clue,
       then why the pick doesn't fit; the other modes keep the rule + trick */
    const box = (cls, lab, body) =>
      '<div class="fb-box ' + cls + '"><span class="fb-lab">' + lab + '</span><div class="fb-lesson">' + body + '</div></div>';
    const type = (current.type && D.types && D.types[current.type]) || null;
    const story = (label) =>
      box(right ? 'good' : 'trick', label + esc(type.name),
          esc(type.story) + '<div class="fb-rule">Rule: ' + esc(current.why) + '</div>');
    let teach;
    if (!right) {
      const w = D.tenses[tid] || {};
      const wex = (current.examples && current.examples[tid]) || w.example || '';
      const wEg = (current.mode === 'makeq' ? (w.qexample || w.example) : isP ? (w.pexample || w.example) : w.example) || '';
      /* why the pick fails THIS moment: the type's own words, else the pattern's general rule */
      const whyNot = (type && type.why_not && type.why_not[tid]) || w.mistake || 'Check the time words and the situation again.';
      teach = (type ? story('🎬 The moment — ') : '') +
        (type ? box('clue', '🔑 The clue in this situation', esc(current.clue)) : '') +
        '<div class="fb-box bad">' +
          '<span class="fb-lab">❌ Why “' + esc(w.name || 'that') + '” is wrong here</span>' +
          '<div class="fb-picked">You said: <span class="fb-said">“' + esc(wex) + '”</span></div>' +
          '<div class="fb-lesson">' + esc(whyNot) + '</div>' +
          (w.idea || wEg
            ? '<div class="fb-when">' +
                '<span class="fb-when-lab">✅ “' + esc(w.name || 'it') + '” IS correct when:</span> ' + esc(w.idea) +
                (wEg ? '<br><span class="fb-eg">for example: “' + esc(wEg) + '”</span>' : '') +
              '</div>'
            : '') +
        '</div>' +
        (type ? '' :
          box('good', '✅ Why ' + esc(t.name) + ' is correct', esc(current.why)) +
          box('trick', '🎯 The trick to notice in this question', esc(current.trick || t.signals)) +
          (isP ? box('warn', '⚠ Watch the form', 'After “be”, the main verb is always V₃ — never V₁ (“was steal”) or V₂ (“was stole”).') : ''));
    } else {
      const trapId = (D.confuse[current.tense] || [])[0];
      const c = D.tenses[trapId] || {};
      teach = type
        ? story('✅ Correct — the moment · ') +
          box('clue', '🔑 The clue in this situation', esc(current.clue)) +
          (c.name
            ? box('warn', '⚠ Watch out for ' + esc(c.name),
                  esc((type.why_not && type.why_not[trapId]) || c.mistake || ''))
            : '')
        : box('good', '✅ Correct — why', esc(current.why)) +
          (c.name
            ? box('warn', '⚠ Watch out for ' + esc(c.name), esc(c.mistake || ''))
            : '');
    }
    $('#fb-why').innerHTML = teach;

    /* pattern notes live behind a disclosure, so the explanation stays scannable */
    const notes = (p) =>
      '<div class="fb-note"><span class="fb-name">' + esc(p.name) + '</span> <b>' + esc(p.idea) + '</b>' +
      '<br><span class="fb-sig">🔔 ' + esc(p.signals) + '</span></div>';
    const picked = D.tenses[tid];
    $('#fb-extra').innerHTML = notes(t) + (!right && picked && tid !== current.tense ? notes(picked) : '');
    $('#fb-more').open = false;

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

  $('#btn-hint').addEventListener('click', () => {
    if (!current || !current.clue) return;
    $('#hint-box').innerHTML = '<b>🔑 Clue</b> ' + esc(current.clue);
    $('#hint-box').hidden = false;
    $('#btn-hint').hidden = true;
  });
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
    const v = $('#app-version');
    if (v) v.textContent = 'Pattern Reflex ' + BUILD;
    window.scrollTo(0, 0);
  }

  renderHome();
})();
