// Packlobby service worker. Keeps the app shell on the phone so it opens fast and survives a weak connection.
// It never touches Firebase traffic: trips, logins and saves always go straight to the network.
var BUILD = "31e5554abc";
var CORE = "pl-core-" + BUILD, FONTS = "pl-fonts-1";
var SHELL = ["./", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
var FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CORE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CORE && k !== FONTS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error("slow")); }, ms); }); }

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Pages: network first (so a new version shows up straight away), saved copy when offline or very slow.
  if (req.mode === "navigate") {
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)]).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CORE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("./"); }).then(function (hit) { return hit || fetch(req); });
      })
    );
    return;
  }

  // Fonts: show the saved copy, refresh it in the background.
  if (FONT_HOSTS.indexOf(url.hostname) > -1) {
    e.respondWith(caches.open(FONTS).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }

  // Our own icons and manifest: saved copy first, refreshed in the background.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(CORE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
  }
  // Anything else (Firebase, Google sign-in, ...) is left alone.
});
