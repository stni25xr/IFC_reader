import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { IFCROOT } from "web-ifc";

const state = {
  ifcModel: null,
  ifcArrayBuffer: null,
  ifcData: {},
  spatialIndex: {},
  modelID: null
};

const dom = {
  viewer: document.getElementById("viewer"),
  list: document.getElementById("element-list"),
  props: document.getElementById("property-view"),
  status: document.getElementById("status"),
  viewerInfo: document.getElementById("viewer-info"),
  resetBtn: document.getElementById("reset-btn"),
  exportBtn: document.getElementById("export-btn"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  fileButton: document.getElementById("file-button")
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, dom.viewer.clientWidth / dom.viewer.clientHeight, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const ifcLoader = new IFCLoader();
const wasmBasePath = `${import.meta.env.BASE_URL}wasm/`;
ifcLoader.ifcManager.setWasmPath(wasmBasePath, true);

const hoverMat = new THREE.MeshBasicMaterial({ color: 0x7bdff6, transparent: true, opacity: 0.35, depthTest: false });
const selectMat = new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.4, depthTest: false });

let lastHovered = null;
let lastSelected = null;

const initScene = () => {
  renderer.setSize(dom.viewer.clientWidth, dom.viewer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  dom.viewer.appendChild(renderer.domElement);

  camera.position.set(14, 10, 14);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(10, 20, 15);
  scene.add(dirLight);

  const grid = new THREE.GridHelper(60, 60, 0x7bdff6, 0x1f2346);
  grid.material.opacity = 0.2;
  grid.material.transparent = true;
  scene.add(grid);

  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();
};

const resize = () => {
  camera.aspect = dom.viewer.clientWidth / dom.viewer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(dom.viewer.clientWidth, dom.viewer.clientHeight);
};

window.addEventListener("resize", resize);

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const getSpatialIndex = async (modelID) => {
  const tree = await ifcLoader.ifcManager.getSpatialStructure(modelID);
  const index = {};
  const walk = (node, path) => {
    if (!node) return;
    const nextPath = [...path, node];
    if (node.expressID) {
      index[node.expressID] = nextPath.map((n) => ({
        expressID: n.expressID,
        type: n.type,
        name: n.name
      }));
    }
    (node.children || []).forEach((child) => walk(child, nextPath));
  };
  walk(tree, []);
  return index;
};

const extractIfcData = async (modelID) => {
  const ifcAPI = ifcLoader.ifcManager.ifcAPI;
  const ids = ifcAPI.GetLineIDsWithType(modelID, IFCROOT);
  const dataByGuid = {};

  for (let i = 0; i < ids.size(); i += 1) {
    const expressID = ids.get(i);
    const attrs = await ifcLoader.ifcManager.getItemProperties(modelID, expressID, true);
    const psets = await ifcLoader.ifcManager.getPropertySets(modelID, expressID, true);
    const qtos = await ifcLoader.ifcManager.getQuantities(modelID, expressID, true);
    const materials = await ifcLoader.ifcManager.getMaterialsProperties(modelID, expressID, true);
    const typeProps = await ifcLoader.ifcManager.getTypeProperties(modelID, expressID, true);
    const rawLine = ifcAPI.GetLine(modelID, expressID, true);

    const globalId = attrs?.GlobalId?.value || attrs?.GlobalId || `#${expressID}`;
    const ifcType = rawLine?.type || attrs?.type || rawLine?.constructor?.name;

    dataByGuid[globalId] = {
      expressID,
      ifcType,
      attributes: attrs || {},
      psets: psets || [],
      qtos: qtos || [],
      materials: materials || [],
      type: typeProps || {},
      relations: rawLine || {},
      spatial: state.spatialIndex[expressID] || []
    };
  }

  return dataByGuid;
};

const buildList = (data) => {
  dom.list.innerHTML = "";
  Object.entries(data).forEach(([globalId, item]) => {
    const row = document.createElement("div");
    row.className = "element-item";
    row.dataset.globalId = globalId;
    const label = item.attributes?.Name?.value || item.attributes?.Name || item.attributes?.ObjectType?.value || "(Namnlös)";
    row.innerHTML = `${label}<span class=\"tag\">${item.ifcType || "IFC"}</span><div class=\"hint\">${globalId}</div>`;
    row.addEventListener("click", () => selectByGlobalId(globalId));
    dom.list.appendChild(row);
  });
};

const highlightList = (globalId) => {
  dom.list.querySelectorAll(".element-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.globalId === globalId);
  });
};

const clearSubset = (customID) => {
  if (!state.modelID) return;
  ifcLoader.ifcManager.removeSubset(state.modelID, undefined, customID);
};

const setSubset = (expressID, material, customID) => {
  if (!state.modelID) return;
  ifcLoader.ifcManager.createSubset({ modelID: state.modelID, ids: [expressID], material, scene, removePrevious: true, customID });
};

const selectByGlobalId = (globalId) => {
  const data = state.ifcData[globalId];
  if (!data) return;
  lastSelected = data.expressID;
  setSubset(data.expressID, selectMat, "select");
  dom.props.textContent = JSON.stringify(data, null, 2);
  highlightList(globalId);
};

const handlePick = (event, isClick) => {
  if (!state.ifcModel) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(state.ifcModel, true);
  if (!hits.length) {
    if (!isClick) clearSubset("hover");
    return;
  }
  const hit = hits[0];
  const id = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
  if (!id) return;
  if (isClick) {
    lastSelected = id;
    setSubset(id, selectMat, "select");
    const match = Object.entries(state.ifcData).find(([, value]) => value.expressID === id);
    if (match) {
      const [globalId, data] = match;
      dom.props.textContent = JSON.stringify(data, null, 2);
      highlightList(globalId);
    }
  } else if (lastHovered !== id) {
    lastHovered = id;
    setSubset(id, hoverMat, "hover");
  }
};

renderer.domElement.addEventListener("mousemove", (event) => handlePick(event, false));
renderer.domElement.addEventListener("click", (event) => handlePick(event, true));

const resetCamera = () => {
  camera.position.set(14, 10, 14);
  controls.target.set(0, 0, 0);
  controls.update();
};

const readIfcFile = async (file) => {
  const buffer = await file.arrayBuffer();
  state.ifcArrayBuffer = buffer;
  dom.status.textContent = `Laddar ${file.name}...`;
  dom.viewerInfo.textContent = `Läser ${file.name}`;
  dom.exportBtn.disabled = true;

  if (state.ifcModel) {
    scene.remove(state.ifcModel);
    clearSubset("hover");
    clearSubset("select");
  }

  const model = await ifcLoader.parse(buffer);
  scene.add(model);
  state.ifcModel = model;
  state.modelID = model.modelID;
  state.spatialIndex = await getSpatialIndex(state.modelID);
  state.ifcData = await extractIfcData(state.modelID);

  buildList(state.ifcData);
  dom.status.textContent = `${Object.keys(state.ifcData).length} element med GlobalId laddade.`;
  dom.viewerInfo.textContent = `Modell laddad: ${file.name}`;
  dom.exportBtn.disabled = false;
  dom.props.textContent = "Välj ett element för att se alla IFC-parametrar.";
};

const setupDropzone = () => {
  dom.fileButton.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) readIfcFile(file);
  });

  dom.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.dropzone.classList.add("dragover");
  });
  dom.dropzone.addEventListener("dragleave", () => {
    dom.dropzone.classList.remove("dragover");
  });
  dom.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.dropzone.classList.remove("dragover");
    const file = event.dataTransfer.files?.[0];
    if (file) readIfcFile(file);
  });
};

const buildExportHtml = async () => {
  if (!state.ifcArrayBuffer) return null;

  const ifcBase64 = arrayBufferToBase64(state.ifcArrayBuffer);
  const wasmResponse = await fetch(`${wasmBasePath}web-ifc.wasm`);
  if (!wasmResponse.ok) throw new Error("Kunde inte läsa web-ifc.wasm. Kontrollera public/wasm/");
  const wasmBuffer = await wasmResponse.arrayBuffer();
  const wasmBase64 = arrayBufferToBase64(wasmBuffer);

  const bundleResponse = await fetch("/export-bundle.js");
  if (!bundleResponse.ok) throw new Error("Saknar export-bundle.js. Kör npm run build:export");
  const bundleCode = await bundleResponse.text();

  const dataJson = JSON.stringify(state.ifcData);

  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IFC Offline Viewer Export</title>
  <style>
    body { margin:0; font-family: Arial, sans-serif; height:100vh; display:grid; grid-template-columns: 280px 1fr 320px; background:#0f1226; color:#f5f7ff; }
    #viewer { position: relative; }
    #left, #right { padding:16px; overflow:auto; background:#171a34; }
    #list { display:flex; flex-direction:column; gap:8px; }
    .item { padding:8px; border-radius:8px; background:#1f2346; cursor:pointer; }
    .item.active { outline: 2px solid #7bdff6; }
    .tag { font-size:10px; color:#ffd36e; margin-left:6px; }
    #props { white-space: pre-wrap; font-size:12px; background:#0c0e1e; padding:10px; border-radius:8px; }
  </style>
</head>
<body>
  <aside id="left">
    <h3>Element</h3>
    <div id="list"></div>
  </aside>
  <main id="viewer"></main>
  <aside id="right">
    <h3>Parametrar</h3>
    <div id="props">Välj ett element.</div>
  </aside>

  <script>
    window.IFC_DATA = ${dataJson};
    window.IFC_BASE64 = "${ifcBase64}";
    window.IFC_WASM_BASE64 = "${wasmBase64}";
  </script>
  <script>
${bundleCode}
  </script>
  <script>
    IFC_EXPORT_APP.init({
      containerId: "viewer",
      listId: "list",
      propsId: "props",
      ifcBase64: window.IFC_BASE64,
      ifcData: window.IFC_DATA,
      wasmBase64: window.IFC_WASM_BASE64
    });
  </script>
</body>
</html>`;
};

const downloadHtml = async () => {
  try {
    dom.status.textContent = "Skapar export...";
    const html = await buildExportHtml();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ifc-offline-viewer.html";
    a.click();
    URL.revokeObjectURL(url);
    dom.status.textContent = "Export klar.";
  } catch (err) {
    dom.status.textContent = `Export misslyckades: ${err.message}`;
  }
};

initScene();
setupDropzone();

if (dom.resetBtn) dom.resetBtn.addEventListener("click", resetCamera);
if (dom.exportBtn) dom.exportBtn.addEventListener("click", downloadHtml);
