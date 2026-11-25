/* Count & Measure 🧮 — countable & uncountable nouns.
   Home → picker (levels + length) → play → done, plus a 60-second speed round.
   One engine drives all ten games: every card carries its game, its choices, the why,
   examples to hear and the classic mistake. Three kinds of card:
     gap / measure   — a sentence or phrase with a gap, pick the word
     judge           — a whole sentence: right or wrong?
     spot            — tap the word that is wrong (or "No mistake"); the answer is a word position The answer's explanation shows the picture
   the game is about — things you count one by one, or an amount you can only measure.
   Progress + streak in localStorage (countMeasure-v1); theme shared with the Hub. */
(function () {
  'use strict';

  const D = window.COUNT_DATA;

  /* friendly message if the data file didn't load (stale cache / offline first run) */
  if (!D || !D.cards || !D.cards.length) {
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = true; });
    const el = document.createElement('section');
    el.className = 'screen';
    el.innerHTML = '<div class="hero" style="text-align:center;padding-top:18vh">' +
      '<div style="font-size:44px">🧮</div>' +
      '<h1 style="font-family:var(--disp);font-weight:800;font-size:26px;margin:14px 0 8px">Cards didn\'t load</h1>' +
      '<p style="color:var(--mut);font-weight:600;max-width:38ch;margin:0 auto">Your browser is holding an old cached copy. ' +
      '<b>Refresh the page once or twice</b> — the new version will take over automatically.</p></div>';
    document.body.appendChild(el);
    return;
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const escAttr = (t) => esc(t).replace(/'/g, '&#39;');

  const KEY = 'countMeasure-v1';
  const SPEED_SECONDS = 60;

  const GAME_BY_ID = {};
  D.games.forEach((g) => { GAME_BY_ID[g.id] = g; });
  const BAND_NAME = {};
  D.bands.forEach((b) => { BAND_NAME[b.id] = b.name; });

  /* measure words that start with a vowel sound — the only ones that take “an” */
  const AN_WORDS = ['item'];
  const art = (w) => (AN_WORDS.indexOf(w) >= 0 ? 'an' : 'a');
  const measurePhrase = (card, m) => art(m) + ' ' + m + ' of ' + card.noun;
  const answerTitle = (card) => {
    if (card.game === 'measure') return measurePhrase(card, card.answer);
    if (card.game === 'plural') return card.answer === 'no-plural' ? 'No plural — it is uncountable' : 'two ' + card.answer;
    if (card.game === 'spot') return card.answer === 'none' ? 'No mistake' : '“' + card.text.split(' ')[Number(card.answer)] + '” is the mistake';
    return D.labels[card.answer].text;
  };
  const labelSub = (id) => (D.labels[id] ? D.labels[id].sub : '');

  /* ── storage ─────────────────────────────── */
  const jparse = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
  const store = () => jparse(localStorage.getItem(KEY), {});
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  function markDay(s) {
    s.days = Array.isArray(s.days) ? s.days : [];
    const t = new Date().toISOString().slice(0, 10);
    if (!s.days.includes(t)) s.days.push(t);
    if (s.days.length > 400) s.days = s.days.slice(-400);
  }
  function streakOf(days) {
    const set = new Set(days || []);
    if (!set.size) return 0;
    const iso = (d) => d.toISOString().slice(0, 10);
    const cur = new Date();
    if (!set.has(iso(cur))) cur.setDate(cur.getDate() - 1);
    let n = 0;
    while (set.has(iso(cur))) { n++; cur.setDate(cur.getDate() - 1); }
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
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#12100D' : '#E3F3E4');
  }
  applyTheme(readTheme());
  $('#btn-theme').addEventListener('click', () => {
    const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem('writeRight.theme', JSON.stringify(t)); } catch {}
  });

  /* ── speech ──────────────────────────────── */
  const say = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'en-US'; u.rate = 0.92;
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
  const restartPop = (el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; };

  /* ── home ────────────────────────────────── */
  function renderHome() {
    const s = store();
    $('#streak-n').textContent = streakOf(s.days);

    const mastered = s.mastered || {};
    $('#modes').innerHTML = D.games.map((g) => {
      const cards = D.cards.filter((c) => c.game === g.id);
      const got = cards.filter((c) => mastered[c.id]).length;
      const pct = cards.length ? Math.round((got / cards.length) * 100) : 0;
      const st = (s.byGame || {})[g.id];
      const acc = st && st.t ? Math.round((st.r / st.t) * 100) + '%' : '—';
      return `<button class="mode-card" data-game="${g.id}" type="button" title="${escAttr(g.desc)}">
        <div class="mc-emoji" aria-hidden="true">${g.emoji}</div>
        <div class="mc-name">${esc(g.name)}</div>
        <div class="mc-desc">${esc(g.desc)}</div>
        <div class="mc-row"><span class="mc-count">${cards.length} cards</span><span class="mc-acc">${acc} accuracy</span></div>
        <div class="mc-bar"><i style="width:${pct}%"></i></div>
        <span class="mc-go">Play →</span>
      </button>`;
    }).join('');

    const got = D.cards.filter((c) => mastered[c.id]).length;
    $('#modes-sub').textContent = `${D.games.length} games · ${D.cards.length} cards`;
    $('#home-total').textContent = `${got}/${D.cards.length} sorted`;

    const best = (s.best || {}).speed || 0;
    $('#speed-best').textContent = best ? `best ${best}` : 'no score yet';

    const tricky = s.tricky || [];
    $('#tricky-quick').hidden = !tricky.length;
    $('#tricky-n').textContent = tricky.length;

    $$('.mode-card').forEach((b) => b.addEventListener('click', () => openPicker(b.dataset.game)));
  }

  /* the rules in six lines — one row per game */
  $('#rules-list').innerHTML = D.games.map((g) =>
    `<div class="rule-row"><span class="re" aria-hidden="true">${g.emoji}</span><div><b>${esc(g.name)}</b>` +
    `<span>${esc(D.rules[g.id].text)}</span><i>${esc(D.rules[g.id].ex)}</i></div></div>`).join('');

  /* ── picker ──────────────────────────────── */
  let pending = null;

  function openPicker(gameId, poolOverride, fixedTitle) {
    const game = GAME_BY_ID[gameId];
    pending = {
      gameId,
      pool: poolOverride || D.cards.filter((c) => c.game === gameId),
      title: fixedTitle || (game ? game.name : 'Tricky ★'),
      bands: new Set(['A', 'B', 'C']),
      len: 10,
    };
    $('#picker-title').textContent = pending.title;
    const r = game ? D.rules[game.id] : null;
    $('#picker-rule').hidden = !r;
    if (r) $('#picker-rule').innerHTML = `${esc(r.text)}<i>${esc(r.ex)}</i>`;
    renderBands();
    updatePickerBar();
    show('picker');
  }

  function renderBands() {
    $('#band-list').innerHTML = D.bands.filter((b) => pending.pool.some((c) => c.band === b.id)).map((b) => {
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

  const selectedCards = () => pending.pool.filter((c) => pending.bands.has(c.band));

  function updatePickerBar() {
    const n = selectedCards().length;
    const max = pending.len || n;
    $('#picker-count').textContent = Math.min(n, max);
    $('#btn-start-session').disabled = n === 0;
    $$('.len-pill').forEach((p) => p.classList.toggle('on', Number(p.dataset.len) === pending.len));
  }

  $$('.len-pill').forEach((p) =>
    p.addEventListener('click', () => { pending.len = Number(p.dataset.len); updatePickerBar(); }));

  $('#btn-start-session').addEventListener('click', () => {
    const cards = shuffle(selectedCards().slice());
    const max = pending.len || cards.length;
    if (!cards.length) return;
    launch(pending.gameId, pending.title, cards.slice(0, max));
  });

  $('#btn-picker-back').addEventListener('click', goHome);

  /* ── play ────────────────────────────────── */
  let session = null;

  function stopTimers() {
    if (!session) return;
    if (session.tick) { clearInterval(session.tick); session.tick = null; }
    if (session.delay) { clearTimeout(session.delay); session.delay = null; }
  }

  function launch(gameId, title, cards) {
    stopTimers();
    session = {
      gameId, title, cards,
      i: 0, right: 0, wrong: 0, wrongIds: [],
      speed: gameId === 'speed', left: SPEED_SECONDS,
      tick: null, delay: null, locked: true, answer: null,
    };
    const g = GAME_BY_ID[gameId];
    $('#play-crumb').textContent = g ? g.name : (session.speed ? '60 seconds' : 'Tricky ★');
    $('#play-title').textContent = title;
    $('#time-chip').hidden = !session.speed;
    $('#controls').hidden = session.speed;
    $('#kbd-hint').textContent = '1–3 = answer';                  // re-worded per card in renderCard
    show('play');
    renderCard();
    if (session.speed) {
      paintTime();
      session.tick = setInterval(() => {
        session.left -= 1;
        paintTime();
        if (session.left <= 0) finish();
      }, 1000);
    }
  }

  function startSpeed() {
    launch('speed', 'Speed round', shuffle(D.cards.slice()).slice(0, 80));
  }

  function paintTime() {
    $('#time-n').textContent = Math.max(0, session.left);
    const low = session.left <= 10;
    $('#time-chip').classList.toggle('low', low);
    $('#dp-fill').classList.toggle('low', low);
    $('#dp-fill').style.width = Math.max(0, (session.left / SPEED_SECONDS) * 100) + '%';
  }

  /* the sentence with the noun that decides, highlighted: “Would you like <mark>a coffee</mark>?” */
  function highlight(c) {
    const w = c.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b((?:an?|some|the|much|many|two|three|twelve|plenty of|a lot of|a few|a little) )?(' + w + 's?)(?![a-z])', 'i');
    let found = false;
    return esc(c.text).replace(re, (m, pre, noun) => {
      if (found) return m;
      found = true;
      return (pre || '') + '<mark>' + noun + '</mark>';
    });
  }

  const BLANK = '<span class="blank" aria-label="gap"></span>';

  function promptHtml(c) {
    if (c.kind === 'noun') {
      return `<div class="noun"><span class="noun-emoji" aria-hidden="true">${c.emoji}</span>` +
             `<span class="noun-word">${esc(c.word)}</span></div>`;
    }
    if (c.kind === 'ctx') {
      return `<span class="ctx-emoji" aria-hidden="true">${c.emoji}</span>` +
             `<div class="sentence">${highlight(c)}</div>`;
    }
    if (c.kind === 'measure') {
      const parts = c.text.split(' ___ ');
      return `<div class="sentence"><span class="phrase-lead">${esc(parts[0])}</span>${BLANK}<span>${esc(parts[1])}</span></div>`;
    }
    if (c.kind === 'judge') return `<div class="sentence">${esc(c.text)}</div>`;
    if (c.kind === 'spot') {                                   // every word is a button: tap the one that is wrong
      return `<div class="words">${c.text.split(' ').map((w, i) =>
        `<button class="word" data-i="${i}" type="button">` +
        (i < 9 ? `<i class="wk" aria-hidden="true">${i + 1}</i>` : '') + esc(w) + `</button>`).join('')}</div>`;
    }
    if (c.kind === 'plural') {
      const arrow = '<span class="arrow" aria-hidden="true">→</span>';
      const line = c.answer === 'no-plural'
        ? `<b>${esc(c.word)}</b>${arrow}the plural?`
        : `one <b>${esc(c.word)}</b>${arrow}two ${BLANK}`;
      return `<div class="noun"><span class="noun-emoji" aria-hidden="true">${c.emoji}</span><div class="plural-line">${line}</div></div>`;
    }
    return `<div class="sentence">${c.text.split('___').map(esc).join(BLANK)}</div>`;
  }

  const choiceHtml = (c, ch) => (c.game === 'measure'
    ? `${art(ch)} <b>${esc(ch)}</b> <small>of ${esc(c.noun)}</small>`
    : (c.game === 'plural' && ch !== 'no-plural') ? `<b>${esc(ch)}</b>`      // the plural forms themselves are the options
    : esc(D.labels[ch].text));

  function renderCard() {
    const c = session.cards[session.i];
    const g = GAME_BY_ID[c.game];
    $('#qcard').dataset.card = c.id;                      // which card is on screen (handy for debugging too)

    if (session.speed) {
      $('#dp-done').textContent = session.right + session.wrong + 1;
      $('#dp-total').textContent = '∞';
    } else {
      $('#dp-done').textContent = session.i + 1;
      $('#dp-total').textContent = session.cards.length;
      $('#dp-fill').style.width = (session.i / session.cards.length) * 100 + '%';
    }
    $('#dp-right').textContent = session.right;
    $('#dp-wrong').textContent = session.wrong;

    $('#q-mode').textContent = `${g.emoji} ${g.name}`;
    $('#q-level').textContent = BAND_NAME[c.band] || '';
    $('#q-prompt').innerHTML = promptHtml(c);
    $('#q-ask').textContent = c.kind === 'ctx' ? (g.ask_ctx || g.ask) : g.ask;

    /* choices: shuffled, keyboard numbers shown. Only the Sort game shows the sub-labels before
       answering — they describe the two ideas, not the answer. */
    const isSpot = c.kind === 'spot';
    const order = isSpot ? ['none'] : shuffle(c.choices.slice());     // "Find the mistake": the words are the options
    session.answer = c.answer;
    session.locked = false;
    const cols = isSpot || c.game === 'measure' ? 'cols-1' : c.game === 'aan' ? 'cols-3'
      : c.game === 'sort' ? 'cols-2' : 'cols-2 short';
    const box = $('#q-choices');
    box.className = 'choices ' + cols;
    box.innerHTML = order.map((ch, i) =>
      `<button class="choice" data-c="${escAttr(ch)}" data-k="${isSpot ? 0 : i + 1}" type="button">` +
        `<span class="ch-key" aria-hidden="true">${i + 1}</span>` +
        `<span class="ch-name">${choiceHtml(c, ch)}</span>` +
        (c.game === 'sort' ? `<span class="ch-sub">${esc(labelSub(ch))}</span>` : '') +
      `</button>`).join('');
    $$('.choice').forEach((b) => b.addEventListener('click', () => answer(b.dataset.c)));
    if (isSpot) $('#q-prompt').querySelectorAll('.word').forEach((w) => w.addEventListener('click', () => answer(w.dataset.i)));
    if (!session.speed) $('#kbd-hint').textContent = isSpot ? '1–9 = the word · 0 = no mistake · T = tricky' : '1–3 = answer · Enter = next · T = tricky';

    $('#reveal').hidden = true;
    $('#reveal').innerHTML = '';
    $('#speed-fb').hidden = true;
    $('#speed-fb').innerHTML = '';
    $('#btn-next').disabled = true;
    $('#btn-tricky').classList.toggle('starred', (store().tricky || []).includes(c.id));
    restartPop($('#qcard'));
  }

  function answer(picked) {
    if (!session || session.locked) return;
    session.locked = true;
    const c = session.cards[session.i];
    const right = picked === session.answer;

    $$('.choice').forEach((b) => {
      b.disabled = true;
      if (b.dataset.c === session.answer) b.classList.add('correct');
      else if (b.dataset.c === picked) b.classList.add('wrong');
      else b.classList.add('dim');
    });

    /* stats */
    const s = store();
    s.total = (s.total || 0) + 1;
    if (right) s.right = (s.right || 0) + 1;
    s.byGame = s.byGame || {};
    const key = session.speed ? 'speed' : c.game;
    const bg = s.byGame[key] = s.byGame[key] || { t: 0, r: 0 };
    bg.t++;
    if (right) {
      bg.r++;
      if (!session.speed) {                              /* speed is for reflexes — mastery is earned slowly */
        s.mastered = s.mastered || {};
        s.mastered[c.id] = 1;
      }
    }
    markDay(s); save(s);
    if (right) session.right++; else { session.wrong++; session.wrongIds.push(c.id); }
    $('#dp-right').textContent = session.right;
    $('#dp-wrong').textContent = session.wrong;

    if (c.kind === 'spot') {                                    // the word that is wrong is struck; a wrong tap is outlined
      const mine = (c.accept || []).map(Number);
      $('#q-prompt').querySelectorAll('.word').forEach((w) => {
        w.disabled = true;
        const i = Number(w.dataset.i);
        if (mine.indexOf(i) >= 0) w.classList.add('mistake');
        else if (String(i) === picked) w.classList.add('wrong');
        else w.classList.add(right ? 'ok' : 'dim');
      });
    }

    if (session.speed) { speedFeedback(c, right); return; }
    renderReveal(c, right);
    $('#btn-next').disabled = false;
    $('#btn-next').focus({ preventScroll: true });
  }

  function speedFeedback(c, right) {
    const fb = $('#speed-fb');
    fb.className = 'speed-fb' + (right ? '' : ' wrong');
    fb.innerHTML = (right ? '✓ ' : '✗ ') + esc(answerTitle(c)) +
      (right ? '' : `<small>${esc(c.why)}</small>`);
    fb.hidden = false;
    session.delay = setTimeout(next, right ? 520 : 1250);   /* a wrong answer stays longer, so the why can be read */
  }

  /* ── the explanation ─────────────────────── */
  const speakBtn = (text) =>
    `<button class="speak-btn" data-say="${escAttr(text)}" title="Listen" aria-label="Listen" type="button">🔊</button>`;

  /* the picture: things you count one by one · an amount you can only measure · the finished sentence */
  function proofHtml(c) {
    if (c.kind === 'noun') {
      if (c.answer === 'count') {
        const sg = c.say[0].replace(/^(a|an) /, '');
        const pl = (c.say[1].split(' ').pop() || sg + 's');
        const items = [0, 1, 2].map((i) => `<span class="pc-item" style="--i:${i}"><i>${i + 1}</i>${c.emoji}</span>`).join('');
        return `<div class="proof"><div class="proof-count" aria-hidden="true">${items}</div>` +
               `<div class="proof-txt">You count it, one by one.<small>one ${esc(sg)}, two ${esc(pl)}, three ${esc(pl)}</small></div></div>`;
      }
      const unit = c.why.indexOf(': ') >= 0 ? c.why.slice(c.why.indexOf(': ') + 2).replace(/\.$/, '') : '';
      return `<div class="proof"><span class="proof-mass" aria-hidden="true">${c.emoji}</span>` +
             `<div class="proof-txt">One amount — you can't count it.<small>${unit ? 'measure it: ' + esc(unit) : esc(c.say[0])}</small></div></div>`;
    }
    if (c.kind === 'ctx') {
      return `<div class="proof"><span class="pm-emoji" aria-hidden="true">${c.emoji}</span>` +
             `<div class="proof-sentence">${highlight(c)}</div>${speakBtn(c.text)}</div>`;
    }
    if (c.game === 'measure') {
      const phrase = measurePhrase(c, c.answer);
      return `<div class="proof"><div class="proof-sentence"><b>${esc(phrase)}</b></div>${speakBtn(phrase)}</div>`;
    }
    const fixProof = (shown) => `<div class="proof spot-proof"><div class="proof-sentence"><span class="lab">✗</span>${shown}</div>` +
      `<div class="proof-sentence"><span class="lab ok">✓</span>${esc(c.fix)}</div>${speakBtn(c.fix)}</div>`;
    if (c.kind === 'judge') {
      if (c.answer === 'right') return `<div class="proof"><div class="proof-sentence ok">${esc(c.text)}</div>${speakBtn(c.text)}</div>`;
      return fixProof(`<s>${esc(c.text)}</s>`);
    }
    if (c.kind === 'spot') {
      if (c.answer === 'none') return `<div class="proof"><div class="proof-sentence ok">${esc(c.text)}</div>${speakBtn(c.text)}</div>`;
      const mine = (c.accept || []).map(Number);
      return fixProof(c.text.split(' ').map((w, i) => (mine.indexOf(i) >= 0 ? `<s>${esc(w)}</s>` : esc(w))).join(' '));
    }
    if (c.kind === 'plural') {
      if (c.answer === 'no-plural') {
        return `<div class="proof"><div class="proof-txt">No plural — it is uncountable.<small>${esc(c.say.join(' · '))}</small></div>${speakBtn(c.say.join(', '))}</div>`;
      }
      return `<div class="proof"><span class="pm-emoji" aria-hidden="true">${c.emoji}</span>` +
        `<div class="proof-sentence">one ${esc(c.word)} <span class="arrow" aria-hidden="true">→</span> <b>two ${esc(c.answer)}</b></div>${speakBtn(c.say.join(', '))}</div>`;
    }
    const word = c.game === 'fewlittle' ? 'a ' + c.answer : c.answer;
    const plain = c.text.split('___').join(word);           // what is spoken
    const shown = c.text.split('___').map(esc).join(`<b>${esc(word)}</b>`);
    return `<div class="proof"><div class="proof-sentence">${shown}</div>${speakBtn(plain)}</div>`;
  }

  function renderReveal(c, right) {
    const rv = $('#reveal');
    rv.classList.toggle('was-wrong', !right);
    let html = `<div class="rv-head">
      <span class="rv-badge">${right ? '✓ Correct' : '✗ Not this one'}</span>
      <span class="rv-title">${esc(answerTitle(c))}</span>
    </div>`;
    html += proofHtml(c);
    html += `<div class="rv-why">${esc(c.why)}</div>`;
    if (c.game !== 'sort') html += `<div class="rv-rule"><b>Rule:</b> ${esc(D.rules[c.game].text)}</div>`;
    if (c.kind === 'noun' || c.kind === 'ctx') {
      html += `<div class="rv-say">${c.say.map((s) =>
        `<button class="say-chip" data-say="${escAttr(s)}" title="Listen" aria-label="Listen: ${escAttr(s)}" type="button">${esc(s)}<span class="sp" aria-hidden="true">🔊</span></button>`).join('')}</div>`;
    }
    if (c.more) html += `<div class="rv-more"><b>Also:</b> ${esc(c.more)}</div>`;
    if (c.trap) {
      const goodShown = c.say.indexOf(c.trap.good) >= 0 || c.trap.good === c.say[0];
      html += `<div class="rv-trap"><span class="rv-trap-lab">⚠ The classic mistake</span>
        <span class="rv-trap-x">✗ ${esc(c.trap.bad)}</span>` +
        (goodShown ? '' : `<span class="rv-trap-v">✓ ${esc(c.trap.good)}</span>`) + `</div>`;
    }
    if (c.tip) html += `<div class="rv-note">💡 ${esc(c.tip)}</div>`;
    rv.innerHTML = html;
    rv.hidden = false;
    $$('[data-say]').forEach((b) => b.addEventListener('click', () => say(b.dataset.say)));
    if (rv.scrollIntoView) rv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── actions ─────────────────────────────── */
  function next() {
    if (!session || !session.locked) return;
    if (session.delay) { clearTimeout(session.delay); session.delay = null; }
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
  }

  function tile(b, l) { return `<div class="done-tile"><b>${b}</b><span>${l}</span></div>`; }

  function finish() {
    stopTimers();
    const sp = session.speed;
    const total = session.right + session.wrong;
    const s = store();

    if (sp) {
      const prev = (s.best || {}).speed || 0;
      if (session.right > prev) { s.best = Object.assign({}, s.best, { speed: session.right }); save(s); }
      $('#done-emoji').textContent = '⚡';
      $('#done-title').textContent = session.right > prev && session.right > 0 ? 'New best!' : "Time's up!";
      $('#done-sub').textContent = session.right + ' right in 60 seconds';
      $('#done-tiles').innerHTML = tile(session.right, 'right ✓') + tile(Math.max(prev, session.right), 'your best') +
        tile(session.wrong, 'wrong ✗') + tile(total, 'answered');
    } else {
      const pct = total ? Math.round((session.right / total) * 100) : 0;
      const acc = total ? pct + '%' : '—';
      const trickyN = (s.tricky || []).filter((id) => session.cards.some((c) => c.id === id)).length;
      const perfect = total > 0 && session.right === total;
      $('#done-emoji').textContent = perfect ? '🏆' : '🧮';
      $('#done-title').textContent = perfect ? 'Perfect sort!' : pct >= 80 ? 'Sorted!' : pct >= 60 ? 'Well sorted!' : 'Keep sorting!';
      $('#done-sub').textContent = `“${session.title}” — every card done.`;
      $('#done-tiles').innerHTML = tile(acc, 'accuracy') + tile(session.right, 'right ✓') +
        tile(session.wrong, 'wrong ✗') + tile(trickyN, 'tricky ★');
    }
    $('#btn-again').textContent = sp ? 'Speed round again' : 'Play again';

    const mistakes = session.wrongIds.filter((id, i) => session.wrongIds.indexOf(id) === i);
    $('#btn-mistakes').hidden = sp || !mistakes.length;
    $('#mistakes-n').textContent = mistakes.length;
    session.mistakes = mistakes;

    show('done');
    renderHome();
  }

  function goHome() { renderHome(); show('home'); }

  /* back from a session → where it came from (a game's picker, the tricky picker, or home) */
  function backFromPlay() {
    const id = session.gameId;
    stopTimers();
    if (id === 'speed') return goHome();
    if (id === 'tricky') {
      const ids = store().tricky || [];
      return openPicker('tricky', D.cards.filter((c) => ids.includes(c.id)), 'Tricky ★ review');
    }
    openPicker(id);
  }

  /* ── wiring ──────────────────────────────── */
  $('#btn-next').addEventListener('click', next);
  $('#btn-tricky').addEventListener('click', toggleTricky);
  $('#btn-play-back').addEventListener('click', backFromPlay);
  $('#btn-done-back').addEventListener('click', goHome);
  $('#btn-speed').addEventListener('click', startSpeed);
  $('#btn-again').addEventListener('click', () => {
    if (session && session.speed) return startSpeed();
    backFromPlay();                                      /* the picker again — same game */
  });
  $('#btn-mistakes').addEventListener('click', () => {
    const cards = D.cards.filter((c) => session.mistakes.includes(c.id));
    launch(session.gameId, session.title + ' · mistakes', cards);
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
      else if (!screens.play.hidden) backFromPlay();
      return;
    }
    if (screens.play.hidden || !session) return;
    const cur = session.cards[session.i];
    if (!session.locked && cur.kind === 'spot') {
      if (/^[1-9]$/.test(e.key)) {
        const w = document.querySelector(`#q-prompt .word[data-i="${Number(e.key) - 1}"]`);
        if (w) w.click();
      } else if (e.key === '0') {
        const b = document.querySelector('.choice[data-c="none"]');
        if (b) b.click();
      } else if (!session.speed && e.key.toLowerCase() === 't') {
        toggleTricky();
      }
      return;
    }
    if (!session.locked && /^[1-9]$/.test(e.key)) {
      const btn = document.querySelector(`.choice[data-k="${e.key}"]`);
      if (btn) btn.click();
    } else if (!session.speed && e.key.toLowerCase() === 't') {     // the star works before and after answering
      toggleTricky();
    } else if (session.locked && !session.speed && (e.code === 'Enter' || e.code === 'ArrowRight' || e.code === 'Space')) {
      e.preventDefault();
      next();
    }
  });

  /* deep link: index.html#game=sort */
  const m = location.hash.match(/^#game=([a-z]+)/);
  renderHome();
  if (m && GAME_BY_ID[m[1]]) openPicker(m[1]);
})();
