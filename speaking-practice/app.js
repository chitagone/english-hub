/* ════════════════════════════════════════════════════════════════
   SpeakEasy ✿ — speaking practice card game
   Data in data.js (window.DB), generated from your pattern books.
   ════════════════════════════════════════════════════════════════ */
"use strict";

/* ── tiny helpers ─────────────────────────────────────────── */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayISO = () => new Date().toISOString().slice(0, 10);
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const DAY = 864e5;

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ── persistent state ─────────────────────────────────────── */
const LS = "speakeasy-v1";
const QUIZ_SCORE_VERSION = 2;
const DEFAULT_SET = {
  tts: false,
  ttsManual: false,
  cheat: false,
  rate: 0.9,
  voiceURI: "",
  theme: "auto",
  len: "20",
  shuffle: true,
  due: false,
  mode: "answer",
};
const store = {
  srs: {},        // id -> {b: box, d: due timestamp}
  star: [],       // starred (tricky) card ids
  days: [],       // ISO days practiced
  total: 0,       // lifetime cards rated
  quiz: {},       // grammar quiz best scores: topic -> {best, attempts}
  quizVersion: QUIZ_SCORE_VERSION,
  set: { ...DEFAULT_SET },
};

function save() {
  try { localStorage.setItem(LS, JSON.stringify(store)); } catch { /* storage full / blocked */ }
}
function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS)) || {}; } catch { /* first run */ }
  if (typeof saved !== "object" || saved === null) saved = {};
  store.srs = saved.srs && typeof saved.srs === "object" ? saved.srs : {};
  store.star = Array.isArray(saved.star) ? saved.star : [];
  store.days = Array.isArray(saved.days) ? saved.days : [];
  store.total = Number(saved.total) || 0;
  const savedQuizVersion = Number(saved.quizVersion) || 0;
  store.quiz = savedQuizVersion === QUIZ_SCORE_VERSION && saved.quiz && typeof saved.quiz === "object" ? saved.quiz : {};
  store.quizVersion = QUIZ_SCORE_VERSION;

  const ttsWasChosen = !!(saved.set && saved.set.ttsManual);
  store.set = Object.assign({}, DEFAULT_SET, saved.set || {});
  /* auto-read used to be on by default — turn it off once unless the user chose it */
  if (!ttsWasChosen) store.set.tts = false;
  if (!["ask", "role", "shadow"].includes(store.set.mode)) store.set.mode = "answer";
}
load();

/* ── derived indexes over the data ────────────────────────── */

/* The old grammar deck is intentionally left in data.js but hidden here. */
const BOOKS = DB.books.filter((b) => b.id !== "gram" && !/grammar/i.test(b.title || ""));

const DECK_META = {
  conv1: {
    accent: "var(--teal)",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5h10A2.5 2.5 0 0 1 17 7.5v4a2.5 2.5 0 0 1-2.5 2.5H9.3L5 17.5v-3.6A2.5 2.5 0 0 1 2.8 11.5v-4A2.5 2.5 0 0 1 5.3 5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.5 8.5h6.5M6.5 11.5h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  },
  conv2: {
    accent: "var(--coral)",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5h10.5v5a4.5 4.5 0 0 1-4.5 4.5h-1.5a4.5 4.5 0 0 1-4.5-4.5v-5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 10h1.4a2.4 2.4 0 0 1 0 4.8H15M7.5 3.5c-.6 1 .6 1.5 0 2.5M10.5 3.5c-.6 1 .6 1.5 0 2.5M13.5 3.5c-.6 1 .6 1.5 0 2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  },
  conv3: {
    accent: "var(--violet)",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.7c2.8-1 5.6-1 8.5.6 2.9-1.6 5.7-1.6 8.5-.6v12.4c-2.8-1-5.6-1-8.5.6-2.9-1.6-5.7-1.6-8.5-.6V5.7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 6.3v12.4" stroke="currentColor" stroke-width="1.7"/></svg>`,
  },
};
const deckMeta = (b) => DECK_META[b.id] || { accent: "var(--teal)", icon: "✿" };

const cardsOf = (book) => book.parts.flatMap((p) => p.cards);
const byId = new Map();
BOOKS.forEach((b) => cardsOf(b).forEach((c) => {
  c.id = c.id || `${b.id}:${byId.size}`;
  c.book = b.id;
  byId.set(c.id, c);
}));
const TOTAL = byId.size;
const starIds = () => store.star.filter((id) => byId.has(id));

/* ── grammar quiz data ────────────────────────────────────── */
const QUIZ = window.GRAMMAR_QUIZ || null;
const QUIZ_TOPICS = QUIZ && Array.isArray(QUIZ.topics)
  ? QUIZ.topics.slice().sort((a, b) => a.num - b.num)
  : [];
const QUIZ_BY_NUM = new Map(QUIZ_TOPICS.map((t) => [String(t.num), t]));
let quizState = null;
let quizSearch = "";
let quizNavFromTopics = false;

/* ── screens & routing ────────────────────────────────────── */

const SCREENS = ["home", "deck", "practice", "summary", "quiz-home", "quiz", "quiz-result", "role", "shadow", "talk"];

function show(screen) {
  SCREENS.forEach((s) => { $(`#screen-${s}`).hidden = s !== screen; });
  window.scrollTo(0, 0);
}

let curBook = null;              // book object or null
let selParts = new Set();        // indexes into curBook.parts
let partQuery = "";
const deckSel = new Map();       // book id -> array of selected part indexes

function openDeckAt(i) {
  const b = BOOKS[i];
  if (!b) return;
  const hash = `#/deck/${b.id}`;
  if (location.hash === hash) openDeck(b);
  else location.hash = hash;
}

function openDeck(b) {
  const changed = curBook !== b;
  curBook = b;
  if (changed) {
    const saved = deckSel.get(b.id);
    const valid = saved ? saved.filter((i) => Number.isInteger(i) && i >= 0 && i < b.parts.length) : null;
    selParts = new Set(valid || b.parts.map((_, i) => i));
    partQuery = "";
    const input = $("#parts-search");
    if (input) input.value = "";
    $("#btn-clear-search").hidden = true;
    $("#parts-list").scrollTop = 0;
  }
  renderDeck();
  show("deck");
}

function backToHome() {
  goHome();
}

function goHome() {
  stopAllAudio();          // never carry speech or a recording out of a screen
  if (location.hash) {
    try { history.replaceState(null, "", location.href.replace(/#.*$/, "")); } catch { /* ignore */ }
  }
  curBook = null;
  quizState = null;
  renderHome();
  show("home");
}

function route() {
  /* leaving any active practice screen must kill speech, timers & recording */
  if (["practice", "summary", "role", "shadow", "talk"].some((s) => !$("#screen-" + s).hidden)) {
    stopSession();
  }

  const quizMatch = /^#\/quiz(?:\/([\w-]+))?$/.exec(location.hash);
  if (quizMatch) {
    const id = quizMatch[1] || "";
    if (!id) {
      quizState = null;
      renderQuizTopics();
      show("quiz-home");
      return;
    }
    if (quizState && quizState.routeId === id) {
      quizNavFromTopics = false;
      show(quizState.screen || "quiz");
      return;
    }
    const fromTopics = quizNavFromTopics;
    quizNavFromTopics = false;
    if (id === "random") {
      startRandomQuiz(fromTopics);
    } else {
      const topic = QUIZ_BY_NUM.get(id);
      if (topic) startTopicQuiz(topic, fromTopics);
      else {
        quizState = null;
        renderQuizTopics();
        show("quiz-home");
      }
    }
    return;
  }

  if (quizState) quizState = null;

  const m = /^#\/deck\/([\w-]+)$/.exec(location.hash);
  const b = m ? BOOKS.find((x) => x.id === m[1]) : null;

  if (b) {
    if (curBook !== b) openDeck(b);
    else { renderDeck(); show("deck"); }
  } else {
    curBook = null;
    renderHome();
    show("home");
  }
}

/* ══════════════════ HOME ══════════════════════════════════ */

function streak() {
  const days = new Set(store.days);
  let s = 0;
  const d = new Date();
  if (!days.has(todayISO())) d.setDate(d.getDate() - 1);   // today not done yet? start from yesterday
  while (days.has(d.toISOString().slice(0, 10))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

function deckStats(b) {
  const cards = cardsOf(b);
  const now = Date.now();
  let seen = 0, due = 0;
  cards.forEach((c) => {
    const s = store.srs[c.id];
    if (s) {
      seen++;
      if ((s.d || 0) <= now) due++;
    } else {
      due++;
    }
  });
  return { total: cards.length, seen, due, pct: cards.length ? Math.round((seen / cards.length) * 100) : 0 };
}

function pctLabel(s) {
  return s.seen && s.pct === 0 ? "<1%" : `${s.pct}%`;
}

function renderHome() {
  $("#foot-total").textContent = `${TOTAL.toLocaleString()} cards`;
  $("#streak-n").textContent = streak();

  const quizWrap = $("#quiz-entry-wrap");
  if (quizWrap) {
    quizWrap.hidden = QUIZ_TOPICS.length === 0;
    if (QUIZ_TOPICS.length) {
      const quizTotal = QUIZ_TOPICS.reduce((sum, topic) => sum + topic.questions.length, 0);
      $("#quiz-entry-sub").textContent = `${QUIZ_TOPICS.length} lessons · ${quizTotal.toLocaleString()} questions`;
    }
  }

  const tricky = starIds();
  $("#tricky-quick").hidden = tricky.length === 0;
  $("#tricky-text").innerHTML = `<b id="tricky-n">${tricky.length}</b> tricky card${tricky.length === 1 ? "" : "s"} waiting`;

  $("#shelf").innerHTML = BOOKS.map((b, i) => {
    const s = deckStats(b);
    const m = deckMeta(b);
    const pct = pctLabel(s);
    const progress = s.seen
      ? `${s.seen.toLocaleString()} practised · ${pct}`
      : "Not started yet";
    return `
      <button class="book" data-i="${i}" style="--bk:${m.accent}"
        aria-label="Open ${esc(b.title)} — ${s.total.toLocaleString()} cards, ${b.parts.length} parts">
        <span class="book-top">
          <span class="book-icon" aria-hidden="true">${m.icon}</span>
          <span class="book-go" aria-hidden="true">→</span>
        </span>
        <span class="book-name">${esc(b.title)}</span>
        <span class="book-tag">${esc(b.tag || "")}</span>
        <span class="book-meta"><b>${s.total.toLocaleString()}</b> cards <span aria-hidden="true">·</span> ${b.parts.length} parts</span>
        <span class="book-prog" aria-hidden="true"><i style="width:${s.seen ? Math.max(2, s.pct) : 0}%"></i></span>
        <span class="book-prog-txt${s.pct === 100 ? " done" : ""}">${progress}</span>
      </button>`;
  }).join("");

  $$("#shelf .book").forEach((el) =>
    el.addEventListener("click", () => openDeckAt(+el.dataset.i)));
}

/* ══════════════════ DECK PAGE ═════════════════════════════ */

function renderDeck() {
  if (!curBook) return;
  const b = curBook;
  const m = deckMeta(b);
  const s = deckStats(b);

  $("#deck-hero").style.setProperty("--bk", m.accent);
  $("#deck-emblem").innerHTML = m.icon;
  $("#deck-title").textContent = b.title;
  $("#deck-tag").textContent = b.tag || "";
  $("#deck-top-title").textContent = b.title;

  $("#dh-cards").textContent = s.total.toLocaleString();
  $("#dh-parts").textContent = b.parts.length;
  $("#dh-due").textContent = s.due.toLocaleString();
  $("#deck-bar").style.width = `${s.seen ? Math.max(1, s.pct) : 0}%`;
  $("#deck-pct").textContent = `${pctLabel(s)} practised`;

  $("#parts-search-wrap").hidden = b.parts.length <= 8;
  syncOptions();
  renderParts();
}

function renderParts() {
  if (!curBook) return;
  const q = partQuery.trim().toLowerCase();
  const items = curBook.parts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !q || p.name.toLowerCase().includes(q));

  const list = $("#parts-list");
  list.innerHTML = items.length
    ? items.map(({ p, i }) => `
      <button type="button" class="prow${selParts.has(i) ? " on" : ""}" data-i="${i}"
        aria-pressed="${selParts.has(i)}">
        <span class="pcheck" aria-hidden="true">✓</span>
        <span class="pname">${esc(p.name)}</span>
        <span class="pn">${p.cards.length}</span>
      </button>`).join("")
    : `<p class="parts-empty">No parts match “${esc(partQuery.trim())}”.</p>`;

  $$("#parts-list .prow").forEach((el) =>
    el.addEventListener("click", () => togglePart(+el.dataset.i, el)));

  updatePartsMeta();
}

function rememberSel() {
  if (curBook) deckSel.set(curBook.id, [...selParts]);
}

function togglePart(i, btn) {
  if (!curBook) return;
  if (selParts.has(i)) selParts.delete(i);
  else selParts.add(i);
  btn.classList.toggle("on", selParts.has(i));
  btn.setAttribute("aria-pressed", String(selParts.has(i)));
  rememberSel();
  updatePartsMeta();
}

function setAllParts(on) {
  if (!curBook) return;
  selParts = new Set(on ? curBook.parts.map((_, i) => i) : []);
  rememberSel();
  renderParts();
}

function sessionPool() {
  if (!curBook) return [];
  return [...selParts]
    .sort((a, b) => a - b)
    .flatMap((i) => curBook.parts[i]?.cards || []);
}

/* ── practice modes ───────────────────────────────────────── */

const modeOf = () => (["ask", "role", "shadow"].includes(store.set.mode) ? store.set.mode : "answer");
const MODE_LABEL = { answer: "Answer", ask: "Ask", role: "Roleplay", shadow: "Shadow" };

function modeCounts(cards) {
  const out = { answer: 0, ask: 0, role: 0, shadow: 0 };
  (cards || []).forEach((c) => {
    if (c.kind === "ask") out.ask++;
    else if (c.kind === "say" || c.kind === "role") out.answer++;
    if (c.dlg?.length > 1) out.role++;
    out.shadow++;       /* every card can be shadowed */
  });
  return out;
}

function modeCards(cards, mode) {
  if (mode === "ask") return cards.filter((c) => c.kind === "ask");
  if (mode === "role") return cards.filter((c) => c.dlg?.length > 1);
  if (mode === "shadow") return [...cards];
  return cards.filter((c) => c.kind === "say" || c.kind === "role");
}

function modePool() {
  return modeCards(sessionPool(), modeOf());
}

function promptLine(c) {
  if (!c) return "";
  if (c.kind === "role") return c.dlg?.[0]?.[1] || c.q || "";
  const m = String(c.q || "").match(/"([^"]+)"/);
  return (m ? m[1] : c.q || "").replace(/^Reply out loud:\s*/i, "").trim();
}

function modelLine(c) {
  if (!c) return "";
  if (c.model) return c.model;
  if (c.kind === "role" && c.dlg?.length) {
    const b = c.dlg.find(([sp]) => sp === "B");
    if (b) return b[1];
  }
  return "";
}

function updatePartsMeta() {
  if (!curBook) return;
  const totalParts = curBook.parts.length;
  const n = selParts.size;
  $("#parts-note").textContent = n === 0
    ? "No parts selected"
    : `${n} of ${totalParts} part${totalParts === 1 ? "" : "s"} selected`;

  const cards = sessionPool();
  const counts = modeCounts(cards);

  /* if the selected parts have no cards for this mode, fall back to one that has */
  if (!counts[modeOf()]) {
    const fallback = ["answer", "ask", "role", "shadow"].find((m) => counts[m] > 0);
    if (fallback && fallback !== modeOf()) {
      store.set.mode = fallback;
      save();
    }
  }

  renderModePicker(counts);

  const pool = modePool();
  const len = +store.set.len;
  const count = len === 0 ? pool.length : Math.min(len, pool.length);
  const note = $("#start-note");
  const start = $("#btn-start");

  if (!n) {
    note.textContent = "Choose at least one part to begin.";
    note.classList.add("warn");
    start.disabled = true;
  } else if (!pool.length) {
    note.textContent = `No ${MODE_LABEL[modeOf()]} cards here — switch mode or pick more parts.`;
    note.classList.add("warn");
    start.disabled = true;
  } else {
    note.classList.remove("warn");
    start.disabled = false;
    note.innerHTML = `<b>${count}</b> card${count === 1 ? "" : "s"} ready · ${n} part${n === 1 ? "" : "s"} · ${MODE_LABEL[modeOf()]} mode`;
  }
}

function renderModePicker(counts) {
  const mode = modeOf();
  const total = (counts.answer || 0) + (counts.ask || 0);
  $$("#mode-picker .mode-card").forEach((btn) => {
    const m = btn.dataset.mode;
    const n = counts[m] || 0;
    btn.classList.toggle("on", m === mode);
    btn.setAttribute("aria-pressed", String(m === mode));
    btn.disabled = n === 0 && total > 0;
    btn.title = n
      ? `${MODE_LABEL[m]} mode · ${n.toLocaleString()} cards`
      : `No ${MODE_LABEL[m]} cards in the selected parts`;
    const num = btn.querySelector(".mode-n b");
    if (num) num.textContent = n.toLocaleString();
  });
  const note = $("#mode-note");
  if (note) {
    note.textContent = total
      ? `${MODE_LABEL[mode]} mode · ${(counts[mode] || 0).toLocaleString()} cards selected`
      : "Choose at least one part";
  }
}

function syncOptions() {
  const len = String(store.set.len);
  $$("#seg-len button").forEach((b) => {
    const on = b.dataset.v === len;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $("#opt-shuffle").checked = !!store.set.shuffle;
  $("#opt-due").checked = !!store.set.due;
  updatePartsMeta();
}

function startFromDeck() {
  if (!curBook) return;
  const pool = modePool();
  if (!selParts.size) {
    toast("Choose at least one part first.");
    return;
  }
  if (!pool.length) {
    toast(`No ${MODE_LABEL[modeOf()]} cards in these parts — switch mode or pick more parts.`);
    return;
  }
  rememberSel();
  if (store.set.tts) warmUpSpeech();
  const mode = modeOf();
  if (mode === "role") return startRoleSession(buildQueue(pool), curBook.title, curBook.id);
  if (mode === "shadow") return startShadowSession(buildQueue(pool), curBook.title, curBook.id);
  startSession(pool, curBook.title, curBook.id, mode);
}

/* shared queue prep: due-first ordering, shuffle, length cap (same as flashcards) */
function buildQueue(cards) {
  let pool = [...cards];
  if (store.set.due) {
    const groups = new Map();
    pool.forEach((c) => {
      const d = store.srs[c.id]?.d || 0;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(c);
    });
    const ordered = [...groups.keys()].sort((a, b) => a - b);
    pool = ordered.flatMap((d) => (store.set.shuffle ? shuffle(groups.get(d)) : groups.get(d)));
  } else if (store.set.shuffle) {
    pool = shuffle(pool);
  }
  const len = +store.set.len;
  if (len > 0) pool = pool.slice(0, len);
  return pool;
}

/* ══════════════════ SESSION ═══════════════════════════════ */

const sess = {
  queue: [],
  i: 0,
  rated: 0,
  again: 0,
  good: 0,
  easy: 0,
  planned: 0,
  againCards: [],
  title: "Practice",
  bookId: null,
  mode: "answer",
};
let flipped = false;

function startSession(cards, title, bookId, mode) {
  if (!cards.length) { toast("No cards match — pick more parts."); return; }

  const len = +store.set.len;
  let pool = [...cards];

  if (store.set.due) {
    /* oldest due first, but keep some randomness inside each due bucket */
    const groups = new Map();
    pool.forEach((c) => {
      const d = store.srs[c.id]?.d || 0;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(c);
    });
    const ordered = [...groups.keys()].sort((a, b) => a - b);
    pool = ordered.flatMap((d) => (store.set.shuffle ? shuffle(groups.get(d)) : groups.get(d)));
  } else if (store.set.shuffle) {
    pool = shuffle(pool);
  }
  if (len > 0) pool = pool.slice(0, len);

  sess.queue = pool;
  sess.i = 0;
  sess.rated = 0;
  sess.again = 0;
  sess.good = 0;
  sess.easy = 0;
  sess.planned = pool.length;
  sess.againCards = [];
  sess.title = title || "Practice";
  sess.bookId = bookId || null;
  sess.mode = mode === "ask" ? "ask" : "answer";

  discardRecording(true);
  $("#p-deck").textContent = sess.title;
  show("practice");
  showCard();
}

function cur() {
  return sess.queue[sess.i];
}

function showCard() {
  const c = cur();
  if (!c) return finish();

  flipped = false;
  stopSpeaking();
  discardRecording();

  const card = $("#card");
  card.classList.remove("flipped", "speaking");
  card.setAttribute("aria-pressed", "false");
  card.setAttribute("aria-label", "Flashcard — press Space to flip");
  $("#flip-label").textContent = "Flip";
  $("#ratebar").hidden = true;
  $("#rate-hint").hidden = false;
  $("#rec-play").hidden = true;

  const shown = Math.min(sess.i + 1, sess.queue.length);
  $("#p-count").textContent = `${shown} / ${sess.queue.length}`;
  const progress = sess.queue.length ? (sess.i / sess.queue.length) * 100 : 0;
  $("#p-bar").style.width = `${Math.min(100, progress)}%`;

  const starred = store.star.includes(c.id);
  $("#btn-star").classList.toggle("on", starred);
  $("#btn-star").setAttribute("aria-pressed", String(starred));

  /* front */
  const mode = sess.mode === "ask" ? "ask" : "answer";
  $("#model-btn-label").textContent = mode === "ask" ? "Target question" : "Model answer";
  const kb = $("#c-kbadge");
  if (mode === "ask") {
    kb.textContent = "Ask a question";
    kb.className = "kbadge role";
  } else if (c.kind === "role") {
    kb.textContent = "Role-play";
    kb.className = "kbadge role";
  } else {
    kb.textContent = "How to answer";
    kb.className = "kbadge say";
  }

  const part = partName(c);
  $("#c-part").textContent = part;
  $("#c-part").hidden = !part;

  $("#c-q").textContent = c.topic || "Conversation practice";

  $("#c-sit").textContent = c.sit || "";
  $("#c-sit").hidden = !c.sit;

  const lineBox = $("#c-line-box");
  const lineLabel = $("#c-line-label");
  const line = $("#c-line");

  if (mode === "ask") {
    lineBox.classList.add("ask");
    lineLabel.textContent = "Your turn";
    line.textContent = "Ask a natural question about this topic.";
    const first = String(c.q || "").trim().match(/^[A-Za-z']+/)?.[0] || "";
    const cue = $("#c-cue");
    cue.textContent = first ? `Start with “${first}…”` : "Ask about this topic.";
    cue.hidden = false;
    $("#c-hint").textContent = "Ask one question out loud — then flip to see the pattern.";
    $("#btn-hear").title = "Hear the topic again (R)";
  } else {
    lineBox.classList.remove("ask");
    lineLabel.textContent = c.kind === "role" ? "They start" : "They say";
    line.textContent = promptLine(c) || "Answer naturally.";
    $("#c-cue").hidden = true;
    $("#c-hint").textContent = c.kind === "role"
      ? "Take the other part — reply out loud, then flip for the whole conversation."
      : "Answer out loud — then flip to see the pattern.";
    $("#btn-hear").title = "Read their line again (R)";
  }
  lineBox.hidden = false;

  buildBack(c, mode);
  syncCheat();

  if (store.set.tts && !document.hidden) {
    clearTimeout(speakQuestion._t);
    speakQuestion._t = setTimeout(() => {
      if (store.set.tts && !flipped && !document.hidden) speakQuestion(c);
    }, 380);
  }
}

function partName(c) {
  if (!c.book) return "";
  const b = BOOKS.find((x) => x.id === c.book);
  if (!b) return "";
  const p = b.parts.find((pp) => pp.cards.includes(c));
  return p ? p.name : "";
}

/* ── card back ────────────────────────────────────────────── */

function slotify(frame) {
  return esc(frame)
    .replace(/\[([^\]]+)\]/g, '<mark class="slot">[$1]</mark>')
    .replace(/(^|\s)\+/g, '$1<span class="plus">+</span>');
}

function playBtn(text, cls = "") {
  return `<button type="button" class="play-mini ${cls}" data-say="${esc(text)}" title="Listen" aria-label="Listen to this sentence">
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg></button>`;
}

function updateBackScrollHint() {
  const el = $("#back-scroll");
  const fade = $("#back-fade");
  if (!el || !fade) return;
  const more = el.scrollHeight - el.scrollTop - el.clientHeight > 8;
  fade.classList.toggle("show", more);
}

function exItems(ex) {
  return (ex || [])
    .map((e) => (typeof e === "string" ? { t: e, n: "" } : { t: e?.t || "", n: e?.n || "" }))
    .filter((x) => x.t);
}

function exList(ex, exclude = []) {
  const seen = new Set(exclude.filter(Boolean));
  const out = [];
  exItems(ex).forEach((x) => {
    if (!seen.has(x.t)) {
      seen.add(x.t);
      out.push(x);
    }
  });
  return out;
}

function exRows(items) {
  return items.map(({ t, n }) => `<div class="ex-row" data-say="${esc(t)}" role="button" tabindex="0">
    <span class="dot-t" aria-hidden="true">▸</span><span>${esc(t)}</span>${n ? `<span class="ex-note">— ${esc(n)}</span>` : ""}</div>`).join("");
}

/* the COMPLETE card content: pattern, model, all examples, grammar, conversation */
function backHTML(c, mode = "answer") {
  const askMode = mode === "ask";
  let h = "";

  if (askMode) {
    if (c.q) {
      h += `<div class="b-sec"><div class="b-label">Your question</div>
        <div class="question-box">${playBtn(c.q)}
          <div class="mb-txt">${esc(c.q)}</div>
        </div></div>`;
    }
    if (c.frame) {
      h += `<div class="b-sec"><div class="b-label">Pattern — how to ask</div>
        <div class="frame-box">${slotify(c.frame)}</div></div>`;
    }
    const askExs = exList(c.ex, [c.q]);
    if (askExs.length) {
      h += `<div class="b-sec"><div class="b-label">${c.frame ? "More ways to ask — tap to hear" : "Patterns — pick one"}</div>${exRows(askExs)}</div>`;
    }
  } else {
    if (c.frame) {
      h += `<div class="b-sec"><div class="b-label">Pattern — how to answer</div>
        <div class="frame-box">${slotify(c.frame)}</div></div>`;
    }

    const model = modelLine(c);
    if (model) {
      h += `<div class="b-sec"><div class="b-label">${c.kind === "role" ? "Model reply" : "Model answer"}</div>
        <div class="model-box">${playBtn(model)}
          <div class="mb-txt">${esc(model)}</div>
        </div></div>`;
    }

    /* grammar extras: show them whenever a card carries them */
    if (c.rule) h += `<div class="b-sec"><div class="b-label">The rule</div><p class="gram-rule">${esc(c.rule)}</p></div>`;
    if (c.patterns?.length) h += `<div class="b-sec"><div class="b-label">Patterns</div>${
      c.patterns.map((p) => `<div class="gram-pat">${slotify(p)}</div>`).join("")}</div>`;
    if (c.mistakes?.length) h += `<div class="b-sec"><div class="b-label">Avoid</div>${
      c.mistakes.map((m) => `<div class="mistake"><span class="w">✗ ${esc(m.w)}</span> → <span class="r">✓ ${esc(m.r)}</span>${
        m.n ? `<span class="mn">${esc(m.n)}</span>` : ""}</div>`).join("")}</div>`;
    if (c.trick) h += `<div class="b-sec"><div class="b-label">Trick</div><div class="trick-box">${esc(c.trick)}</div></div>`;

    const exs = c.kind === "role" ? [] : exList(c.ex, [model, promptLine(c)]);
    if (exs.length) {
      h += `<div class="b-sec"><div class="b-label">${c.frame ? "More ways to say it — tap to hear" : "Patterns — pick one"}</div>${exRows(exs)}</div>`;
    }

    if (c.dlg?.length) {
      h += `<div class="b-sec"><div class="b-label">Mini conversation
        <button type="button" class="play-all btn-play-dlg">
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>Play both parts</button></div>
        <div class="dlg">${
          c.dlg.map(([sp, t]) => `<div class="dlg-line ${sp.toLowerCase()}"><span class="who">${sp === "A" ? "They ask" : "You say"}</span>${esc(t)}</div>`).join("")
        }</div></div>`;
    }
  }

  return h || `<div class="b-sec"><p class="gram-rule">Answer naturally in your own words — a model is coming soon.</p></div>`;
}

/* wire the "Play both parts" buttons inside a rendered card section */
function bindDlgPlay(root, c) {
  root.querySelectorAll(".btn-play-dlg").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const sec = b.closest(".b-sec");
      playDialogue(c.dlg, sec ? [...sec.querySelectorAll(".dlg-line")] : []);
    });
  });
}

function buildBack(c, mode = "answer") {
  const b = $("#b-kbadge");
  const askMode = mode === "ask";
  b.textContent = askMode ? "How to ask" : "How to answer";
  b.className = `kbadge back-badge${askMode ? " role" : ""}`;
  $("#b-topic").textContent = c.topic || "";

  $("#back-body").innerHTML = backHTML(c, mode);
  $("#back-scroll").scrollTop = 0;
  requestAnimationFrame(updateBackScrollHint);

  bindSay($("#back-body"));
  bindDlgPlay($("#back-body"), c);
}

/* make every [data-say] element speak its text on click / Enter */
function bindSay(root) {
  root.querySelectorAll("[data-say]").forEach((el) => {
    const go = (e) => {
      if (e) e.stopPropagation();
      speakText(el.dataset.say);
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        go();
      }
    });
  });
}

/* ── beginner mode: everything you can say, on the card FRONT ── */

function syncCheat() {
  const c = cur();
  if (!c) return;
  const on = !!store.set.cheat;
  const btn = $("#btn-cheat");
  btn.setAttribute("aria-expanded", String(on));
  btn.classList.toggle("on", on);
  btn.innerHTML = on ? "📖 Hide what to say" : "📖 Show what to say";
  const body = $("#cheat-body");
  body.hidden = !on;
  if (on) {
    /* the FULL card content: pattern, model, all examples, rule, conversation */
    body.innerHTML = backHTML(c, sess.mode);
    bindSay(body);
    bindDlgPlay(body, c);
  }
}

/* ── flip / rate ──────────────────────────────────────────── */

function flip() {
  if (!cur()) return;
  flipped = !flipped;
  const card = $("#card");
  card.classList.toggle("flipped", flipped);
  card.setAttribute("aria-pressed", String(flipped));
  card.setAttribute("aria-label", flipped ? "Flashcard — press Space to see the question" : "Flashcard — press Space to flip");
  $("#ratebar").hidden = !flipped;
  $("#rate-hint").hidden = flipped;
  $("#flip-label").textContent = flipped ? "Question" : "Flip";
  stopSpeaking();
  stopRecPlayback();
  requestAnimationFrame(updateBackScrollHint);
  if (flipped) {
    requestAnimationFrame(() => {
      const r = $("#ratebar").getBoundingClientRect();
      if (r.bottom > window.innerHeight - 6) {
        $("#ratebar").scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }
}

/* shared by flashcards, roleplay and shadowing: SRS box + streak bookkeeping */
function applyRate(kind, c) {
  sess.rated++;
  if (kind === "again") { sess.again++; sess.againCards.push(c); }
  else if (kind === "good") sess.good++;
  else sess.easy++;

  const s = store.srs[c.id] || { b: 0, d: 0 };
  if (kind === "again") { s.b = 0; s.d = Date.now(); }
  if (kind === "good") { s.b = Math.min((s.b || 0) + 1, 5); s.d = Date.now() + s.b * DAY; }
  if (kind === "easy") { s.b = Math.min((s.b || 0) + 2, 6); s.d = Date.now() + 3 * s.b * DAY; }
  store.srs[c.id] = s;
  store.total++;

  const days = new Set(store.days);
  days.add(todayISO());
  store.days = [...days];
  save();
}

function rate(kind) {
  const c = cur();
  if (!c || !flipped) return;

  applyRate(kind, c);

  if (kind === "again" && sess.queue.length < sess.planned + 12) sess.queue.push(c);

  sess.i++;
  showCard();
}

/* ── summary ──────────────────────────────────────────────── */

function finish() {
  stopSpeaking();
  stopRoleAudio();
  stopShadowAudio();
  stopTalkAudio();
  discardRecording(true);

  const done = sess.good + sess.easy;
  const pct = sess.rated ? Math.round((done / sess.rated) * 100) : 0;

  $("#sum-deck").textContent = sess.title;
  $("#sum-again").textContent = sess.again;
  $("#sum-good").textContent = sess.good;
  $("#sum-easy").textContent = sess.easy;
  $("#sum-pct").textContent = `${pct}%`;
  $("#sum-sub").textContent = pct >= 80
    ? "Smooth work — keep the streak going."
    : pct >= 50
      ? "Good effort. The tricky ones are queued for next time."
      : "Every repeat counts — try those again while they're fresh.";
  $("#sum-streak").innerHTML = `🔥 <b>${streak()}-day streak</b> · ${store.total.toLocaleString()} cards spoken all-time`;

  const againN = sess.againCards.length;
  const againBtn = $("#btn-again-cards");
  againBtn.hidden = !againN;
  againBtn.textContent = `Repeat ${againN} Again card${againN === 1 ? "" : "s"}`;

  const backBtn = $("#btn-back-deck");
  backBtn.textContent = sess.bookId ? "Back to deck" : "Back to decks";
  $("#btn-home").hidden = !sess.bookId;

  show("summary");

  const ring = $("#ring-fg");
  ring.style.transition = "none";
  ring.style.strokeDashoffset = "327";
  requestAnimationFrame(() => {
    ring.style.transition = "";
    setTimeout(() => {
      ring.style.strokeDashoffset = String(327 - (327 * pct) / 100);
    }, 80);
  });
}

function backFromRound() {
  stopSession();

  const b = sess.bookId ? BOOKS.find((x) => x.id === sess.bookId) : null;
  if (b) {
    const hash = `#/deck/${b.id}`;
    if (location.hash !== hash) {
      try { history.replaceState(null, "", hash); } catch { /* ignore */ }
    }
    curBook = b;
    renderDeck();
    show("deck");
    return;
  }

  if (location.hash) {
    try { history.replaceState(null, "", location.href.replace(/#.*$/, "")); } catch { /* ignore */ }
  }
  curBook = null;
  renderHome();
  show("home");
}

function stopSession() {
  stopSpeaking();
  discardRecording(true);
  stopRoleAudio();
  stopShadowAudio();
  stopTalkAudio();
}

/* ══════════════════ ROLEPLAY — conversation mode ═══════════ */
/* The app speaks one side of the card's mini-dialogue, you take the
   other side turn by turn, then review the whole conversation.     */

const rp = { queue: [], i: 0, t: 0, phase: "idle", done: false };
let rpWatch = null;
let rpGen = 0;           // bumped on every stop — invalidates pending onend chains

function resetSessCommon(queue, title, bookId, mode) {
  sess.queue = queue;
  sess.i = 0;
  sess.rated = 0;
  sess.again = 0;
  sess.good = 0;
  sess.easy = 0;
  sess.planned = queue.length;
  sess.againCards = [];
  sess.title = title || "Practice";
  sess.bookId = bookId || null;
  sess.mode = mode;
}

function startRoleSession(queue, title, bookId) {
  if (!queue.length) { toast("No conversation cards here."); return; }
  rp.queue = queue;
  rp.i = 0;
  resetSessCommon(queue, title, bookId, "role");
  $("#role-deck").textContent = sess.title;
  show("role");
  loadDialogue();
}

function stopRoleAudio() {
  rpGen++;               // cancel() fires onend asynchronously — stale chains must die
  stopSpeaking();
  clearTimeout(rpWatch);
  rpWatch = null;
}

/* speak one line, then continue — with a watchdog if TTS never fires.
   A generation token stops the chain when you leave the screen:
   cancel() fires onend AFTER we stopped, and a stale chain would
   start speaking the next line on the home screen. */
function rpSpeak(txt, voice, pitch, onDone) {
  stopSpeaking();
  const gen = rpGen;
  let done = false;
  const fin = () => {
    if (done) return;
    done = true;
    clearTimeout(rpWatch);
    rpWatch = null;
    if (gen !== rpGen) return;   // stopped meanwhile — do not continue
    onDone?.();
  };
  const est = Math.max(1400, (txt.length * 78) / (store.set.rate || 0.9)) + 800;
  if (canSpeak) {
    try {
      speechSynthesis.speak(utter(txt, { voice, pitch, onend: fin, onerror: fin }));
    } catch { fin(); }
  }
  rpWatch = setTimeout(fin, est + 1600);
}

function rpBubble(sp, txt, slot) {
  const div = document.createElement("div");
  div.className = `rp-bubble ${sp === "B" ? "me" : "them"}${slot ? " slot" : ""}`;
  div.innerHTML =
    `<span class="rp-who">${sp === "B" ? "You" : "Them"}</span>` +
    `<span class="rp-txt">${slot ? "🎤 Your turn — say your line out loud" : esc(txt)}</span>`;
  $("#rp-chat").appendChild(div);
  $("#rp-chat").scrollTop = 1e9;
  return div;
}

function updateRoleChrome() {
  $("#role-count").textContent = `${Math.min(rp.i + 1, rp.queue.length)} / ${rp.queue.length}`;
  $("#role-bar").style.width = `${(rp.i / Math.max(1, rp.queue.length)) * 100}%`;
  const c = rp.queue[rp.i];
  const on = !!c && store.star.includes(c.id);
  $("#btn-role-star").classList.toggle("on", on);
  $("#btn-role-star").setAttribute("aria-pressed", String(on));
}

function loadDialogue() {
  const c = rp.queue[rp.i];
  if (!c) return finish();
  rp.t = 0;
  rp.done = false;
  rp.phase = "app";
  stopRoleAudio();
  $("#rp-topic").textContent = c.topic || "Conversation";
  $("#rp-chat").innerHTML = "";
  $("#rp-end").hidden = true;
  $("#rp-controls").hidden = false;
  $("#btn-rp-reveal").innerHTML = "<span>Reveal my line ▸</span>";
  updateRoleChrome();
  stepRole();
}

/* advance the dialogue one turn: app lines speak automatically,
   user lines wait for you to speak + reveal */
function stepRole() {
  const c = rp.queue[rp.i];
  const turns = c?.dlg || [];
  if (rp.t >= turns.length) return endDialogue();

  const [sp, txt] = turns[rp.t];
  if (sp === "B") {
    rp.phase = "user";
    $("#btn-rp-reveal").disabled = false;
    rpBubble("B", "", true);
    $("#btn-rp-reveal").innerHTML = "<span>Reveal my line ▸</span>";
    if (store.set.cheat) rpFillSlot();   // beginner mode: show the line right away
    return;
  }

  /* app line */
  rp.phase = "app";
  $("#btn-rp-reveal").disabled = true;      // nothing to reveal while they speak
  const bub = rpBubble(sp, txt);
  bub.classList.add("spoken");
  setTimeout(() => bub.classList.remove("spoken"), 1500);
  rpSpeak(txt, sp === "B" ? voiceB : voiceA, 1, () => {
    rp.t += 1;
    stepRole();
  });
}

function rpFillSlot() {
  const c = rp.queue[rp.i];
  const turns = c?.dlg || [];
  const line = turns[rp.t];
  if (!line) return;
  rp.phase = "revealed";

  const slots = $$("#rp-chat .rp-bubble.slot");
  const slot = slots[slots.length - 1];
  if (!slot) return;

  /* beginner mode: also offer alternative ways to say the same thing */
  const alts = store.set.cheat
    ? exList(c.ex).map((x) => x.t).filter((t) => t && t !== line[1]).slice(0, 2)
    : [];

  let h =
    `<span class="rp-who">You</span>` +
    `<span class="rp-txt">${esc(line[1])}</span>` +
    `<button type="button" class="play-mini" data-say="${esc(line[1])}" title="Listen" aria-label="Listen to this line">
       <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg></button>`;
  if (alts.length) {
    h += `<span class="rp-alts"><em>or:</em> ${alts.map((a) =>
      `<button type="button" class="rp-alt" data-say="${esc(a)}">“${esc(a)}”</button>`).join(" ")}</span>`;
  }

  slot.classList.remove("slot");
  slot.classList.add("filled");
  slot.innerHTML = h;
  slot.querySelectorAll("[data-say]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      rpSpeak(b.dataset.say, voiceB, 1.12);
    });
  });
  $("#rp-chat").scrollTop = 1e9;
  $("#btn-rp-reveal").innerHTML = "<span>Continue ▸</span>";
}

function rpReveal() {
  if (rp.phase === "user") return rpFillSlot();
  if (rp.phase === "revealed") {
    rp.t += 1;
    stepRole();
  }
}

function rpReplay() {
  const c = rp.queue[rp.i];
  const turns = c?.dlg || [];
  /* replay the last app line before the current user turn */
  let k = Math.min(rp.t, turns.length - 1);
  while (k >= 0 && turns[k][0] === "B") k--;
  const line = k >= 0 ? turns[k] : turns[rp.t];
  if (line) rpSpeak(line[1], line[0] === "B" ? voiceB : voiceA, 1);
}

/* keyboard/click primary action */
function rpPrimary() {
  if (rp.done) return;
  if (rp.phase === "user" || rp.phase === "revealed") return rpReveal();
  rpReplay();
}

function endDialogue() {
  rp.phase = "done";
  rp.done = true;
  $("#rp-controls").hidden = true;
  $("#rp-end").hidden = false;
}

/* play the whole finished conversation, line by line */
function playRoleAll() {
  stopRoleAudio();
  const c = rp.queue[rp.i];
  const turns = (c?.dlg || []).slice(0, 8);
  const bubbles = $$("#rp-chat .rp-bubble");
  let t = 200;
  turns.forEach(([sp, txt], i) => {
    dlgTimers.push(setTimeout(() => {
      bubbles[i]?.classList.add("spoken");
      if (canSpeak) {
        try { speechSynthesis.speak(utter(txt, { voice: sp === "B" ? voiceB : voiceA, pitch: sp === "B" ? 1.12 : 1 })); } catch { /* ignore */ }
      }
      dlgTimers.push(setTimeout(() => bubbles[i]?.classList.remove("spoken"), 1600));
    }, t));
    t += Math.max(1800, (txt.length * 78) / (store.set.rate || 0.9));
  });
}

function rateRole(kind) {
  const c = rp.queue[rp.i];
  if (!c || !rp.done) return;
  applyRate(kind, c);
  if (kind === "again" && rp.queue.length < sess.planned + 12) rp.queue.push(c);
  rp.i += 1;
  loadDialogue();
}

/* ══════════════════ SHADOWING — hear a phrase, repeat it ════ */

const sh = { queue: [], i: 0, chunks: [], k: 0 };

function startShadowSession(queue, title, bookId) {
  if (!queue.length) { toast("No cards here."); return; }
  sh.queue = queue;
  sh.i = 0;
  resetSessCommon(queue, title, bookId, "shadow");
  $("#sh-deck").textContent = sess.title;
  show("shadow");
  loadShadowCard();
}

function stopShadowAudio() {
  stopSpeaking();
}

/* phrases to shadow for a card: their line, the model, then examples */
function shadowChunks(c) {
  const out = [];
  const push = (t) => {
    t = String(t || "").trim();
    if (t && t.split(" ").length >= 2 && !out.includes(t)) out.push(t);
  };
  push(promptLine(c));
  push(modelLine(c));
  exList(c.ex).forEach((x) => push(x.t));
  return out.slice(0, 6);
}

function updateShadowChrome() {
  const n = sh.queue.length;
  $("#sh-count-top").textContent = `${Math.min(sh.i + 1, n)} / ${n}`;
  $("#sh-bar").style.width = `${(sh.i / Math.max(1, n)) * 100}%`;
  const c = sh.queue[sh.i];
  const on = !!c && store.star.includes(c.id);
  $("#btn-sh-star").classList.toggle("on", on);
  $("#btn-sh-star").setAttribute("aria-pressed", String(on));
}

function loadShadowCard() {
  const c = sh.queue[sh.i];
  if (!c) return finish();
  sh.chunks = shadowChunks(c);
  if (!sh.chunks.length) {           /* nothing sayable on this card — skip it */
    sh.i += 1;
    return loadShadowCard();
  }
  sh.k = 0;
  stopShadowAudio();
  $("#sh-meta").textContent = [partName(c), c.topic].filter(Boolean).join(" · ");
  $("#sh-end").hidden = true;
  $("#sh-controls").hidden = false;
  updateShadowChrome();
  showShadowChunk(true);
}

function showShadowChunk(autoplay) {
  const txt = sh.chunks[sh.k];
  $("#sh-phrase").textContent = txt;
  $("#sh-count").textContent = `phrase ${sh.k + 1} / ${sh.chunks.length}`;
  $("#sh-dots").innerHTML = sh.chunks.map((_, i) => `<i class="${i <= sh.k ? "on" : ""}"></i>`).join("");
  if (autoplay) shadowSpeak(false);
}

function shadowSpeak(slow) {
  const txt = sh.chunks[sh.k];
  if (!txt || !canSpeak) return;
  stopShadowAudio();
  try {
    speechSynthesis.speak(utter(txt, { rate: slow ? 0.62 : undefined }));
  } catch { /* ignore */ }
}
function shadowNext() {
  if (!$("#sh-end").hidden) return;
  if (sh.k + 1 < sh.chunks.length) {
    sh.k += 1;
    showShadowChunk(true);
  } else {
    $("#sh-controls").hidden = true;
    $("#sh-end").hidden = false;
  }
}

/* play every phrase of the card in order */
function playShadowAll() {
  stopShadowAudio();
  let t = 250;
  sh.chunks.forEach((txt) => {
    dlgTimers.push(setTimeout(() => {
      if (canSpeak) { try { speechSynthesis.speak(utter(txt)); } catch { /* ignore */ } }
    }, t));
    t += Math.max(1900, (txt.length * 78) / (store.set.rate || 0.9)) + 600;
  });
}

function rateShadow(kind) {
  const c = sh.queue[sh.i];
  if (!c || !$("#sh-end").hidden) return;
  applyRate(kind, c);
  if (kind === "again" && sh.queue.length < sess.planned + 12) sh.queue.push(c);
  sh.i += 1;
  loadShadowCard();
}

/* ══════════════════ 1-MINUTE TALK ══════════════════════════ */
/* Random topic, 60-second timer, record yourself, listen back. */

const TALK_TOPICS = (() => {
  const seen = new Set();
  const out = [];
  const books = [...BOOKS].sort((a, b) => (b.id === "conv3" ? 1 : 0) - (a.id === "conv3" ? 1 : 0));
  for (const b of books) {
    for (const p of b.parts) {
      for (const c of p.cards) {
        const t = String(c.topic || "").trim();
        if (!t || t.length < 4 || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
})();

const tk = { topic: "", phase: "ready", t0: 0, left: 60, tick: null, rec: null, chunks: [], url: "", player: null };

function openTalk() {
  stopTalkAudio();
  if (!tk.topic) newTalkTopic();
  setTalkPhase("ready");
  syncTalkHelpDefault();
  $("#tk-bar").style.width = "0%";
  $("#tk-count").textContent = "⏱ freestyle";
  show("talk");
}

function setTalkPhase(p) {
  tk.phase = p;
  $("#tk-ready").hidden = p !== "ready";
  $("#tk-live").hidden = p !== "live";
  $("#tk-done").hidden = p !== "done";
}

function newTalkTopic() {
  tk.topic = TALK_TOPICS[Math.floor(Math.random() * TALK_TOPICS.length)] || "Your day so far";
  $("#tk-topic").textContent = tk.topic;
  renderTalkHelp();
}

/* ── "how do I start?" helpers for the 1-minute talk ──────── */

function tkSay(text, rate) {
  if (!text || !canSpeak) { toast("This browser can't speak — try Chrome or Edge."); return; }
  stopSpeaking();
  try { speechSynthesis.speak(utter(text, { rate })); } catch { /* ignore */ }
}

/* openers that work with any topic — topic slot is lowercased mid-sentence */
function tkOpeners(topic) {
  const t = String(topic || "").toLowerCase();
  return [
    `Let me tell you about ${t}.`,
    `Well, ${t} — where do I start?`,
    `The first thing that comes to mind when I think about ${t} is…`,
  ];
}

/* real lines from your books for this exact topic */
function talkPhrases(topic) {
  const key = String(topic || "").toLowerCase();
  const out = [];
  const seen = new Set();
  for (const b of BOOKS) {
    for (const p of b.parts) {
      for (const c of p.cards) {
        if (String(c.topic || "").toLowerCase() !== key) continue;
        const ex0 = exItems(c.ex)[0]?.t || "";
        /* prefer the conversation opener — it's the natural first line for this topic */
        for (const line of [c.dlg?.[0]?.[1] || "", modelLine(c), ex0]) {
          const s = String(line || "").trim();
          if (s && s.split(" ").length >= 3 && !seen.has(s.toLowerCase())) {
            seen.add(s.toLowerCase());
            out.push(s);
            if (out.length >= 3) return out;
          }
        }
      }
    }
  }
  return out;
}

function renderTalkHelp() {
  $("#tk-openers").innerHTML = tkOpeners(tk.topic)
    .map((s) => `<button type="button" class="tk-chip" data-say="${esc(s)}">
      <svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>${esc(s)}</button>`)
    .join("");

  const phrases = talkPhrases(tk.topic);
  $("#tk-phrases-sec").hidden = !phrases.length;
  $("#tk-phrases").innerHTML = phrases
    .map((s) => `<button type="button" class="tk-phrase" data-say="${esc(s)}">
      <svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>${esc(s)}</button>`)
    .join("");
}

/* a model 25-second talk built on the current topic */
function tkModelTalk(topic) {
  const t = String(topic || "").toLowerCase();
  return `Let me tell you about ${t}. To be honest, it's something I think about quite often. `
    + `For example, last week I was with a friend and we started talking about it, and I realized I had a lot to say. `
    + `Sometimes it's easy, sometimes it's a little hard, but that's exactly what makes it interesting. `
    + `So yeah — that's my one minute on ${t}.`;
}

function toggleTalkHelp(force) {
  const box = $("#tk-how");
  const open = force !== undefined ? force : box.hidden;
  box.hidden = !open;
  $("#btn-tk-how").setAttribute("aria-expanded", String(open));
  $("#tk-how-arrow").textContent = open ? "▴" : "▾";
}

/* auto-open the helper for the first few talks, until speaking feels natural */
function syncTalkHelpDefault() {
  toggleTalkHelp((store.talks || 0) < 3);
}

async function startTalk() {
  setTalkPhase("live");
  tk.t0 = Date.now();
  tk.left = 60;
  renderTalkTime();
  tk.tick = setInterval(talkTick, 250);

  /* record while you talk — best effort, timer works without mic */
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (tk.phase !== "live") { stream.getTracks().forEach((t) => t.stop()); return; }
    tk.chunks = [];
    tk.rec = new MediaRecorder(stream);
    tk.rec.ondataavailable = (e) => { if (e.data.size) tk.chunks.push(e.data); };
    tk.rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!tk.chunks.length) return;
      if (tk.url) URL.revokeObjectURL(tk.url);
      tk.url = URL.createObjectURL(new Blob(tk.chunks, { type: tk.rec.mimeType || "audio/webm" }));
      tk.chunks = [];
      tk.player = new Audio(tk.url);
    };
    tk.rec.start();
    $("#tk-rec-dot").classList.add("on");
  } catch {
    $("#tk-rec-dot").classList.remove("on");
  }
}

function talkTick() {
  tk.left = Math.max(0, 60 - (Date.now() - tk.t0) / 1000);
  renderTalkTime();
  if (tk.left <= 0) endTalk();
}

function renderTalkTime() {
  const s = Math.ceil(tk.left);
  $("#tk-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  $("#tk-bar").style.width = `${((60 - tk.left) / 60) * 100}%`;
  $("#tk-count").textContent = `⏱ ${s}s left`;
}

function endTalk() {
  clearInterval(tk.tick);
  tk.tick = null;
  try { if (tk.rec?.state === "live") tk.rec.stop(); } catch { /* ignore */ }
  $("#tk-rec-dot").classList.remove("on");
  setTalkPhase("done");
  store.talks = (store.talks || 0) + 1;
  const days = new Set(store.days);
  days.add(todayISO());
  store.days = [...days];
  save();
}

function playTalkTake() {
  if (!tk.player) { toast("No recording — check the mic permission and try again."); return; }
  stopSpeaking();
  try { tk.player.currentTime = 0; tk.player.play().catch(() => toast("Could not play that recording.")); } catch { /* ignore */ }
}

function rateTalk(kind) {
  toast(kind === "easy" ? "Fluent! 🌟" : kind === "good" ? "Nice — keep the streak going 🔥" : "Rough talks make you stronger 💪");
  stopTalkAudio();
  newTalkTopic();
  setTalkPhase("ready");
  $("#tk-bar").style.width = "0%";
  $("#tk-count").textContent = "⏱ freestyle";
}

function rateTalkReset() {
  stopTalkAudio();
  newTalkTopic();
  setTalkPhase("ready");
  $("#tk-bar").style.width = "0%";
  $("#tk-count").textContent = "⏱ freestyle";
}

function stopTalkAudio() {
  stopSpeaking();          // the model example must not follow you out of the screen
  clearInterval(tk.tick);
  tk.tick = null;
  try { if (tk.rec?.state === "live") tk.rec.stop(); } catch { /* ignore */ }
  const dot = $("#tk-rec-dot");
  dot?.classList.remove("on");
  try { tk.player?.pause(); } catch { /* ignore */ }
}


/* ══════════════════ GRAMMAR QUIZ ══════════════════════════ */

function quizPromptHTML(text, focus = []) {
  let html = esc(text || "");
  html = html.replace(/_{4,}/g, '<span class="quiz-blank" aria-label="blank"></span>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/\n/g, "<br>");
  focus.forEach((word) => {
    const safe = esc(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safe) return;
    const re = new RegExp(`\\b${safe}\\b`, "gi");
    html = html.replace(re, (match) => `<b class="quiz-focus-word">${match}</b>`);
  });
  return html;
}

function renderQuizTopics() {
  const list = $("#quiz-topic-list");
  if (!list) return;

  const query = quizSearch.trim().toLowerCase();
  const groups = new Map();
  QUIZ_TOPICS.forEach((topic) => {
    if (!groups.has(topic.part)) groups.set(topic.part, []);
    groups.get(topic.part).push(topic);
  });

  let html = "";
  let shown = 0;

  groups.forEach((topics, part) => {
    const filtered = topics.filter((topic) => {
      if (!query) return true;
      return topic.title.toLowerCase().includes(query)
        || part.toLowerCase().includes(query)
        || String(topic.num).includes(query);
    });
    if (!filtered.length) return;
    shown += filtered.length;

    html += `<div class="quiz-part"><div class="quiz-part-head">${esc(part)}</div>`;
    filtered.forEach((topic) => {
      const record = store.quiz[String(topic.num)];
      const tried = !!record && record.attempts > 0;
      const best = tried ? record.best : 0;
      html += `<button type="button" class="quiz-topic" data-num="${topic.num}">
        <span class="qt-num">${topic.num}</span>
        <span class="qt-copy">
          <b>${esc(topic.title)}</b>
          <small>${topic.questions.length} questions${tried ? ` · best ${best}/${topic.questions.length}` : ""}</small>
        </span>
        <span class="qt-best${tried ? " has" : ""}">${tried ? `Best ${best}/${topic.questions.length}` : "New"}</span>
        <span class="qt-go" aria-hidden="true">→</span>
      </button>`;
    });
    html += `</div>`;
  });

  if (!shown) {
    html = `<p class="quiz-empty">No lessons match “${esc(quizSearch.trim())}”.</p>`;
  }
  list.innerHTML = html;

  $$("#quiz-topic-list .quiz-topic").forEach((button) => {
    button.addEventListener("click", () => {
      quizNavFromTopics = true;
      location.hash = `#/quiz/${button.dataset.num}`;
    });
  });

  const total = QUIZ_TOPICS.reduce((sum, topic) => sum + topic.questions.length, 0);
  const summary = $("#quiz-summary");
  if (summary) summary.textContent = `${QUIZ_TOPICS.length} lessons · ${total.toLocaleString()} questions`;
  const entrySub = $("#quiz-entry-sub");
  if (entrySub) entrySub.textContent = `${QUIZ_TOPICS.length} lessons · ${QUIZ_TOPICS[0]?.questions.length || 50} questions each`;
}

function startTopicQuiz(topic, fromTopics = false) {
  if (!topic) return;
  stopAllAudio();
  const questions = shuffle(topic.questions).map((question) => ({ ...question, _topic: topic }));
  beginQuiz({
    routeId: String(topic.num),
    topicNum: topic.num,
    label: topic.title,
    part: topic.part,
    topic,
    questions,
    fromTopics,
  });
}

function startRandomQuiz(fromTopics = false) {
  if (!QUIZ_TOPICS.length) return;
  stopAllAudio();
  const pool = [];
  QUIZ_TOPICS.forEach((topic) => {
    topic.questions.forEach((question) => pool.push({ ...question, _topic: topic }));
  });
  const questions = shuffle(pool).slice(0, 50);
  beginQuiz({
    routeId: "random",
    topicNum: null,
    label: "Random 50",
    part: "All lessons",
    topic: { title: "Random 50", part: "All lessons", rule: "", trick: "" },
    questions,
    fromTopics,
  });
}

function beginQuiz({ routeId, topicNum, label, part, topic, questions, fromTopics }) {
  quizState = {
    routeId,
    topicNum,
    label,
    part,
    topic,
    questions,
    fromTopics: !!fromTopics,
    i: 0,
    selected: new Set(),
    checked: false,
    score: 0,
    wrong: [],
    screen: "quiz",
  };
  show("quiz");
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const state = quizState;
  if (!state) return;
  const question = state.questions[state.i];
  if (!question) { finishQuiz(); return; }

  const qTopic = question._topic || state.topic;
  const isMulti = question.type === "multi";

  $("#qz-crumb").textContent = state.topicNum != null ? qTopic.title : `Random · ${qTopic.title}`;
  $("#qz-count").textContent = `${state.i + 1} / ${state.questions.length}`;
  $("#qz-bar").style.width = `${(state.i / state.questions.length) * 100}%`;
  $("#qz-score").textContent = state.score;

  const badge = $("#qz-badge");
  badge.textContent = isMulti ? "Select all that apply" : "Multiple choice";
  badge.className = `kbadge${isMulti ? " role" : " say"}`;

  const hint = $("#qz-hint");
  hint.textContent = question.hint || "";
  hint.hidden = !question.hint;

  const focus = $("#qz-focus");
  if (question.focus && question.focus.length) {
    focus.hidden = false;
    focus.innerHTML = `Bold word${question.focus.length > 1 ? "s" : ""}: ${question.focus.map(esc).join(", ")}`;
  } else {
    focus.hidden = true;
    focus.textContent = "";
  }

  $("#qz-prompt").innerHTML = quizPromptHTML(question.prompt, question.focus || []);

  /* Shuffle the answer positions for every presentation so the letters
     cannot be memorised from a previous attempt. */
  const order = shuffle([...question.options.keys()]);
  const view = {
    order,
    options: order.map((originalIndex) => question.options[originalIndex]),
    correct: question.correct.map((originalIndex) => order.indexOf(originalIndex)).sort((a, b) => a - b),
    why: question.optionWhy ? order.map((originalIndex) => question.optionWhy[originalIndex]) : [],
  };
  state.view = view;

  const options = $("#qz-options");
  options.classList.toggle("multi", isMulti);
  options.innerHTML = view.options.map((option, index) => `
    <button type="button" class="quiz-option" data-i="${index}" aria-pressed="false">
      <span class="qo-letter">${"ABCDEFGH"[index] || index + 1}</span>
      <span class="qo-text">${esc(option)}</span>
      <span class="qo-mark" aria-hidden="true"></span>
    </button>`).join("");

  $$("#qz-options .quiz-option").forEach((button) => {
    button.addEventListener("click", () => selectQuizOption(Number(button.dataset.i)));
  });

  const feedback = $("#qz-feedback");
  feedback.hidden = true;
  feedback.className = "quiz-feedback";
  feedback.innerHTML = "";

  $("#btn-quiz-check").hidden = false;
  $("#btn-quiz-check").disabled = true;
  $("#btn-quiz-check").textContent = "Check answer";
  $("#btn-quiz-next").hidden = true;

  state.selected = new Set();
  state.checked = false;
  window.scrollTo(0, 0);
}

function selectQuizOption(index) {
  const state = quizState;
  if (!state || state.checked) return;
  const question = state.questions[state.i];
  if (!question || !state.view || index < 0 || index >= state.view.options.length) return;

  if (question.type === "multi") {
    if (state.selected.has(index)) state.selected.delete(index);
    else state.selected.add(index);
  } else {
    state.selected = new Set([index]);
  }

  $$("#qz-options .quiz-option").forEach((button) => {
    const on = state.selected.has(Number(button.dataset.i));
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", String(on));
  });
  $("#btn-quiz-check").disabled = state.selected.size === 0;
}

function checkQuizAnswer() {
  const state = quizState;
  if (!state || state.checked) return;
  const question = state.questions[state.i];
  const view = state.view;
  if (!question || !view || !state.selected.size) return;

  state.checked = true;
  const correctSet = new Set(view.correct);
  const selected = [...state.selected];
  const isCorrect = selected.length === correctSet.size && selected.every((index) => correctSet.has(index));
  if (isCorrect) state.score++;

  $$("#qz-options .quiz-option").forEach((button) => {
    const index = Number(button.dataset.i);
    const isCorrectOption = correctSet.has(index);
    const picked = state.selected.has(index);
    button.classList.toggle("correct", isCorrectOption);
    button.classList.toggle("wrong", picked && !isCorrectOption);
    button.classList.toggle("missed", isCorrectOption && !picked);
    button.disabled = true;
    const mark = button.querySelector(".qo-mark");
    if (isCorrectOption) mark.textContent = "✓";
    else if (picked) mark.textContent = "✗";
  });

  const qTopic = question._topic || state.topic;
  const correctText = view.correct.map((index) => view.options[index]).join(" · ");
  const yourText = selected.map((index) => view.options[index]).join(" · ");

  const feedback = $("#qz-feedback");
  feedback.hidden = false;
  feedback.className = `quiz-feedback ${isCorrect ? "good" : "bad"}`;

  let html = `<div class="qf-head"><span class="qf-ico" aria-hidden="true">${isCorrect ? "✓" : "!"}</span><b>${isCorrect ? "Correct!" : "Not quite."}</b></div>`;
  if (!isCorrect) {
    html += `<p class="qf-answer">Your answer: ${esc(yourText || "—")}</p>`;
    html += `<p class="qf-answer">Correct answer: <b>${esc(correctText)}</b></p>`;
  } else {
    html += `<p class="qf-answer">Answer: <b>${esc(correctText)}</b></p>`;
  }
  if (question.explanation) html += `<p class="qf-why">${esc(question.explanation)}</p>`;
  if (question.type === "multi" && view.why?.length) {
    html += `<ul class="qf-list">${view.why.map((why) => `<li>${esc(why)}</li>`).join("")}</ul>`;
  }
  feedback.innerHTML = html;

  if (!isCorrect) {
    state.wrong.push({
      index: state.i + 1,
      question,
      options: view.options,
      selected: [...state.selected],
      correct: [...view.correct],
      why: view.why,
      topic: qTopic,
    });
  }

  $("#qz-score").textContent = state.score;
  $("#qz-bar").style.width = `${((state.i + 1) / state.questions.length) * 100}%`;

  $("#btn-quiz-check").hidden = true;
  const next = $("#btn-quiz-next");
  next.hidden = false;
  next.textContent = state.i + 1 >= state.questions.length ? "See results" : "Next question";
  next.focus({ preventScroll: true });

  requestAnimationFrame(() => {
    const rect = feedback.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

function nextQuizQuestion() {
  const state = quizState;
  if (!state || !state.checked) return;
  if (state.i + 1 < state.questions.length) {
    state.i++;
    renderQuizQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  const state = quizState;
  if (!state) return;

  state.screen = "quiz-result";
  const total = state.questions.length;
  const correct = state.score;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const key = state.topicNum != null ? String(state.topicNum) : "random";
  const record = store.quiz[key] || { best: 0, attempts: 0 };
  record.best = Math.max(record.best || 0, correct);
  record.attempts = (record.attempts || 0) + 1;
  store.quiz[key] = record;
  save();

  $("#qz-result-crumb").textContent = state.label;
  $("#qz-result-title").textContent = pct === 100 ? "Perfect round!" : "Quiz complete";
  $("#qz-result-sub").textContent = `${state.label} · ${correct} of ${total} correct`;
  $("#qz-correct").textContent = correct;
  $("#qz-wrong").textContent = total - correct;
  $("#qz-best").textContent = `${record.best}/${total}`;
  $("#qz-pct").textContent = `${pct}%`;

  const review = $("#quiz-review");
  if (state.wrong.length) {
    review.innerHTML = `<div class="quiz-part-head">Review your mistakes</div>` + state.wrong.map((item) => {
      const question = item.question;
      const correctText = item.correct.map((index) => item.options[index]).join(" · ");
      const yourText = item.selected.map((index) => item.options[index]).join(" · ") || "—";
      return `<details class="quiz-miss">
        <summary><span class="qm-tag">Q${item.index}</span> ${esc(question.prompt.replace(/\s+/g, " "))}</summary>
        <div class="qm-body">
          <p><b>Options:</b> ${esc(item.options.join(" · "))}</p>
          <p><b>Your answer:</b> ${esc(yourText)}</p>
          <p><b>Correct:</b> ${esc(correctText)}</p>
          <p><b>Why:</b> ${esc(question.explanation || "")}</p>
        </div>
      </details>`;
    }).join("");
  } else {
    review.innerHTML = `<p class="quiz-review-empty">Perfect round — no mistakes to review.</p>`;
  }

  const ring = $("#qz-ring-fg");
  ring.style.transition = "none";
  ring.style.strokeDashoffset = "327";
  requestAnimationFrame(() => {
    ring.style.transition = "";
    setTimeout(() => {
      ring.style.strokeDashoffset = String(327 - (327 * pct) / 100);
    }, 80);
  });

  show("quiz-result");
}

function retryQuiz() {
  if (!quizState) return;
  const fromTopics = quizState.fromTopics;
  if (quizState.topicNum != null) {
    const topic = QUIZ_BY_NUM.get(String(quizState.topicNum));
    if (topic) startTopicQuiz(topic, fromTopics);
  } else {
    startRandomQuiz(fromTopics);
  }
}

function quizToTopics() {
  const fromTopics = !!quizState?.fromTopics;
  quizState = null;
  if (fromTopics && history.length > 1) {
    history.back();
    return;
  }
  if (location.hash !== "#/quiz") {
    try { history.replaceState(null, "", "#/quiz"); } catch { /* ignore */ }
  }
  renderQuizTopics();
  show("quiz-home");
}

function stopAllAudio() {
  stopSpeaking();
  stopRoleAudio();      // bumps the generation token — kills pending onend chains
  stopRecPlayback();
  if (rec.state === "live" || rec.state === "starting") discardRecording(true);
  stopTalkAudio();
}

/* ══════════════════ SPEECH (TTS) ══════════════════════════ */

const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let voices = [];
let voiceA = null, voiceB = null;
let speakingNow = false;

function pickVoices() {
  if (!canSpeak) return;
  const sel = $("#set-voice");
  voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  if (!voices.length) {
    if (!sel.options.length) sel.innerHTML = `<option value="">Loading voices…</option>`;
    return;
  }

  const pref = ["Google UK English Female", "Libby", "Sonia", "Aria", "Samantha", "Google US English", "Microsoft Zira"];
  voiceA = voices.find((v) => v.voiceURI === store.set.voiceURI)
    || pref.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean)
    || voices[0];
  voiceB = voices.find((v) => v !== voiceA && /female|aria|libby|sonia|zira|samantha/i.test(v.name))
    || voices.find((v) => v !== voiceA)
    || voiceA;

  sel.innerHTML = voices.map((v) =>
    `<option value="${esc(v.voiceURI)}"${v === voiceA ? " selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("");
}

if (canSpeak) {
  if (typeof speechSynthesis.addEventListener === "function") {
    speechSynthesis.addEventListener("voiceschanged", pickVoices);
  } else {
    speechSynthesis.onvoiceschanged = pickVoices;
  }
  pickVoices();
}

function utter(text, { voice = voiceA, pitch = 1, rate, onstart, onend, onerror } = {}) {
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = rate || store.set.rate;
  u.pitch = pitch;
  if (onstart) u.onstart = onstart;
  if (onend) u.onend = onend;
  if (onerror) u.onerror = onerror;
  return u;
}

function stopSpeaking() {
  if (canSpeak) { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
  speakingNow = false;
  setHearLabel(false);
  $("#card")?.classList.remove("speaking");
  clearTimeout(speakQuestion._t);
  dlgTimers.forEach(clearTimeout);
  dlgTimers = [];
}

function setHearLabel(on) {
  const el = $("#hear-label");
  if (el) el.textContent = on ? "Stop" : "Hear it";
}

function stopRecPlayback() {
  if (!rec.player) return;
  try {
    rec.player.pause();
    rec.player.currentTime = 0;
  } catch { /* ignore */ }
}

function speakText(text) {
  if (!text) return;
  if (!canSpeak) { toast("This browser can't speak — try Chrome or Edge."); return; }
  stopRecPlayback();
  stopSpeaking();
  const u = utter(text, {
    onstart: () => {
      speakingNow = true;
      setHearLabel(true);
      $("#card").classList.add("speaking");
    },
    onend: () => {
      speakingNow = false;
      setHearLabel(false);
      $("#card").classList.remove("speaking");
    },
    onerror: () => {
      speakingNow = false;
      setHearLabel(false);
      $("#card").classList.remove("speaking");
    },
  });
  speechSynthesis.speak(u);
}

function speakQuestion(c) {
  if (!c) return;
  if (sess.mode === "ask") {
    speakText(`${c.topic || "Conversation practice"}. Ask a natural question.`);
    return;
  }
  /* for reply cards, read just the quoted line, not the instruction */
  speakText(promptLine(c) || c.q);
}

function toggleHear() {
  if (!cur()) return;
  if (speakingNow) {
    stopSpeaking();
    return;
  }
  speakQuestion(cur());
}

let dlgTimers = [];
function playDialogue(dlg, lines) {
  if (!dlg?.length) return;
  stopRecPlayback();
  stopSpeaking();
  const els = lines?.length ? lines : $$(".dlg .dlg-line");
  let t = 200;
  dlg.slice(0, 6).forEach(([sp, txt], i) => {
    dlgTimers.push(setTimeout(() => {
      els[i]?.classList.add("spoken");
      if (canSpeak) {
        speechSynthesis.speak(utter(txt, { voice: sp === "A" ? voiceA : voiceB, pitch: sp === "A" ? 1 : 1.12 }));
      }
      dlgTimers.push(setTimeout(() => els[i]?.classList.remove("spoken"), 1800));
    }, t));
    t += Math.max(1900, (txt.length * 75) / store.set.rate);
  });
}

/* warm up speech on mobile (needs a gesture before autoplay) */
function warmUpSpeech() {
  if (!canSpeak) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

/* ══════════════════ RECORDING ═════════════════════════════ */

const rec = {
  mr: null,
  chunks: [],
  url: "",
  player: null,
  state: "idle",
  discard: false,
  t0: 0,
  tick: null,
};

async function toggleRecord() {
  if (rec.state === "idle") {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Recording needs a browser mic permission — try Chrome or Edge.");
      return;
    }
    rec.state = "starting";
    setRecUI("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      /* the screen changed while the permission prompt was open */
      if (rec.state !== "starting" || $("#screen-practice").hidden) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stopSpeaking();
      stopRecPlayback();
      rec.chunks = [];
      rec.discard = false;
      rec.mr = new MediaRecorder(stream);

      rec.mr.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
      rec.mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(rec.tick);
        rec.state = "idle";
        setRecUI("idle");

        if (rec.discard) { rec.chunks = []; return; }

        if (rec.url) URL.revokeObjectURL(rec.url);
        rec.url = URL.createObjectURL(new Blob(rec.chunks, { type: rec.mr.mimeType || "audio/webm" }));
        rec.chunks = [];
        rec.player = new Audio(rec.url);
        $("#rec-play").hidden = false;
      };

      rec.mr.start();
      rec.state = "live";
      setRecUI("live");
      rec.t0 = Date.now();
      rec.tick = setInterval(() => {
        $("#rec-label").textContent = `Stop · ${Math.round((Date.now() - rec.t0) / 1000)}s`;
      }, 250);
    } catch {
      rec.state = "idle";
      setRecUI("idle");
      toast("Mic blocked — allow the microphone to record yourself.");
    }
  } else if (rec.state === "live") {
    clearInterval(rec.tick);
    rec.state = "stopping";
    try { rec.mr.stop(); } catch { rec.state = "idle"; setRecUI("idle"); }
    setRecUI("idle");
  }
}

function setRecUI(state) {
  const b = $("#btn-rec");
  if (!b) return;
  b.classList.toggle("live", state === "live");
  $("#rec-label").textContent = state === "live" ? "Stop" : state === "starting" ? "Starting…" : "Record";
  b.setAttribute("aria-pressed", String(state === "live"));
  b.setAttribute("aria-busy", String(state === "starting"));
}

function discardRecording(hard = false) {
  rec.discard = true;
  clearInterval(rec.tick);

  if (rec.player) {
    try { rec.player.pause(); rec.player.currentTime = 0; } catch { /* ignore */ }
  }
  if (rec.mr && rec.state === "live") {
    try { rec.mr.stop(); } catch { /* ignore */ }
  }
  rec.state = "idle";
  setRecUI("idle");
  if (hard) {
    $("#rec-play").hidden = true;
    if (rec.url) { URL.revokeObjectURL(rec.url); rec.url = ""; }
    rec.player = null;
  }
}

/* ══════════════════ THEME & SETTINGS ══════════════════════ */

const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

function applyTheme() {
  const t = store.set.theme;
  const dark = t === "dark" || (t === "auto" && !!darkQuery?.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0D1412" : "#E9F1EB");
}

if (darkQuery) {
  if (typeof darkQuery.addEventListener === "function") darkQuery.addEventListener("change", applyTheme);
  else if (typeof darkQuery.addListener === "function") darkQuery.addListener(applyTheme);
}

function toggleTheme() {
  const dark = document.documentElement.classList.contains("dark");
  store.set.theme = dark ? "light" : "dark";
  save();
  applyTheme();
  syncSettingsUI();
}

function openDrawer(open) {
  $("#drawer").hidden = !open;
  $("#drawer-scrim").hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    syncSettingsUI();
    $("#btn-close-drawer").focus();
  } else if (!$("#screen-home").hidden) {
    $("#btn-settings").focus();
  } else if (!$("#screen-deck").hidden) {
    $("#btn-deck-settings").focus();
  }
}

function syncSettingsUI() {
  $("#set-tts").checked = !!store.set.tts;
  $("#set-cheat").checked = !!store.set.cheat;
  $("#set-rate").value = store.set.rate;
  $("#set-rate-n").textContent = `${Number(store.set.rate).toFixed(2).replace(/0$/, "")}×`;
  $("#set-theme").value = store.set.theme;
}

/* ══════════════════ WIRING ════════════════════════════════ */

function wire() {
  $("#btn-tricky").addEventListener("click", () => {
    const all = starIds().map((id) => byId.get(id)).filter(Boolean);
    let mode = modeOf();
    let cards = modeCards(all, mode);
    if (!cards.length) {
      mode = mode === "ask" ? "answer" : "ask";
      cards = modeCards(all, mode);
    }
    if (!cards.length) { toast("No tricky cards yet — star a card while practising."); return; }
    if (store.set.tts) warmUpSpeech();
    startSession(cards, "Tricky cards", null, mode);
  });

  $("#btn-deck-back").addEventListener("click", backToHome);
  $("#btn-deck-theme").addEventListener("click", toggleTheme);
  $("#btn-deck-settings").addEventListener("click", () => openDrawer(true));
  $("#btn-start").addEventListener("click", startFromDeck);

  /* grammar quiz */
  $("#btn-quiz")?.addEventListener("click", () => {
    if (!QUIZ_TOPICS.length) { toast("Quiz data is missing."); return; }
    if (location.hash === "#/quiz") {
      renderQuizTopics();
      show("quiz-home");
    } else {
      location.hash = "#/quiz";
    }
  });
  $("#btn-quiz-home-back").addEventListener("click", goHome);
  $("#btn-quiz-theme").addEventListener("click", toggleTheme);
  $("#btn-quiz-random").addEventListener("click", () => {
    if (!QUIZ_TOPICS.length) { toast("Quiz data is missing."); return; }
    if (location.hash === "#/quiz/random") startRandomQuiz(true);
    else {
      quizNavFromTopics = true;
      location.hash = "#/quiz/random";
    }
  });
  $("#quiz-search").addEventListener("input", (e) => {
    quizSearch = e.target.value;
    $("#btn-quiz-search-clear").hidden = !quizSearch;
    renderQuizTopics();
  });
  $("#btn-quiz-search-clear").addEventListener("click", () => {
    quizSearch = "";
    $("#quiz-search").value = "";
    $("#btn-quiz-search-clear").hidden = true;
    renderQuizTopics();
    $("#quiz-search").focus();
  });
  $("#btn-quiz-exit").addEventListener("click", quizToTopics);
  $("#btn-quiz-check").addEventListener("click", checkQuizAnswer);
  $("#btn-quiz-next").addEventListener("click", nextQuizQuestion);
  $("#btn-quiz-result-back").addEventListener("click", quizToTopics);
  $("#btn-quiz-retry").addEventListener("click", retryQuiz);
  $("#btn-quiz-other").addEventListener("click", quizToTopics);
  $("#btn-quiz-home").addEventListener("click", goHome);

  $$("#mode-picker .mode-card").forEach((btn) => btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const m = btn.dataset.mode;
    if (m === store.set.mode) return;
    store.set.mode = m;
    save();
    syncOptions();
  }));

  $("#btn-all-parts").addEventListener("click", () => setAllParts(true));
  $("#btn-no-parts").addEventListener("click", () => setAllParts(false));

  $("#parts-search").addEventListener("input", (e) => {
    partQuery = e.target.value;
    $("#btn-clear-search").hidden = !partQuery;
    renderParts();
    $("#parts-list").scrollTop = 0;
  });
  $("#btn-clear-search").addEventListener("click", () => {
    partQuery = "";
    $("#parts-search").value = "";
    $("#btn-clear-search").hidden = true;
    renderParts();
    $("#parts-search").focus();
  });

  $$("#seg-len button").forEach((b) => b.addEventListener("click", () => {
    store.set.len = b.dataset.v;
    save();
    syncOptions();
  }));
  $("#opt-shuffle").addEventListener("change", (e) => {
    store.set.shuffle = e.target.checked;
    save();
  });
  $("#opt-due").addEventListener("change", (e) => {
    store.set.due = e.target.checked;
    save();
  });

  $("#card").addEventListener("click", (e) => {
    if (e.target.closest("button, a, input, select, [data-say], .cheat-body")) return;
    flip();
  });
  $("#card").addEventListener("keydown", (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") { e.preventDefault(); flip(); }
  });

  $("#btn-flip").addEventListener("click", flip);
  $("#btn-hear").addEventListener("click", toggleHear);
  $("#back-scroll").addEventListener("scroll", updateBackScrollHint, { passive: true });
  window.addEventListener("resize", updateBackScrollHint);
  $("#btn-rec").addEventListener("click", toggleRecord);
  setRecUI("idle");
  $("#btn-play-mine").addEventListener("click", () => {
    if (!rec.player) { toast("Record an answer first."); return; }
    stopSpeaking();
    rec.player.currentTime = 0;
    rec.player.play().catch(() => toast("Could not play that recording."));
  });
  $("#btn-play-model").addEventListener("click", () => {
    const c = cur();
    if (!c) return;
    if (sess.mode === "ask") { speakText(c.q); return; }
    const e0 = Array.isArray(c.ex?.[0]) ? null : c.ex?.[0];
    speakText(modelLine(c) || (typeof e0 === "string" ? e0 : e0?.t) || c.dlg?.[0]?.[1] || c.q);
  });

  $("#btn-exit").addEventListener("click", backFromRound);
  $("#btn-star").addEventListener("click", toggleStar);
  $$(".rate").forEach((b) => b.addEventListener("click", () => rate(b.dataset.rate)));

  /* roleplay */
  $("#btn-role-exit").addEventListener("click", backFromRound);
  $("#btn-rp-reveal").addEventListener("click", rpPrimary);
  $("#btn-rp-replay").addEventListener("click", rpReplay);
  $("#btn-rp-all").addEventListener("click", playRoleAll);
  $$("[data-rp-rate]").forEach((b) => b.addEventListener("click", () => rateRole(b.dataset.rpRate)));
  $("#btn-role-star").addEventListener("click", () => {
    const c = rp.queue[rp.i];
    if (!c) return;
    starCard(c);
    updateRoleChrome();
  });

  /* shadowing */
  $("#btn-sh-exit").addEventListener("click", backFromRound);
  $("#btn-sh-play").addEventListener("click", () => shadowSpeak(false));
  $("#btn-sh-slow").addEventListener("click", () => shadowSpeak(true));
  $("#btn-sh-next").addEventListener("click", shadowNext);
  $("#btn-sh-star").addEventListener("click", () => {
    const c = sh.queue[sh.i];
    if (!c) return;
    starCard(c);
    updateShadowChrome();
  });
  $("#btn-sh-all").addEventListener("click", playShadowAll);
  $$("[data-sh-rate]").forEach((b) => b.addEventListener("click", () => rateShadow(b.dataset.shRate)));

  /* 1-minute talk */
  $("#btn-talk").addEventListener("click", () => { if (store.set.tts) warmUpSpeech(); openTalk(); });
  $("#btn-talk-exit").addEventListener("click", () => { stopTalkAudio(); goHome(); });
  $("#btn-tk-topic").addEventListener("click", newTalkTopic);
  $("#btn-tk-start").addEventListener("click", startTalk);
  $("#btn-tk-done").addEventListener("click", endTalk);
  $("#btn-tk-play").addEventListener("click", playTalkTake);
  $("#btn-tk-new").addEventListener("click", () => rateTalkReset());
  $$("[data-tk-rate]").forEach((b) => b.addEventListener("click", () => rateTalk(b.dataset.tkRate)));
  $("#btn-tk-how").addEventListener("click", () => toggleTalkHelp());
  $("#tk-openers").addEventListener("click", (e) => {
    const b = e.target.closest("[data-say]");
    if (b) tkSay(b.dataset.say);
  });
  $("#tk-phrases").addEventListener("click", (e) => {
    const b = e.target.closest("[data-say]");
    if (b) tkSay(b.dataset.say);
  });
  $("#btn-tk-model").addEventListener("click", () => tkSay(tkModelTalk(tk.topic)));

  $("#btn-sum-back").addEventListener("click", backFromRound);
  $("#btn-back-deck").addEventListener("click", backFromRound);
  $("#btn-home").addEventListener("click", goHome);
  $("#btn-again-cards").addEventListener("click", () => {
    const againCards = [...sess.againCards];
    if (!againCards.length) return;
    if (store.set.tts) warmUpSpeech();
    if (sess.mode === "role") return startRoleSession(buildQueue(againCards), "Again conversations", sess.bookId);
    if (sess.mode === "shadow") return startShadowSession(buildQueue(againCards), "Again cards", sess.bookId);
    startSession(againCards, "Again cards", sess.bookId, sess.mode);
  });

  $("#btn-settings").addEventListener("click", () => openDrawer(true));
  $("#btn-close-drawer").addEventListener("click", () => openDrawer(false));
  $("#drawer-scrim").addEventListener("click", () => openDrawer(false));
  $("#btn-theme").addEventListener("click", toggleTheme);

  $("#set-tts").addEventListener("change", (e) => {
    store.set.tts = e.target.checked;
    store.set.ttsManual = true;
    save();
    if (!store.set.tts) stopSpeaking();
  });
  $("#set-cheat").addEventListener("change", (e) => {
    store.set.cheat = e.target.checked;
    save();
    if (!$("#screen-practice").hidden) syncCheat();
  });
  $("#btn-cheat").addEventListener("click", () => {
    store.set.cheat = !store.set.cheat;
    save();
    syncCheat();
    syncSettingsUI();
  });
  $("#set-voice").addEventListener("change", (e) => {
    store.set.voiceURI = e.target.value;
    save();
    pickVoices();
  });
  $("#set-rate").addEventListener("input", (e) => {
    store.set.rate = +e.target.value;
    save();
    $("#set-rate-n").textContent = `${Number(store.set.rate).toFixed(2).replace(/0$/, "")}×`;
  });
  $("#set-theme").addEventListener("change", (e) => {
    store.set.theme = e.target.value;
    save();
    applyTheme();
  });
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Reset streak, progress and tricky cards? This cannot be undone.")) {
      try { localStorage.removeItem(LS); } catch { /* ignore */ }
      location.reload();
    }
  });

  $("#btn-streak").addEventListener("click", () => {
    toast(`${streak()}-day streak · ${store.total.toLocaleString()} cards spoken all-time`);
  });

  /* never let speech or a recording keep playing in the background */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAllAudio();
  });
  window.addEventListener("pagehide", stopAllAudio);
  window.addEventListener("beforeunload", stopAllAudio);

  document.addEventListener("keydown", (e) => {
    if (!$("#drawer").hidden) {
      if (e.key === "Escape") { e.preventDefault(); openDrawer(false); return; }
      if (e.key === "Tab") {
        const focusables = [...$("#drawer").querySelectorAll("button, select, input, [tabindex]:not([tabindex='-1'])")]
          .filter((el) => !el.disabled && el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (e.target.matches?.("input, select, textarea")) return;

    const practice = !$("#screen-practice").hidden;
    const deck = !$("#screen-deck").hidden;
    const summary = !$("#screen-summary").hidden;
    const quizScreen = !$("#screen-quiz").hidden;
    const quizTopics = !$("#screen-quiz-home").hidden;
    const quizResult = !$("#screen-quiz-result").hidden;
    const roleScreen = !$("#screen-role").hidden;
    const shadowScreen = !$("#screen-shadow").hidden;
    const talkScreen = !$("#screen-talk").hidden;
    const onButton = !!e.target.closest?.("button");

    if (quizScreen) {
      if (e.key === "Escape") { e.preventDefault(); quizToTopics(); return; }
      if (!quizState) return;
      const question = quizState.questions[quizState.i];
      if (!quizState.checked) {
        if (/^[1-9]$/.test(e.key)) {
          const index = Number(e.key) - 1;
          if (index < (quizState.view?.options.length || 0)) {
            e.preventDefault();
            selectQuizOption(index);
          }
        } else if (e.key === "Enter" && quizState.selected.size) {
          e.preventDefault();
          checkQuizAnswer();
        }
      } else if (e.key === "Enter" && !onButton) {
        e.preventDefault();
        nextQuizQuestion();
      }
      return;
    }
    if (quizTopics && e.key === "Escape") { e.preventDefault(); goHome(); return; }
    if (quizResult && e.key === "Escape") { e.preventDefault(); quizToTopics(); return; }

    if (roleScreen) {
      if (e.key === "Escape") { e.preventDefault(); backFromRound(); }
      else if (e.code === "Space" && !onButton) { e.preventDefault(); rpPrimary(); }
      else if (e.key === "r" || e.key === "R") rpReplay();
      else if (e.key === "s" || e.key === "S") $("#btn-role-star").click();
      else if (["1", "2", "3"].includes(e.key) && rp.done) rateRole(["again", "good", "easy"][+e.key - 1]);
    } else if (shadowScreen) {
      if (e.key === "Escape") { e.preventDefault(); backFromRound(); }
      else if (e.code === "Space" && !onButton) { e.preventDefault(); shadowSpeak(false); }
      else if (e.key === "Enter" && !onButton) { e.preventDefault(); shadowNext(); }
      else if (e.key === "s" || e.key === "S") $("#btn-sh-star").click();
      else if (["1", "2", "3"].includes(e.key) && !$("#sh-end").hidden) rateShadow(["again", "good", "easy"][+e.key - 1]);
    } else if (talkScreen) {
      if (e.key === "Escape") { e.preventDefault(); stopTalkAudio(); goHome(); }
      else if ((e.code === "Space" || e.key === "Enter") && !onButton && tk.phase === "ready") { e.preventDefault(); startTalk(); }
    } else if (practice) {
      if (e.code === "Space" && !onButton) { e.preventDefault(); flip(); }
      else if (e.key === "r" || e.key === "R") toggleHear();
      else if (e.key === "s" || e.key === "S") toggleStar();
      else if (["1", "2", "3"].includes(e.key) && flipped) rate(["again", "good", "easy"][+e.key - 1]);
      else if (e.key === "Escape") { e.preventDefault(); backFromRound(); }
    } else if (deck && e.key === "Escape") {
      e.preventDefault();
      backToHome();
    } else if (summary && e.key === "Escape") {
      e.preventDefault();
      backFromRound();
    }
  });
}

function starCard(c) {
  const i = store.star.indexOf(c.id);
  if (i >= 0) store.star.splice(i, 1);
  else store.star.push(c.id);
  save();
  toast(i < 0 ? "Added to tricky cards ★" : "Removed from tricky cards");
}

function toggleStar() {
  const c = cur();
  if (!c) return;
  starCard(c);
  const on = store.star.includes(c.id);
  $("#btn-star").classList.toggle("on", on);
  $("#btn-star").setAttribute("aria-pressed", String(on));
}

/* ── go ───────────────────────────────────────────────────── */
applyTheme();
wire();
route();

/* deep link: index.html?book=conv2&parts=0,2&len=10&go=1&flip=1 */
(() => {
  const q = new URLSearchParams(location.search);
  const b = BOOKS.find((x) => x.id === q.get("book"));
  if (!b || location.hash) return;

  try { history.replaceState(null, "", `#/deck/${b.id}`); } catch { /* ignore */ }
  openDeck(b);

  if (q.get("parts")) {
    const nums = q.get("parts").split(",").map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n < b.parts.length);
    if (nums.length) {
      selParts = new Set(nums);
      rememberSel();
      renderParts();
    }
  }
  const len = q.get("len");
  if (["0", "10", "20", "40"].includes(len)) {
    store.set.len = len;
    save();
    syncOptions();
  }

  if (q.get("go")) {
    setTimeout(() => {
      if (curBook !== b) return;
      startFromDeck();
      if (q.get("flip")) setTimeout(flip, 360);
    }, 80);
  }
})();

/* keep browser Back / Forward in sync with the deck page */
window.addEventListener("hashchange", route);
