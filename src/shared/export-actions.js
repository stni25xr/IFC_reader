import JSZip from "jszip";

export const openLauncher = () => {
  const base = import.meta.env.BASE_URL || "/";
  const url = `${base}launcher/launcher.html`;
  window.open(url, "_blank", "noopener");
};

export const createExportActions = ({ getModels, wasmBasePath, statusEl, exportBtn }) => {
  const setStatus = (message) => {
    if (statusEl) statusEl.textContent = message || "";
  };

  const buildExportZip = async () => {
    const models = getModels();
    if (!models.length) return null;

    const wasmResponse = await fetch(`${wasmBasePath}web-ifc.wasm`);
    if (!wasmResponse.ok) throw new Error("Kunde inte läsa web-ifc.wasm. Kontrollera public/wasm/");
    const wasmBuffer = await wasmResponse.arrayBuffer();

    const bundleResponse = await fetch(`${import.meta.env.BASE_URL}export-bundle.js`);
    if (!bundleResponse.ok) throw new Error("Saknar export-bundle.js. Kör npm run build:export");
    const bundleCode = await bundleResponse.text();

    const zip = new JSZip();
    zip.folder("wasm").file("web-ifc.wasm", wasmBuffer);

    const modelsFolder = zip.folder("models");
    const bundleModels = [];
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i];
      const safeName = model.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const modelPath = `models/${i}_${safeName}`;
      modelsFolder.file(`${i}_${safeName}`, model.ifcBuffer);
      bundleModels.push({
        filename: model.filename,
        ifcPath: modelPath,
        visible: model.visible !== false
      });
    }
    zip.file("bundle.json", JSON.stringify({ models: bundleModels }));

    const html = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IFC Offline Viewer Export</title>
  <style>
    body { margin:0; font-family: Arial, sans-serif; height:100vh; display:grid; grid-template-columns: 1fr 320px; background:#f2f2f2; color:#1d1f2b; }
    #viewer { position: relative; background:#f2f2f2; }
    #left { display:none; }
    #right { padding:16px; overflow:auto; background:#171a34; color:#f5f7ff; }
    #list { display:flex; flex-direction:column; gap:8px; }
    .item { padding:8px; border-radius:8px; background:#1f2346; cursor:pointer; }
    .item.active { outline: 2px solid #7bdff6; }
    .tag { font-size:10px; color:#ffd36e; margin-left:6px; }
    .tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px; }
    .tab { padding:6px 10px; font-size:12px; border-radius:6px; background:#e8ebf2; color:#1d1f2b; border:1px solid #d7dbe3; cursor:pointer; }
    .tab.active { background:#7bdff6; color:#081018; border-color:transparent; }
    #props { font-size:12px; background:#f8f9fb; color:#1d1f2b; padding:8px; border-radius:8px; border:1px solid #d7dbe3; }
    .prop-table { width:100%; border-collapse:collapse; font-size:12px; }
    .prop-table tr:nth-child(even) { background:#eef1f6; }
    .prop-table td { padding:6px 8px; vertical-align:top; border-bottom:1px solid #e1e5ec; word-break:break-word; }
    .prop-key { width:40%; color:#3f4661; font-weight:600; }
    #clip-panel {
      position: absolute;
      left: 16px;
      bottom: 16px;
      width: 260px;
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 8px 22px rgba(0,0,0,0.12);
      font-size: 12px;
      color: #333;
    }
    #clip-panel .clip-title { font-weight: 600; margin-bottom: 6px; }
    #clip-panel .clip-hint { font-size: 11px; color: #666; margin-bottom: 8px; }
    .clip-row { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: center; margin-bottom: 8px; }
    .clip-row input[type="range"] { width: 100%; }
    .clip-value { display: inline-block; font-size: 11px; color:#555; background:#f5f5f5; border:1px solid #e0e0e0; border-radius:4px; padding:1px 6px; margin-left:6px; }
    #clip-actions { display: flex; gap: 8px; }
    #clip-actions .btn { padding:6px 10px; border-radius:6px; border:1px solid #d0d0d0; background:#f5f5f5; cursor:pointer; }
    #clip-actions .btn:hover { background:#ededed; }
    #view-cube-canvas {
      position: absolute;
      right: 12px;
      top: 12px;
      width: 92px;
      height: 92px;
      pointer-events: auto;
      z-index: 10;
      border-radius: 10px;
      background: rgba(255,255,255,0.85);
      box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      border: 1px solid rgba(0,0,0,0.12);
    }
    #plan-panel {
      position: absolute;
      right: 12px;
      top: 120px;
      width: 240px;
      background: #ffffff;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 12px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.16);
      padding: 12px;
      z-index: 10;
      display: none;
      color: #1d1f2b;
      font-size: 12px;
    }
    #plan-panel h4 { margin: 0 0 8px; font-size: 13px; }
    #plan-panel label { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    #plan-panel select {
      width: 100%;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid #d7dbe3;
      background: #ffffff;
      font-size: 12px;
    }
    .mini-hint { font-size: 11px; color: #666; }
    #aps-ribbon {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 14px;
      box-shadow: 0 10px 26px rgba(0,0,0,0.16);
      display: flex;
      gap: 10px;
      padding: 10px 12px;
      z-index: 8;
    }
    .aps-btn {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.12);
      background: #ffffff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .aps-btn.active { outline: 2px solid #4a90e2; }
    .aps-btn svg { width: 20px; height: 20px; stroke: #1d1f2b; }
  </style>
</head>
<body>
  <main id="viewer">
    <div id="clip-panel">
      <div class="clip-title">Clip</div>
      <div class="clip-hint">Slide to clip the model in specific direction</div>
      <div class="clip-row"><div>Length X <span id="clip-x-value" class="clip-value">0 - 100</span></div><input id="clip-x-min" type="range" min="0" max="100" value="0"></div>
      <div class="clip-row"><div></div><input id="clip-x-max" type="range" min="0" max="100" value="100"></div>
      <div class="clip-row"><div>Length Z <span id="clip-z-value" class="clip-value">0 - 100</span></div><input id="clip-z-min" type="range" min="0" max="100" value="0"></div>
      <div class="clip-row"><div></div><input id="clip-z-max" type="range" min="0" max="100" value="100"></div>
      <div class="clip-row"><div>Length Y <span id="clip-y-value" class="clip-value">0 - 100</span></div><input id="clip-y-min" type="range" min="0" max="100" value="0"></div>
      <div class="clip-row"><div></div><input id="clip-y-max" type="range" min="0" max="100" value="100"></div>
      <div id="clip-actions">
        <button id="clip-unclip" class="btn" type="button">Unclip</button>
        <button id="clip-close" class="btn" type="button">Close</button>
      </div>
    </div>
    <canvas id="view-cube-canvas" width="120" height="120"></canvas>
    <div id="plan-panel">
      <h4>2D Plan View</h4>
      <label><input id="plan-enable" type="checkbox" /> Enable plan view</label>
      <div style="margin-bottom:8px;">
        <select id="plan-level">
          <option value="">Välj level</option>
        </select>
      </div>
      <div class="mini-hint">Snitt: 1.2 m över vald nivå</div>
    </div>
    <div id="aps-ribbon" aria-label="Viewer tools">
      <button id="tool-map" class="aps-btn" aria-label="Plan view">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8">
          <path d="M4 6l6-2 4 2 6-2v14l-6 2-4-2-6 2z" />
          <path d="M10 4v14M14 6v14" />
        </svg>
      </button>
      <button id="tool-clip" class="aps-btn" aria-label="Section/Clip">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8">
          <path d="M4 6h16M8 6v12M4 18h16" />
        </svg>
      </button>
      <button id="tool-camera" class="aps-btn" aria-label="Perspective / Orthographic">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8">
          <path d="M4 7h10l4 3v7H4z" />
          <path d="M8 10h2" />
        </svg>
      </button>
    </div>
  </main>
  <aside id="right">
    <h3>Parametrar</h3>
    <div id="property-tabs" class="tabs"></div>
    <div id="props">Välj ett element.</div>
  </aside>

  <script>
    window.IFC_BUNDLE_URL = "./bundle.json";
  </script>
  <script>
${bundleCode}
  </script>
  <script>
    IFC_EXPORT_APP.init({
      containerId: "viewer",
      listId: "list",
      propsId: "props",
      bundleUrl: window.IFC_BUNDLE_URL
    });
  </script>
</body>
</html>`;

    zip.file("viewer.html", html);
    return zip.generateAsync({ type: "blob" });
  };

  const downloadHtml = async () => {
    const models = getModels();
    if (!models.length) {
      setStatus("Ingen fil laddad.");
      return;
    }

    if (exportBtn) exportBtn.disabled = true;
    try {
      setStatus("Skapar export...");
      const zipBlob = await buildExportZip();
      if (!zipBlob) return;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ifc-offline-viewer.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Export klar.");
    } catch (err) {
      console.error("[export] fail", err);
      setStatus(err?.message || "Export misslyckades.");
    } finally {
      if (exportBtn) exportBtn.disabled = getModels().length === 0;
    }
  };

  return { downloadHtml };
};
