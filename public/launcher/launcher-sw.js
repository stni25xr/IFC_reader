const fileMap = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const { data } = event;
  if (!data || data.type !== "zip-files") return;
  fileMap.clear();
  for (const file of data.files || []) {
    fileMap.set(file.path, { data: file.data, type: file.type });
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.includes("/__ifc_zip__/")) return;
  const entry = fileMap.get(url.pathname);
  if (!entry) {
    event.respondWith(new Response("Not found", { status: 404 }));
    return;
  }
  event.respondWith(
    new Response(entry.data, {
      status: 200,
      headers: { "Content-Type": entry.type || "application/octet-stream" }
    })
  );
});
