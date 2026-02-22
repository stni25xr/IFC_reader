(() => {
  const drop = document.getElementById("drop");
  const fileInput = document.getElementById("file");
  const pickBtn = document.getElementById("pick");
  const status = document.getElementById("status");

  const setStatus = (msg) => {
    status.textContent = msg || "";
  };

  const getBasePath = () => {
    // For GitHub Pages: /{user}.github.io/{repo}/launcher/
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}/`;
    return "/";
  };

  const ensureServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service Worker stöds inte i din webbläsare.");
    const base = getBasePath();
    const swUrl = `${base}launcher/launcher-sw.js`;
    const reg = await navigator.serviceWorker.register(swUrl, { scope: base });
    await navigator.serviceWorker.ready;
    return reg;
  };

  const inferType = (name) => {
    const lower = name.toLowerCase();
    if (lower.endsWith(".html")) return "text/html";
    if (lower.endsWith(".js")) return "text/javascript";
    if (lower.endsWith(".css")) return "text/css";
    if (lower.endsWith(".json")) return "application/json";
    if (lower.endsWith(".wasm")) return "application/wasm";
    if (lower.endsWith(".ifc")) return "application/octet-stream";
    return "application/octet-stream";
  };

  const handleZip = async (file) => {
    try {
      setStatus("Läser ZIP...");
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files);
      const base = getBasePath();
      const prefix = "__ifc_zip__/";
      const files = [];

      for (const entry of entries) {
        if (entry.dir) continue;
        const data = await entry.async("arraybuffer");
        const path = `/${prefix}${entry.name}`.replace(/\/+/g, "/");
        files.push({ path, data, type: inferType(entry.name) });
      }

      const reg = await ensureServiceWorker();
      if (!reg.active) throw new Error("Service worker är inte aktiv.");

      reg.active.postMessage({ type: "zip-files", files });
      setStatus("Startar viewer...");

      const target = `${base}${prefix}viewer.html`;
      window.location.href = target;
    } catch (err) {
      console.error(err);
      setStatus(`Kunde inte läsa ZIP: ${err.message}`);
    }
  };

  pickBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleZip(file);
  });

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("dragover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    const file = e.dataTransfer.files?.[0];
    if (file) handleZip(file);
  });
})();
