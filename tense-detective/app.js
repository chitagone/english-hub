/* Tense Detective 🔍 — read the situation, pick the tense pattern.
   Home → picker (levels + length) → play → done.
   Progress + streak in localStorage (tenseDet-v1); theme shared with the Hub.
   Modes: situation · versus · signals · formula. */
(function () {
  'use strict';

  const D = window.TENSE_DATA;

  /* friendly message if the data file didn't load (stale cache / offline first run) */
  if (!D || !D.cards || !D.cards.length) {
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = true; });
    const el = document.createElement('section');
    el.className = 'screen';
    el.innerHTML = '<div class="hero" style="text-align:center;padding-top:18vh">' +
      '<div style="font-size:44px">🔍</div>' +
      '<h1 style="font-family:var(--disp);font-weight:800;font-size:26px;margin:14px 0 8px">Cards didn\'t load</h1>' +
      '<p style="color:var(--mut);font-weight:600;max-width:38ch;margin:0 auto">Your browser is holding an old cached copy. ' +
      '<b>Refresh the page once or twice</b> — the new version will take over automatically.</p></div>';
    document.body.appendChild(el);
    return;
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const escAttr = (t) => esc(t).replace(/'/g, '&#39;');

  const MODE_BY_ID = {};
  D.modes.forEach((m) => { MODE_BY_ID[m.id] = m; });

  const BANDS = [
    { id: 'A', name: 'A1 – A2', sub: 'Beginner · Elementary' },
    { id: 'B', name: 'B1 – B2', sub: 'Intermediate · Upper' },
    { id: 'C', name: 'C1 – C2', sub: 'Advanced' },
  ];

  /* ── storage ─────────────────────────────── */
  const jparse = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
  const store = () => jparse(localStorage.getItem('tenseDet-v1'), {});
  const save = (s) => { try { localStorage.setItem('tenseDet-v1', JSON.stringify(s)); } catch {} };
  function markDay(s) {
    s.days = Array.isArray(s.days) ? s.days : [];
    const t = new Date().toISOString().slice(0, 10);
    if (!s.days.includes(t)) s.days.push(t);
    if (s.days.length > 400) s.days = s.days.slice(-400);
  }
  function streakOf(days) {
    const set = new Set(days || []);
    if (!set.size) return 0;
    const cur = new Date();
    if (!set.has(cur.toISOString().slice(0, 10))) cur.setDate(cur.getDate() - 1);
    let n = 0;
    while (set.has(cur.toISOString().slice(0, 10))) { n++; cur.setDate(cur.getDate() - 1); }
    return n;
  }

  /* ── theme (shared with the Hub) ─────────── */
  function readTheme() {
    const t = jparse(localStorage.getItem('writeRight.theme'), null);
    if (t === 'dark' || t === 'light') return t;
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function applyTheme(t) {
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#12100D' : '#E3EEF9');
  }
  applyTheme(readTheme());
  $('#btn-theme').addEventListener('click', () => {
    const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem('writeRight.theme', JSON.stringify(t)); } catch {}
  });

  /* ── speech ──────────────────────────────── */
  const say = (html) => {
    if (!('speechSynthesis' in window) || !html) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(html).replace(/<[^>]*>/g, ''));
    u.lang = 'en-US'; u.rate = 0.95;
    speechSynthesis.speak(u);
  };

  /* ── screens ─────────────────────────────── */
  const screens = { home: $('#screen-home'), picker: $('#screen-picker'), play: $('#screen-play'), done: $('#screen-done') };
  function show(name) {
    Object.values(screens).forEach((el) => { el.hidden = true; });
    screens[name].hidden = false;
    window.scrollTo(0, 0);
    if (name !== 'play' && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ── home ────────────────────────────────── */
  function renderHome() {
    const s = store();
    $('#streak-n').textContent = streakOf(s.days);

    const mastered = s.mastered || {};
    $('#modes').innerHTML = D.modes.map((m) => {
      const cards = D.cards.filter((c) => c.mode === m.id);
      const got = cards.filter((c) => mastered[c.id]).length;
      const pct = cards.length ? Math.round((got / cards.length) * 100) : 0;
      const st = (s.byMode || {})[m.id];
      const acc = st && st.t ? Math.round((st.r / st.t) * 100) + '%' : '—';
      return `<button class="mode-card" data-mode="${m.id}" title="${m.sub}">
        <div class="mc-emoji">${m.emoji}</div>
        <div class="mc-name">${m.name}</div>
        <div class="mc-desc">${m.desc}</div>
        <div class="mc-row"><span class="mc-count">${cards.length} cards</span><span class="mc-acc">${acc} accuracy</span></div>
        <div class="mc-bar"><i style="width:${pct}%"></i></div>
        <span class="mc-go">Investigate →</span>
      </button>`;
    }).join('');

    const totalCards = D.cards.length;
    const totalGot = D.cards.filter((c) => mastered[c.id]).length;
    $('#home-total').textContent = `${totalGot}/${totalCards} solved`;

    const tricky = s.tricky || [];
    $('#tricky-quick').hidden = !tricky.length;
    $('#tricky-n').textContent = tricky.length;

    $$('.mode-card').forEach((b) =>
      b.addEventListener('click', () => openPicker(b.dataset.mode)));
  }

  /* ── picker ──────────────────────────────── */
  let pending = null;

  function openPicker(modeId, poolOverride, fixedTitle) {
    const mode = MODE_BY_ID[modeId];
    const pool = poolOverride || D.cards.filter((c) => c.mode === modeId);
    pending = {
      modeId, pool,
      title: fixedTitle || (mode ? mode.name : 'Tricky ★'),
      bands: new Set(['A', 'B', 'C']),
      len: 10,
    };
    $('#picker-title').textContent = pending.title;
    renderBands();
    updatePickerBar();
    show('picker');
  }

  function renderBands() {
    $('#band-list').innerHTML = BANDS.map((b) => {
      const n = pending.pool.filter((c) => c.band === b.id).length;
      return `<label class="band-row ${pending.bands.has(b.id) ? 'on' : ''}" tabindex="0">
        <input type="checkbox" data-band="${b.id}" ${pending.bands.has(b.id) ? 'checked' : ''}>
        <span class="b-check" aria-hidden="true"></span>
        <span class="b-name">${b.name}<span class="b-sub"> · ${b.sub}</span></span>
        <span class="b-count">${n}</span>
      </label>`;
    }).join('');
    $$('#band-list input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        cb.closest('.band-row').classList.toggle('on', cb.checked);
        if (cb.checked) pending.bands.add(cb.dataset.band);
        else pending.bands.delete(cb.dataset.band);
        updatePickerBar();
      });
    });
    $$('.band-row').forEach((row) => row.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); row.click(); }
    }));
  }

  function selectedCards() {
    return pending.pool.filter((c) => pending.bands.has(c.band));
  }

  function updatePickerBar() {
    const n = selectedCards().length;
    const max = pending.len || n;
    $('#picker-count').textContent = Math.min(n, max);
    $('#btn-start-session').disabled = n === 0;
    $$('.len-pill').forEach((p) =>
      p.classList.toggle('on', Number(p.dataset.len) === pending.len));
  }

  $$('.len-pill').forEach((p) =>
    p.addEventListener('click', () => { pending.len = Number(p.dataset.len); updatePickerBar(); }));

  $('#btn-start-session').addEventListener('click', () => {
    const cards = shuffle(selectedCards().slice());
    const max = pending.len || cards.length;
    if (!cards.length) return;
    launch(pending.modeId, pending.title, cards.slice(0, max), pending.pool);
  });

  $('#btn-picker-back').addEventListener('click', goHome);

  /* ── play ────────────────────────────────── */
  let session = null;

  function launch(modeId, title, cards, srcPool) {
    session = { modeId, title, cards, srcPool, i: 0, right: 0, wrong: 0, tricky: 0, wrongIds: [] };
    $('#play-crumb').textContent = modeId === 'tricky' ? 'Tricky ★' : (MODE_BY_ID[modeId] ? MODE_BY_ID[modeId].name : 'Practice');
    $('#play-title').textContent = title;
    show('play');
    renderCard();
  }

  function renderCard() {
    const c = session.cards[session.i];
    const mode = MODE_BY_ID[c.mode];

    $('#dp-done').textContent = session.i + 1;
    $('#dp-total').textContent = session.cards.length;
    $('#dp-fill').style.width = (session.i / session.cards.length * 100) + '%';
    $('#dp-right').textContent = session.right;
    $('#dp-wrong').textContent = session.wrong;

    $('#q-mode').textContent = `${mode.emoji} ${mode.name}`;
    $('#q-level').textContent = c.level;

    /* scene */
    const sceneEl = $('#q-scene');
    if (c.mode === 'signals') {
      sceneEl.innerHTML = `<span class="scene-lab">signal word</span><span class="scene-word">“${c.scene}”</span>`;
    } else if (c.mode === 'formula') {
      sceneEl.innerHTML = `<span class="scene-lab">pattern frame</span><span class="scene-word">${c.scene}</span>`;
    } else {
      sceneEl.innerHTML = `<span class="scene-lab">🎭 the situation</span>${c.scene}`;
    }

    /* choices (shuffled, keyboard numbers shown) */
    const order = shuffle(c.choices.slice());
    session.answer = c.tense;
    session.locked = false;
    $('#q-choices').innerHTML = order.map((tid, i) => {
      const t = D.tenses[tid];
      return `<button class="choice" data-t="${tid}" data-k="${i + 1}">
        <span class="ch-name"><span class="ch-dot ${t.time}" aria-hidden="true"></span>${t.name}</span>
        <span class="ch-formula">${t.formula.pos}</span>
      </button>`;
    }).join('');
    $$('.choice').forEach((b) =>
      b.addEventListener('click', () => answer(b.dataset.t)));

    /* hide reveal until answered */
    const rv = $('#reveal');
    rv.hidden = true;
    rv.innerHTML = '';
    $('#btn-next').disabled = true;
    $('#btn-tricky').classList.toggle('starred', (store().tricky || []).includes(c.id));
    $('#qcard').style.animation = 'none';
    void $('#qcard').offsetWidth;              // restart the pop animation
    $('#qcard').style.animation = '';
  }

  function answer(picked) {
    if (session.locked) return;
    session.locked = true;
    const c = session.cards[session.i];
    const right = picked === session.answer;

    $$('.choice').forEach((b) => {
      b.disabled = true;
      if (b.dataset.t === session.answer) b.classList.add('correct');
      else if (b.dataset.t === picked) b.classList.add('wrong');
      else b.classList.add('dim');
    });

    /* stats */
    const s = store();
    s.total = (s.total || 0) + 1;
    if (right) s.right = (s.right || 0) + 1;
    s.byMode = s.byMode || {};
    const bm = s.byMode[session.modeId] = s.byMode[session.modeId] || { t: 0, r: 0 };
    bm.t++;
    if (right) {
      bm.r++;
      s.mastered = s.mastered || {};
      s.mastered[c.id] = 1;
    }
    markDay(s); save(s);
    if (right) session.right++; else { session.wrong++; session.wrongIds.push(c.id); }
    $('#dp-right').textContent = session.right;
    $('#dp-wrong').textContent = session.wrong;

    renderReveal(c, right);
    $('#btn-next').disabled = false;
    $('#btn-next').focus({ preventScroll: true });
  }

  function renderReveal(c, right) {
    const t = D.tenses[c.tense];
    const rv = $('#reveal');
    rv.classList.toggle('was-wrong', !right);
    let html = '';

    html += `<div class="rv-head">
      <span class="rv-badge">${right ? '✓ Correct' : '✗ Not this one'}</span>
      <span class="rv-title">${t.name}</span>
      <span class="rv-idea">${t.idea}</span>
    </div>`;

    if (c.why) html += `<div class="rv-why"><b>Why ·</b> ${c.why}</div>`;

    html += `<div class="rv-formulas">
      <div class="rv-f"><span>(+)</span> ${t.formula.pos}</div>
      <div class="rv-f"><span>(−)</span> ${t.formula.neg}</div>
      <div class="rv-f"><span>(?)</span> ${t.formula.que}</div>
    </div>`;

    if (c.example) {
      const ex = c.example.split(' / ').slice(0, 2);
      html += ex.map((e) =>
        `<div class="rv-ex"><span style="flex:1">${e}</span>
          <button class="speak-btn" data-say="${escAttr(e)}" title="Listen" aria-label="Listen">🔊</button></div>`).join('');
    }

    if (c.dialogue && c.dialogue.length) {
      const lines = c.dialogue.slice(0, 6).map(([who, txt]) =>
        `<div class="rv-line"><span class="rv-who">${esc(who)}</span><span style="flex:1">${txt}</span>
          <button class="speak-btn" data-say="${escAttr(txt)}" title="Listen" aria-label="Listen">🔊</button></div>`).join('');
      html += `<div class="rv-dlg"><span class="rv-dlg-lab">hear it in conversation</span>${lines}</div>`;
    }

    html += `<div class="rv-signals"><span class="rv-dlg-lab">signal words for ${t.name}</span>
      ${t.signals.map((x) => `<span class="sig-chip">${esc(x)}</span>`).join('')}</div>`;

    if (c.trap) {
      html += `<div class="rv-trap">
        <span class="rv-trap-lab">⚠ Trap from the book</span>
        <span class="rv-trap-x">✗ ${c.trap.wrong}</span>
        <span class="rv-trap-v">✓ ${c.trap.right}</span>
        <span class="rv-trap-note">${c.trap.note}</span>
      </div>`;
    }

    if (c.note) html += `<div class="rv-note">💡 ${c.note}</div>`;

    rv.innerHTML = html;
    rv.hidden = false;
    $$('.speak-btn').forEach((b) =>
      b.addEventListener('click', (e) => { e.stopPropagation(); say(b.dataset.say); }));
  }

  /* ── actions ─────────────────────────────── */
  function next() {
    if (session.i + 1 >= session.cards.length) return finish();
    session.i++;
    renderCard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleTricky() {
    const c = session.cards[session.i];
    const s = store();
    s.tricky = s.tricky || [];
    const at = s.tricky.indexOf(c.id);
    if (at >= 0) s.tricky.splice(at, 1);
    else s.tricky.push(c.id);
    save(s);
    $('#btn-tricky').classList.toggle('starred', at < 0);
    session.tricky += at < 0 ? 1 : -1;
  }

  function finish() {
    const total = session.right + session.wrong;
    $('#done-acc').textContent = total ? Math.round((session.right / total) * 100) + '%' : '—';
    $('#done-right').textContent = session.right;
    $('#done-wrong').textContent = session.wrong;
    $('#done-tricky').textContent = (store().tricky || []).filter((id) =>
      session.cards.some((c) => c.id === id)).length;
    $('#done-sub').textContent = `“${session.title}” — every card investigated.`;

    const mistakes = session.wrongIds.filter((id, i) => session.wrongIds.indexOf(id) === i);
    $('#btn-mistakes').hidden = !mistakes.length;
    $('#mistakes-n').textContent = mistakes.length;
    session.mistakes = mistakes;

    show('done');
    renderHome();
  }

  function shuffleRest() {
    if (!session) return;
    const rest = session.cards.slice(session.i);
    const done = session.cards.slice(0, session.i);
    shuffle(rest);
    session.cards = done.concat(rest);
    renderCard();
  }

  function goHome() { renderHome(); show('home'); }

  /* ── wiring ──────────────────────────────── */
  $('#btn-next').addEventListener('click', next);
  $('#btn-tricky').addEventListener('click', toggleTricky);
  $('#btn-shuffle').addEventListener('click', shuffleRest);
  $('#btn-play-back').addEventListener('click', () => openPicker(session.modeId, session.srcPool, session.title));
  $('#btn-done-back').addEventListener('click', goHome);
  $('#btn-again').addEventListener('click', () => openPicker(session.modeId, session.srcPool, session.title));
  $('#btn-mistakes').addEventListener('click', () => {
    const cards = D.cards.filter((c) => session.mistakes.includes(c.id));
    launch(session.modeId, session.title + ' · mistakes', cards, session.srcPool);
  });
  $('#btn-tricky-deck').addEventListener('click', () => {
    const ids = store().tricky || [];
    const cards = D.cards.filter((c) => ids.includes(c.id));
    if (!cards.length) return;
    openPicker('tricky', cards, 'Tricky ★ review');
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      if (!screens.picker.hidden) goHome();
      else if (!screens.play.hidden) openPicker(session.modeId, session.srcPool, session.title);
      return;
    }
    if (screens.play.hidden) return;
    if (!session.locked && /^[1-4]$/.test(e.key)) {
      const btn = document.querySelector(`.choice[data-k="${e.key}"]`);
      if (btn) btn.click();
    } else if (session.locked && (e.code === 'Enter' || e.code === 'ArrowRight' || e.code === 'Space')) {
      e.preventDefault();
      next();
    } else if (session.locked && e.key.toLowerCase() === 't') {
      toggleTricky();
    }
  });

  /* deep link: index.html#mode=signals */
  const m = location.hash.match(/^#mode=([a-z]+)/);
  renderHome();
  if (m && MODE_BY_ID[m[1]]) openPicker(m[1]);
})();
