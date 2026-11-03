/* QA Flip ⇄ — question & answer pattern cards.
   Home → topic picker (checkboxes, all on by default, check/uncheck all)
   → flip session. Progress + streak in localStorage (qaflip-v1);
   theme shared with the Hub. Deep link: index.html#deck=A1 */
(function () {
  'use strict';

  const D = window.QA_DATA;

  /* friendly message if the data file didn't load (stale cache / offline first run) */
  if (!D || !D.cards || !D.cards.length) {
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = true; });
    const el = document.createElement('section');
    el.className = 'screen';
    el.innerHTML = '<div class="hero" style="text-align:center;padding-top:18vh">' +
      '<div style="font-size:44px">⇄</div>' +
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

  const LVL_LABEL = { A1: 'A1', A2: 'A2', B1: 'B1', B2: 'B2', C1: 'C1', C2: 'C2', IV: 'Interview', I1: 'IELTS 1', I2: 'Cue Card', I3: 'IELTS 3', TRICKY: '★' };
  const LVL_CLASS = { IV: 'iv', I1: 'ielts', I2: 'ielts', I3: 'ielts' };

  /* ── storage ─────────────────────────────── */
  const jparse = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
  const store = () => jparse(localStorage.getItem('qaflip-v1'), {});
  const save = (s) => { try { localStorage.setItem('qaflip-v1', JSON.stringify(s)); } catch {} };
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
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#12100D' : '#FCEAE3');
  }
  applyTheme(readTheme());
  $('#btn-theme').addEventListener('click', () => {
    const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem('writeRight.theme', JSON.stringify(t)); } catch {}
  });

  /* ── speech ──────────────────────────────── */
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\[|\]|\*|\+/g, ' '));
    u.lang = 'en-US'; u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  /* ── screens ─────────────────────────────── */
  const screens = { home: $('#screen-home'), picker: $('#screen-picker'), deck: $('#screen-deck'), done: $('#screen-done') };
  function show(name) {
    Object.values(screens).forEach((el) => { el.hidden = true; });
    screens[name].hidden = false;
    window.scrollTo(0, 0);
    if (name !== 'deck' && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  /* ── home / shelf ────────────────────────── */
  function renderHome() {
    const s = store();
    const done = s.done || {};
    const tricky = s.tricky || [];
    $('#streak-n').textContent = streakOf(s.days);

    const deckCards = D.decks.map((d) => {
      const n = D.cards.filter((c) => c.deck === d.id).length;
      const got = D.cards.filter((c) => c.deck === d.id && done[c.id]).length;
      const pct = n ? Math.round((got / n) * 100) : 0;
      const cls = LVL_CLASS[d.id] || '';
      return `<button class="deck ${pct === 100 ? 'done-all' : ''}" data-deck="${d.id}">
        <div class="dk-row"><span class="dk-id ${cls}">${LVL_LABEL[d.id] || d.id}</span><span class="dk-count">${n} cards</span></div>
        <div class="dk-name">${esc(d.name)}</div>
        <div class="dk-bar"><i style="width:${pct}%"></i></div>
        <div class="dk-progress"><b>${got}</b>/${n} flipped${pct === 100 ? ' · complete ✓' : ''}</div>
      </button>`;
    }).join('');

    $('#shelf').innerHTML = deckCards + (tricky.length
      ? `<button class="deck" data-deck="TRICKY">
          <div class="dk-row"><span class="dk-id">★</span><span class="dk-count">${tricky.length} cards</span></div>
          <div class="dk-name">Tricky — review again</div>
          <div class="dk-bar"><i style="width:100%"></i></div>
          <div class="dk-progress">the ones you starred</div>
        </button>`
      : '');

    const totalCards = D.cards.length;
    const totalFlipped = D.cards.filter((c) => done[c.id]).length;
    $('#foot-total').textContent = `${totalFlipped}/${totalCards} flipped`;

    $('#tricky-quick').hidden = !tricky.length;
    $('#tricky-n').textContent = tricky.length;

    $$('[data-deck]').forEach((b) =>
      b.addEventListener('click', () => openDeck(b.dataset.deck)));
  }

  /* ── topic picker ────────────────────────── */
  let pending = null;

  function openDeck(deckId) {
    let cards, title;
    if (deckId === 'TRICKY') {
      const tricky = store().tricky || [];
      cards = D.cards.filter((c) => tricky.includes(c.id));
      title = 'Tricky ★ review';
      if (!cards.length) return;
      launchSession(deckId, title, cards);      // tricky deck is already a selection
      return;
    }
    cards = D.cards.filter((c) => c.deck === deckId);
    if (!cards.length) return;
    const meta = D.decks.find((d) => d.id === deckId);
    title = meta ? meta.name : deckId;
    openPicker(deckId, title, cards);
  }

  function openPicker(deckId, title, cards) {
    const seen = {};
    const topics = [];
    cards.forEach((c) => {
      if (!(c.topic in seen)) { seen[c.topic] = { name: c.topic, count: 0 }; topics.push(seen[c.topic]); }
      seen[c.topic].count++;
    });
    pending = { deckId, title, cards, topics, selected: new Set(topics.map((t) => t.name)) };
    $('#picker-title').textContent = title;
    renderTopicList();
    show('picker');
  }

  function renderTopicList() {
    $('#topic-list').innerHTML = pending.topics.map((t) => {
      const on = pending.selected.has(t.name);
      return `<label class="topic-row ${on ? 'on' : ''}">
        <input type="checkbox" data-topic="${escAttr(t.name)}" ${on ? 'checked' : ''}>
        <span class="tr-check" aria-hidden="true"></span>
        <span class="tr-name">${esc(t.name)}</span>
        <span class="tr-count">${t.count} ${t.count === 1 ? 'card' : 'cards'}</span>
      </label>`;
    }).join('');
    $$('#topic-list input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        cb.closest('.topic-row').classList.toggle('on', cb.checked);
        if (cb.checked) pending.selected.add(cb.dataset.topic);
        else pending.selected.delete(cb.dataset.topic);
        updatePickerBar();
      });
    });
    updatePickerBar();
  }

  function updatePickerBar() {
    const n = pending.cards.filter((c) => pending.selected.has(c.topic)).length;
    $('#picker-count').textContent = n;
    $('#btn-start-session').disabled = n === 0;
    const allOn = pending.selected.size === pending.topics.length;
    $('#btn-check-all').textContent = allOn ? 'Uncheck all' : 'Check all';
    $('#picker-selected-info').textContent =
      `${pending.selected.size} of ${pending.topics.length} topics`;
  }

  $('#btn-check-all').addEventListener('click', () => {
    const allOn = pending && pending.selected.size === pending.topics.length;
    if (!pending) return;
    pending.selected = allOn ? new Set() : new Set(pending.topics.map((t) => t.name));
    renderTopicList();
  });

  $('#btn-start-session').addEventListener('click', () => {
    if (!pending) return;
    const cards = pending.cards.filter((c) => pending.selected.has(c.topic));
    if (!cards.length) return;
    launchSession(pending.deckId, pending.title, cards);
  });

  $('#btn-picker-back').addEventListener('click', goHome);

  /* ── deck session ────────────────────────── */
  let session = null;

  function launchSession(deckId, title, cards) {
    session = { deckId, title, cards: cards.slice(), i: 0, got: 0, tricky: 0, skipped: 0, flipped: false };
    $('#deck-top-title').textContent = title;
    show('deck');
    renderCard();
  }

  function shuffleQueue() {
    if (!session) return;
    for (let i = session.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [session.cards[i], session.cards[j]] = [session.cards[j], session.cards[i]];
    }
    session.i = 0;
    renderCard();
  }

  let exIdx = 0;
  function renderCard() {
    const c = session.cards[session.i];
    session.flipped = false;
    exIdx = 0;
    $('#flipcard').classList.remove('flipped');

    /* progress */
    $('#dp-done').textContent = session.i + 1;
    $('#dp-total').textContent = session.cards.length;
    $('#dp-fill').style.width = ((session.i) / session.cards.length * 100) + '%';

    /* front: the question */
    $('#fc-level').textContent = LVL_LABEL[c.deck] || c.deck;
    $('#fc-topic').textContent = c.topic;
    $('#fc-qname').textContent = (c.q.star ? '★ ' : '') + c.q.name;
    $('#fc-qframe').innerHTML = fmt(c.q.frame);
    const qex = (c.q.ex.length ? c.q.ex : [c.q.tip || '—']).slice(0, 4);
    $('#fc-qex').innerHTML = qex.map((t) =>
      `<div class="ex-item"><span class="tick">✓</span><span style="flex:1">${fmt(t)}</span>
       <button class="speak-btn" data-say="${escAttr(t)}" title="Listen" aria-label="Listen">🔊</button></div>`).join('');
    $('#fc-qtip').hidden = !(c.q.tip && c.q.ex.length);
    $('#fc-qtip').textContent = c.q.tip;

    /* back: the answer */
    $('#fc-topic2').textContent = c.topic;
    $('#btn-tricky').classList.toggle('starred', (store().tricky || []).includes(c.id));
    if (c.a) {
      $('#fc-aname').textContent = (c.a.star ? '★ ' : '') + c.a.name;
      $('#fc-aframe').innerHTML = fmt(c.a.frame);
      renderAEx(c.a);
      $('#fc-atip').hidden = !c.a.tip;
      $('#fc-atip').textContent = c.a.tip || '';
      $('#fc-adont').hidden = !c.a.dont;
      $('#fc-adont-txt').textContent = c.a.dont || '';
    }
    renderExch(c);

    $$('.speak-btn').forEach((b) =>
      b.addEventListener('click', (e) => { e.stopPropagation(); speak(b.dataset.say); }));
    const cyc = $('#btn-next-ex');
    if (cyc) cyc.onclick = (e) => { e.stopPropagation(); exIdx++; renderAEx(c.a); };
  }

  function renderAEx(a) {
    if (!a || !a.ex.length) {
      $('#fc-aex').innerHTML = '';
      $('#btn-next-ex').hidden = true;
      return;
    }
    const t = a.ex[exIdx % a.ex.length];
    $('#fc-aex').innerHTML = `<div class="ex-item"><span class="tick">✓</span><span style="flex:1">${fmt(t)}</span>
      <button class="speak-btn" data-say="${escAttr(t)}" title="Listen" aria-label="Listen">🔊</button></div>`;
    $('#btn-next-ex').hidden = a.ex.length < 2;
    $('#btn-next-ex').textContent = `example ${(exIdx % a.ex.length) + 1}/${a.ex.length} ▸`;
    const b = $('#fc-aex .speak-btn');
    if (b) b.addEventListener('click', (e) => { e.stopPropagation(); speak(b.dataset.say); });
  }

  function renderExch(c) {
    const box = $('#fc-exch');
    if (!c.pairs || !c.pairs.length) { box.hidden = true; box.removeAttribute('open'); return; }
    const isTalk = c.deck === 'I2';
    $('#fc-exch-lab').textContent = isTalk ? 'Model talk — read it aloud' : 'Hear it in conversation';
    const lines = c.pairs.slice(0, 12).map(([who, txt]) =>
      who === 'E'
        ? `<div class="exch-e"><b>E:</b> ${fmt(txt)}</div>`
        : `<div class="exch-m"><b>Me:</b> ${fmt(txt)}</div>`).join('');
    $('#fc-exch-body').innerHTML = lines;
    box.hidden = false;
  }

  /* light slot formatting: [word] → highlighted */
  function fmt(t) {
    return esc(t).replace(/\[([^\]]+)\]/g, '<b style="color:var(--coral)">[$1]</b>')
                 .replace(/\+/g, '<b style="color:var(--coral)"> + </b>');
  }

  /* ── actions ─────────────────────────────── */
  function next() {
    if (session.i + 1 >= session.cards.length) return finish();
    session.i++;
    renderCard();
  }
  function gotIt() {
    const c = session.cards[session.i];
    const s = store();
    s.done = s.done || {}; s.done[c.id] = 1;
    s.tricky = (s.tricky || []).filter((id) => id !== c.id);
    s.total = (s.total || 0) + 1;
    markDay(s); save(s);
    session.got++;
    next();
  }
  function markTricky() {
    const c = session.cards[session.i];
    const s = store();
    s.tricky = s.tricky || [];
    if (!s.tricky.includes(c.id)) s.tricky.push(c.id);
    s.done = s.done || {}; s.done[c.id] = 1;
    s.total = (s.total || 0) + 1;
    markDay(s); save(s);
    session.tricky++;
    next();
  }
  function skip() { session.skipped++; next(); }

  function finish() {
    $('#done-sub').textContent = session.deckId === 'TRICKY'
      ? 'Every tricky card reviewed.'
      : `“${session.title}” — every card flipped.`;
    $('#done-got').textContent = session.got;
    $('#done-tricky').textContent = session.tricky;
    $('#done-skipped').textContent = session.skipped;
    show('done');
    renderHome();
  }

  function resetDeck() {
    if (!session || !confirm('Reset progress for this deck?')) return;
    const s = store();
    const ids = session.cards.map((c) => c.id);
    s.done = s.done || {};
    ids.forEach((id) => delete s.done[id]);
    if (session.deckId !== 'TRICKY') s.tricky = (s.tricky || []).filter((id) => !ids.includes(id));
    save(s);
    session.i = 0; session.got = session.tricky = session.skipped = 0;
    renderCard();
    renderHome();
  }

  function goHome() { renderHome(); show('home'); }

  /* ── wiring ──────────────────────────────── */
  $('#flipcard').addEventListener('click', () => {
    session.flipped = !session.flipped;
    $('#flipcard').classList.toggle('flipped', session.flipped);
  });
  $('#btn-got').addEventListener('click', gotIt);
  $('#btn-tricky').addEventListener('click', markTricky);
  $('#btn-skip').addEventListener('click', skip);
  $('#btn-shuffle').addEventListener('click', shuffleQueue);
  $('#btn-reset').addEventListener('click', resetDeck);
  $('#btn-deck-back').addEventListener('click', () => { openDeck(session.deckId); });
  $('#btn-done-back').addEventListener('click', goHome);
  $('#btn-again').addEventListener('click', () => { openDeck(session.deckId); });
  $('#btn-tricky-deck').addEventListener('click', () => openDeck('TRICKY'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !screens.picker.hidden) { goHome(); return; }
    if (screens.deck.hidden || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); $('#flipcard').click(); }
    else if (e.code === 'ArrowRight') skip();
    else if (e.key.toLowerCase() === 'g') gotIt();
    else if (e.key.toLowerCase() === 't') markTricky();
    else if (e.key.toLowerCase() === 's') {
      const c = session.cards[session.i];
      speak((session.flipped ? (c.a && c.a.ex[0]) : c.q.ex[0]) || c.q.frame);
    } else if (e.code === 'Escape') { goHome(); }
  });

  /* deep link: index.html#deck=A1 */
  const m = location.hash.match(/^#deck=([A-Za-z0-9]+)/);
  renderHome();
  if (m && D.decks.some((d) => d.id === m[1].toUpperCase())) openDeck(m[1].toUpperCase());
})();
