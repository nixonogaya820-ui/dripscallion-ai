
const CACHE_NAME = "dripscallion-ai-v1";

const APP_FILES = [
  "/",
  "/manifest.json",
  "/icon-192%20(1).png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("dripscallion-ai-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache AI requests, login requests or other API calls.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);

        if (response.ok) {
          await cache.put("/", response.clone());
        }

        return response;
      } catch {
        return await cache.match("/") ||
          new Response("DRIPSCALLION AI is offline. Reconnect to continue.", {
            status: 503,
            headers: { "Content-Type": "text/plain" }
          });
      }
    }

    const cached = await cache.match(request);

    if (cached) {
      fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response);
        })
        .catch(() => {});

      return cached;
    }

    try {
      const response = await fetch(request);

      if (response.ok) {
        await cache.put(request, response.clone());
      }

      return response;
    } catch {
      return new Response("Resource unavailable offline.", {
        status: 503
      });
    }
  })());
});
