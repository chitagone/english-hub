/* English Hub service worker — offline app shell.
   Bump CACHE_VERSION whenever app files change to force a refresh. */
const CACHE_VERSION = "hub-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon.svg",
  "dictation/index.html",
  "dictation/style.css?v=9",
  "dictation/app.js?v=14",
  "dictation/data.js?v=3",
  "speaking-practice/index.html",
  "speaking-practice/style.css?v=12",
  "speaking-practice/app.js?v=14",
  "speaking-practice/data.js",
  "speaking-practice/quiz-data.js?v=5",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => Promise.allSettled(APP_SHELL.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // fonts etc: network only

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
