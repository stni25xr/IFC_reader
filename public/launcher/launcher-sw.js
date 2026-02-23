const fileMap = new Map();
const CACHE_NAME = "ifc-zip-cache-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const { data } = event;
  if (!data || data.type !== "zip-files") return;
  event.waitUntil(
    (async () => {
      fileMap.clear();
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      await Promise.all(keys.map((key) => cache.delete(key)));
      for (const file of data.files || []) {
        fileMap.set(file.path, { data: file.data, type: file.type });
        await cache.put(
          file.path,
          new Response(file.data, {
            status: 200,
            headers: { "Content-Type": file.type || "application/octet-stream" }
          })
        );
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const marker = "/__ifc_zip__/";
  const idx = url.pathname.indexOf(marker);
  if (idx === -1) return;
  const key = url.pathname.slice(idx);
  const entry = fileMap.get(key);
  if (entry) {
    event.respondWith(
      new Response(entry.data, {
        status: 200,
        headers: { "Content-Type": entry.type || "application/octet-stream" }
      })
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(key);
      if (cached) return cached;
      return new Response("Not found", { status: 404 });
    })()
  );
});
