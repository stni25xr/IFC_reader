import * as THREE from "three";
import JSZip from "jszip";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";

const state = {
  models: [],
  activeModelId: null,
  selected: null
};

const dom = {
  viewer: document.getElementById("viewer"),
  list: document.getElementById("element-list"),
  props: document.getElementById("property-view"),
  propertyTabs: document.getElementById("property-tabs"),
  status: document.getElementById("status"),
  viewerInfo: document.getElementById("viewer-info"),
  resetBtn: document.getElementById("reset-btn"),
  exportBtn: document.getElementById("export-btn"),
  publishBtn: document.getElementById("publish-btn"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  fileButton: document.getElementById("file-button"),
  treePanel: document.getElementById("tree-panel"),
  modelList: document.getElementById("model-list"),
  activeModel: document.getElementById("active-model"),
  progressContainer: document.getElementById("ifc-progress-container"),
  progressBar: document.getElementById("ifc-progress-bar"),
  progressText: document.getElementById("ifc-progress-text"),
  clipXMin: document.getElementById("clip-x-min"),
  clipXMax: document.getElementById("clip-x-max"),
  clipYMin: document.getElementById("clip-y-min"),
  clipYMax: document.getElementById("clip-y-max"),
  clipZMin: document.getElementById("clip-z-min"),
  clipZMax: document.getElementById("clip-z-max"),
  clipUnclip: document.getElementById("clip-unclip"),
  clipClose: document.getElementById("clip-close"),
  clipXValue: document.getElementById("clip-x-value"),
  clipYValue: document.getElementById("clip-y-value"),
  clipZValue: document.getElementById("clip-z-value"),
  viewCubeCanvas: document.getElementById("view-cube-canvas"),
  toolWalk: document.getElementById("tool-walk"),
  toolMeasure: document.getElementById("tool-measure"),
  toolClip: document.getElementById("tool-clip"),
  toolFit: document.getElementById("tool-fit"),
  toolReset: document.getElementById("tool-reset"),
  toolSettings: document.getElementById("tool-settings"),
  settingsPanel: document.getElementById("aps-settings"),
  toggleGrid: document.getElementById("toggle-grid"),
  toggleEdges: document.getElementById("toggle-edges")
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, dom.viewer.clientWidth / dom.viewer.clientHeight, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const cubeRaycaster = new THREE.Raycaster();
const cubeMouse = new THREE.Vector2();

const cubeScene = new THREE.Scene();
const cubeCamera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
cubeCamera.position.set(0, 0, 3);
cubeCamera.lookAt(0, 0, 0);
const cubeRenderer = dom.viewCubeCanvas ? new THREE.WebGLRenderer({ canvas: dom.viewCubeCanvas, antialias: true, alpha: true }) : null;

let cubeMesh = null;
let cubeViewport = { x: 0, y: 0, size: 92 };
let cameraTween = null;
let cubeMaterials = [];
let cubeHoverFace = null;
let gridHelper = null;

const clipPlanes = {
  xMin: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
  xMax: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
  yMin: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  yMax: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
  zMin: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  zMax: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
};

const ifcLoader = new IFCLoader();
const wasmBasePath = `${import.meta.env.BASE_URL}wasm/`;
ifcLoader.ifcManager.setWasmPath(wasmBasePath, true);

const hoverMat = new THREE.MeshBasicMaterial({ color: 0x7bdff6, transparent: true, opacity: 0.35, depthTest: false });
const selectMat = new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.4, depthTest: false });

let lastHovered = null;
let lastSelected = null;
let activePropTab = "Summary";
let lastPropPayload = null;

const getModelById = (modelId) => state.models.find((m) => m.id === modelId);
const getActiveModel = () => getModelById(state.activeModelId) || state.models[0] || null;

const showProgress = () => {
  if (!dom.progressContainer || !dom.progressBar || !dom.progressText) return;
  dom.progressContainer.style.display = "block";
  dom.progressText.style.display = "block";
  updateProgress(0);
};

const updateProgress = (percent, label = "Laddar element") => {
  if (!dom.progressContainer || !dom.progressBar || !dom.progressText) return;
  const safe = Math.max(0, Math.min(100, percent));
  dom.progressBar.style.width = `${safe}%`;
  dom.progressText.textContent = `${label}… ${safe}%`;
};

const completeProgress = () => {
  if (!dom.progressContainer || !dom.progressBar || !dom.progressText) return;
  dom.progressBar.style.width = "100%";
  dom.progressText.textContent = "Uppladdning klar";
  setTimeout(() => {
    dom.progressContainer.style.display = "none";
    dom.progressText.style.display = "none";
  }, 1500);
};

const initScene = () => {
  renderer.setSize(dom.viewer.clientWidth, dom.viewer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0xf2f2f2, 1);
  renderer.localClippingEnabled = true;
  dom.viewer.appendChild(renderer.domElement);
  if (cubeRenderer && dom.viewCubeCanvas) {
    cubeRenderer.setPixelRatio(window.devicePixelRatio);
    cubeRenderer.setSize(dom.viewCubeCanvas.clientWidth, dom.viewCubeCanvas.clientHeight, false);
    cubeRenderer.setClearColor(0x000000, 0);
  }

  camera.position.set(14, 10, 14);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(10, 20, 15);
  scene.add(dirLight);

  gridHelper = new THREE.GridHelper(60, 60, 0xcccccc, 0xdddddd);
  gridHelper.material.opacity = 0.2;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  const createLabelMaterial = (label, shade = "#bcbcbc") => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, shade);
    gradient.addColorStop(1, "#9a9a9a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#9e9e9e";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size / 2, size / 2);
    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color("#ffffff") });
  };

  cubeMaterials = [
    createLabelMaterial("R", "#bdbdbd"),
    createLabelMaterial("L", "#b3b3b3"),
    createLabelMaterial("T", "#9e9e9e"),
    createLabelMaterial("B", "#b3b3b3"),
    createLabelMaterial("F", "#bdbdbd"),
    createLabelMaterial("Bk", "#a8a8a8")
  ];
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  cubeMesh = new THREE.Mesh(cubeGeo, cubeMaterials);
  cubeScene.add(cubeMesh);

  const animate = () => {
    controls.update();
    if (cameraTween) {
      const now = performance.now();
      const t = Math.min(1, (now - cameraTween.start) / cameraTween.duration);
      camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, t);
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, t);
      if (t >= 1) cameraTween = null;
    }

    renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);

    // View cube
    if (cubeMesh) {
      cubeMesh.quaternion.copy(camera.quaternion).invert();
      if (cubeRenderer && dom.viewCubeCanvas) {
        cubeRenderer.render(cubeScene, cubeCamera);
      }
    }
    requestAnimationFrame(animate);
  };
  animate();
};

const resize = () => {
  camera.aspect = dom.viewer.clientWidth / dom.viewer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(dom.viewer.clientWidth, dom.viewer.clientHeight);
  if (cubeRenderer && dom.viewCubeCanvas) {
    cubeRenderer.setSize(dom.viewCubeCanvas.clientWidth, dom.viewCubeCanvas.clientHeight, false);
  }
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

const extractIfcIndex = async (modelID, onProgress) => {
  const ifcAPI = ifcLoader.ifcManager.ifcAPI;
  const ids = ifcAPI.GetAllLines(modelID);
  const indexByGuid = {};
  const indexByExpressId = {};
  const total = ids.size();

  const safe = async (fn, fallback) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  for (let i = 0; i < total; i += 1) {
    const expressID = ids.get(i);
    const rawLine = await safe(() => ifcAPI.GetLine(modelID, expressID, true), null);
    const attrs = await safe(() => ifcLoader.ifcManager.getItemProperties(modelID, expressID, true), null);

    const globalId =
      attrs?.GlobalId?.value ||
      attrs?.GlobalId ||
      rawLine?.GlobalId?.value ||
      rawLine?.GlobalId ||
      `#${expressID}`;
    const ifcType = rawLine?.type || attrs?.type || rawLine?.constructor?.name;
    const name = attrs?.Name?.value || attrs?.Name || rawLine?.Name?.value || rawLine?.Name || attrs?.ObjectType?.value || "";

    if (String(globalId).startsWith("#")) {
      if (i % 400 === 0) {
        if (onProgress) onProgress(i + 1, total);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      continue;
    }

    indexByGuid[globalId] = {
      expressID,
      ifcType,
      name,
      attributes: attrs || {}
    };
    indexByExpressId[expressID] = globalId;

    if (i % 400 === 0) {
      if (onProgress) onProgress(i + 1, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { indexByGuid, indexByExpressId };
};

const getFullDataForExpressId = async (model, expressID, globalId) => {
  if (model.ifcDataFull[globalId]) return model.ifcDataFull[globalId];
  const ifcAPI = ifcLoader.ifcManager.ifcAPI;
  const safe = async (fn, fallback) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const rawLine = await safe(() => ifcAPI.GetLine(model.id, expressID, true), null);
  const attrs = await safe(() => ifcLoader.ifcManager.getItemProperties(model.id, expressID, true), null);
  const psets = await safe(() => ifcLoader.ifcManager.getPropertySets(model.id, expressID, true), []);
  const qtos = await safe(() => ifcLoader.ifcManager.getQuantities(model.id, expressID, true), []);
  const materials = await safe(() => ifcLoader.ifcManager.getMaterialsProperties(model.id, expressID, true), []);
  const typeProps = await safe(() => ifcLoader.ifcManager.getTypeProperties(model.id, expressID, true), {});

  const full = {
    expressID,
    ifcType: rawLine?.type || attrs?.type || rawLine?.constructor?.name,
    attributes: attrs || {},
    psets,
    qtos,
    materials,
    type: typeProps,
    relations: rawLine || {},
    spatial: model.spatialIndex[expressID] || []
  };
  model.ifcDataFull[globalId] = full;
  return full;
};

const extractAllFullData = async (model, onProgress) => {
  const entries = Object.entries(model.ifcIndex);
  const total = entries.length;
  const result = {};
  for (let i = 0; i < total; i += 1) {
    const [globalId, item] = entries[i];
    const data = await getFullDataForExpressId(model, item.expressID, globalId);
    result[globalId] = data;
    if (i % 100 === 0) {
      if (onProgress) onProgress(i + 1, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return result;
};

const buildList = (data) => {
  if (!dom.list) return;
  dom.list.innerHTML = "";
  Object.entries(data).forEach(([globalId, item]) => {
    const row = document.createElement("div");
    row.className = "element-item";
    row.dataset.globalId = globalId;
    const label = item.name || item.attributes?.Name?.value || item.attributes?.Name || item.attributes?.ObjectType?.value || "(Namnlös)";
    row.innerHTML = `${label}<span class=\"tag\">${item.ifcType || "IFC"}</span><div class=\"hint\">${globalId}</div>`;
    row.addEventListener("click", () => selectByGlobalId(globalId));
    dom.list.appendChild(row);
  });
};

const renderTreeNode = (node) => {
  if (!node) return null;
  const hasChildren = (node.children || []).length > 0;
  const label = `${node.type || "Node"}${node.name ? `: ${node.name}` : ""}`;
  const activeModel = getActiveModel();
  const globalId = node.expressID && activeModel ? activeModel.ifcIndexByExpressId[node.expressID] : null;

  if (!hasChildren) {
    const leaf = document.createElement("div");
    leaf.className = "tree-node";
    const span = document.createElement("span");
    span.className = "tree-label";
    span.textContent = label;
    span.addEventListener("click", () => {
      if (globalId) selectByGlobalId(globalId);
    });
    leaf.appendChild(span);
    return leaf;
  }

  const details = document.createElement("details");
  details.className = "tree-node";
  details.open = true;
  const summary = document.createElement("summary");
  summary.className = "tree-label";
  summary.textContent = label;
  summary.addEventListener("click", (event) => {
    event.stopPropagation();
    if (globalId) selectByGlobalId(globalId);
  });
  details.appendChild(summary);
  (node.children || []).forEach((child) => {
    const childNode = renderTreeNode(child);
    if (childNode) details.appendChild(childNode);
  });
  return details;
};

const renderTree = (tree) => {
  if (!dom.treePanel) return;
  dom.treePanel.innerHTML = "";
  const rootNode = renderTreeNode(tree);
  if (rootNode) dom.treePanel.appendChild(rootNode);
};

const highlightList = (globalId) => {
  if (!dom.list) return;
  dom.list.querySelectorAll(".element-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.globalId === globalId);
  });
};

const clearSubset = (modelID, customID) => {
  if (!modelID) return;
  ifcLoader.ifcManager.removeSubset(modelID, scene, customID);
};

const setSubset = (modelID, expressID, material, customID) => {
  if (!modelID) return;
  ifcLoader.ifcManager.createSubset({ modelID, ids: [expressID], material, scene, removePrevious: true, customID });
};

const clearSelection = () => {
  if (lastSelected?.modelID) clearSubset(lastSelected.modelID, "selection");
  lastSelected = null;
  dom.props.textContent = "Klicka på ett element för att se metadata.";
  highlightList(null);
};

const getExpressIdFromHit = (hit) => {
  let fromManager = null;
  try {
    fromManager = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
  } catch {
    fromManager = null;
  }
  if (fromManager) return fromManager;
  return hit.object.userData?.ifcId || hit.object.userData?.expressID || null;
};

const renderTable = (rows) => {
  const body = rows
    .map(([key, value]) => `<tr><td class="prop-key">${key}</td><td class="prop-value">${value}</td></tr>`)
    .join("");
  return `<table class="prop-table">${body}</table>`;
};

const formatValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("value" in value) return String(value.value ?? "");
    return JSON.stringify(value);
  }
  return String(value);
};

const buildPropertyTabs = (data, globalId) => {
  const attrs = data.attributes || {};
  const summaryRows = [
    ["GlobalId", globalId],
    ["IfcType", data.ifcType || ""],
    ["Name", formatValue(attrs.Name)],
    ["Description", formatValue(attrs.Description)],
    ["ObjectType", formatValue(attrs.ObjectType)],
    ["Tag", formatValue(attrs.Tag)],
    ["PredefinedType", formatValue(attrs.PredefinedType)]
  ].filter((row) => row[1]);

  const locationRows = (data.spatial || []).map((node) => [
    node.type || "Spatial",
    `${node.name || ""} (#${node.expressID || ""})`
  ]);

  const materialRows = (data.materials || []).flatMap((mat) =>
    Object.entries(mat || {}).map(([key, val]) => [`${mat?.type || "Material"}.${key}`, formatValue(val)])
  );

  const partOfRows = Object.entries(data.relations || {}).map(([key, val]) => [key, formatValue(val)]);

  const psetRows = (data.psets || []).flatMap((pset) => {
    const name = pset?.Name?.value || pset?.Name || pset?.type || "Pset";
    const props = (pset?.HasProperties || []).map((prop) => {
      const key = prop?.Name?.value || prop?.Name || "Property";
      return [
        `${name}.${key}`,
        formatValue(
          prop?.NominalValue ??
            prop?.NominalValue?.value ??
            prop?.Value ??
            prop?.Value?.value ??
            prop
        )
      ];
    });
    return props;
  });

  const qtoRows = (data.qtos || []).flatMap((qto) => {
    const name = qto?.Name?.value || qto?.Name || qto?.type || "Qto";
    const props = (qto?.Quantities || qto?.HasQuantities || []).map((prop) => {
      const key = prop?.Name?.value || prop?.Name || "Quantity";
      return [
        `${name}.${key}`,
        formatValue(
          prop?.LengthValue ??
            prop?.AreaValue ??
            prop?.VolumeValue ??
            prop?.CountValue ??
            prop?.WeightValue ??
            prop
        )
      ];
    });
    return props;
  });

  const typeRows = Object.entries(data.type || {}).map(([key, val]) => [key, formatValue(val)]);

  return {
    Summary: summaryRows,
    Location: locationRows,
    Material: materialRows,
    PartOf: partOfRows,
    Conflicts: [["Status", "Inga konflikter identifierade."]],
    Psets: psetRows,
    Qto: qtoRows,
    Type: typeRows
  };
};

const renderPropertyTabs = (tabs) => {
  if (!dom.propertyTabs) return;
  dom.propertyTabs.innerHTML = "";
  Object.keys(tabs).forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab${tab === activePropTab ? " active" : ""}`;
    btn.textContent = tab;
    btn.addEventListener("click", () => {
      activePropTab = tab;
      if (lastPropPayload) renderProperties(lastPropPayload.data, lastPropPayload.globalId);
    });
    dom.propertyTabs.appendChild(btn);
  });
};

const renderProperties = (data, globalId) => {
  const tabs = buildPropertyTabs(data, globalId);
  if (!tabs[activePropTab]) activePropTab = "Summary";
  renderPropertyTabs(tabs);
  const rows = tabs[activePropTab] || [];
  dom.props.innerHTML = rows.length ? renderTable(rows) : "Inga parametrar hittades.";
  lastPropPayload = { data, globalId };
};

const selectByGlobalId = async (globalId) => {
  const model = getActiveModel();
  if (!model) return;
  const indexItem = model.ifcIndex[globalId];
  if (!indexItem) return;
  if (lastSelected?.modelID) clearSubset(lastSelected.modelID, "selection");
  lastSelected = { modelID: model.id, expressID: indexItem.expressID };
  setSubset(model.id, indexItem.expressID, selectMat, "selection");
  highlightList(globalId);
  dom.props.textContent = "Laddar parametrar...";
  try {
    console.log("[meta] load", { globalId, expressID: indexItem.expressID, modelID: model.id });
    const data = await getFullDataForExpressId(model, indexItem.expressID, globalId);
    console.log("[meta] ok", { globalId, expressID: indexItem.expressID, modelID: model.id });
    renderProperties(data, globalId);
  } catch (err) {
    console.error("[meta] fail", err);
    dom.props.textContent = "Kunde inte läsa metadata.";
  }
};

const findModelFromObject = (object) => {
  let current = object;
  while (current) {
    if (current.userData && current.userData.modelID !== undefined) {
      return getModelById(current.userData.modelID);
    }
    current = current.parent;
  }
  return null;
};

const handlePick = (event, isClick) => {
  if (!state.models.length) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (isClick) console.log("[pick] click", { x: event.clientX, y: event.clientY });
  console.log("[pick] hits:", hits.length);
  if (!hits.length) {
    if (!isClick && lastHovered?.modelID) clearSubset(lastHovered.modelID, "hover");
    if (isClick) clearSelection();
    return;
  }
  let id = null;
  let hit = null;
  let hitModel = null;
  for (const candidate of hits) {
    const candidateModel = findModelFromObject(candidate.object);
    if (!candidateModel) continue;
    const candidateId = getExpressIdFromHit(candidate);
    if (candidateId) {
      id = candidateId;
      hit = candidate;
      hitModel = candidateModel;
      break;
    }
  }
  console.log("[pick] expressID:", id);
  if (!id || !hit || !hitModel) {
    if (!isClick && lastHovered?.modelID) clearSubset(lastHovered.modelID, "hover");
    if (isClick) clearSelection();
    return;
  }
  if (isClick) {
    if (lastSelected?.modelID) clearSubset(lastSelected.modelID, "selection");
    lastSelected = { modelID: hitModel.id, expressID: id };
    setSubset(hitModel.id, id, selectMat, "selection");
    const globalId = hitModel.ifcIndexByExpressId[id];
    if (!globalId) {
      dom.props.textContent = "Ingen GlobalId hittades för valt element.";
      return;
    }
    highlightList(globalId);
    dom.props.textContent = "Laddar parametrar...";
    getFullDataForExpressId(hitModel, id, globalId)
      .then((data) => renderProperties(data, globalId))
      .catch(() => {
        dom.props.textContent = "Kunde inte läsa metadata.";
      });
  } else if (!lastHovered || lastHovered.expressID !== id || lastHovered.modelID !== hitModel.id) {
    if (lastHovered?.modelID) clearSubset(lastHovered.modelID, "hover");
    lastHovered = { modelID: hitModel.id, expressID: id };
    setSubset(hitModel.id, id, hoverMat, "hover");
  }
};

renderer.domElement.style.pointerEvents = "auto";
renderer.domElement.addEventListener("pointermove", (event) => handlePick(event, false));
renderer.domElement.addEventListener("pointerdown", (event) => handlePick(event, true));

const resetCamera = () => {
  const model = getActiveModel();
  if (model?.center && model?.radius) {
    const center = model.center;
    const distance = model.radius * 2.2;
    camera.position.set(center.x + distance, center.y + distance, center.z + distance);
    controls.target.copy(center);
  } else {
    camera.position.set(14, 10, 14);
    controls.target.set(0, 0, 0);
  }
  controls.update();
  clearSelection();
};

const fitToView = () => {
  const model = getActiveModel();
  if (!model?.center || !model?.radius) return;
  const center = model.center;
  const distance = model.radius * 2.2;
  camera.position.set(center.x + distance, center.y + distance, center.z + distance);
  controls.target.copy(center);
  controls.update();
};

const updateClipPlanes = () => {
  const model = getActiveModel();
  if (!model?.box) return;
  const min = model.box.min;
  const max = model.box.max;
  let xMinT = (Number(dom.clipXMin?.value || 0) || 0) / 100;
  let xMaxT = (Number(dom.clipXMax?.value || 100) || 100) / 100;
  let yMinT = (Number(dom.clipYMin?.value || 0) || 0) / 100;
  let yMaxT = (Number(dom.clipYMax?.value || 100) || 100) / 100;
  let zMinT = (Number(dom.clipZMin?.value || 0) || 0) / 100;
  let zMaxT = (Number(dom.clipZMax?.value || 100) || 100) / 100;

  if (xMinT > xMaxT) [xMinT, xMaxT] = [xMaxT, xMinT];
  if (yMinT > yMaxT) [yMinT, yMaxT] = [yMaxT, yMinT];
  if (zMinT > zMaxT) [zMinT, zMaxT] = [zMaxT, zMinT];

  const eps = 0.001;
  if (xMaxT - xMinT < eps) xMaxT = Math.min(1, xMinT + eps);
  if (yMaxT - yMinT < eps) yMaxT = Math.min(1, yMinT + eps);
  if (zMaxT - zMinT < eps) zMaxT = Math.min(1, zMinT + eps);

  const xMin = min.x + (max.x - min.x) * xMinT;
  const xMax = min.x + (max.x - min.x) * xMaxT;
  // Treat Z as height (up). Use Z for Length Z sliders, Y for Length Y.
  const yMin = min.y + (max.y - min.y) * yMinT;
  const yMax = min.y + (max.y - min.y) * yMaxT;
  const zMin = min.z + (max.z - min.z) * zMinT;
  const zMax = min.z + (max.z - min.z) * zMaxT;

  clipPlanes.xMin.constant = -xMin;
  clipPlanes.xMax.constant = xMax;
  clipPlanes.yMin.constant = -yMin;
  clipPlanes.yMax.constant = yMax;
  clipPlanes.zMin.constant = -zMin;
  clipPlanes.zMax.constant = zMax;

  const anyClip = xMinT > 0 || xMaxT < 1 || yMinT > 0 || yMaxT < 1 || zMinT > 0 || zMaxT < 1;
  renderer.clippingPlanes = anyClip
    ? [
        clipPlanes.xMin,
        clipPlanes.xMax,
        clipPlanes.yMin,
        clipPlanes.yMax,
        clipPlanes.zMin,
        clipPlanes.zMax
      ]
    : [];

  if (dom.clipXValue) dom.clipXValue.textContent = `${Math.round(xMin)} - ${Math.round(xMax)}`;
  if (dom.clipYValue) dom.clipYValue.textContent = `${Math.round(yMin)} - ${Math.round(yMax)}`;
  if (dom.clipZValue) dom.clipZValue.textContent = `${Math.round(zMin)} - ${Math.round(zMax)}`;
};

const unclipAll = () => {
  if (dom.clipXMin) dom.clipXMin.value = "0";
  if (dom.clipXMax) dom.clipXMax.value = "100";
  if (dom.clipYMin) dom.clipYMin.value = "0";
  if (dom.clipYMax) dom.clipYMax.value = "100";
  if (dom.clipZMin) dom.clipZMin.value = "0";
  if (dom.clipZMax) dom.clipZMax.value = "100";
  renderer.clippingPlanes = [];
  if (dom.clipXValue) dom.clipXValue.textContent = "0 - 100";
  if (dom.clipYValue) dom.clipYValue.textContent = "0 - 100";
  if (dom.clipZValue) dom.clipZValue.textContent = "0 - 100";
};

const readIfcFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const ifcBase64 = arrayBufferToBase64(buffer);
  dom.status.textContent = `Laddar ${file.name}...`;
  dom.viewerInfo.textContent = `Läser ${file.name}`;
  dom.exportBtn.disabled = true;

  const model = await ifcLoader.parse(buffer);
  model.userData.modelID = model.modelID;
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const spatialTree = await ifcLoader.ifcManager.getSpatialStructure(model.modelID);
  const spatialIndex = await getSpatialIndex(model.modelID);
  showProgress();
  const indexResult = await extractIfcIndex(model.modelID, (done, total) => {
    const percent = Math.round((done / total) * 100);
    dom.status.textContent = `Indexerar IFC... ${done}/${total}`;
    updateProgress(percent, "Laddar element");
  });

  const modelEntry = {
    id: model.modelID,
    filename: file.name,
    ifcBase64,
    ifcBuffer: buffer,
    object3D: model,
    box,
    center,
    radius: Math.max(size.x, size.y, size.z) * 0.5 || 10,
    spatialTree,
    spatialIndex,
    ifcIndex: indexResult.indexByGuid,
    ifcIndexByExpressId: indexResult.indexByExpressId,
    ifcDataFull: {},
    visible: true
  };
  state.models.push(modelEntry);
  if (!state.activeModelId) state.activeModelId = modelEntry.id;

  renderModelList();
  if (state.activeModelId === modelEntry.id) {
    renderTree(modelEntry.spatialTree);
    buildList(modelEntry.ifcIndex);
    resetCamera();
  }

  dom.status.textContent = "";
  dom.viewerInfo.textContent = `Modell laddad: ${file.name}`;
  dom.exportBtn.disabled = false;
  dom.props.textContent = "Välj ett element för att se alla IFC-parametrar.";
  if (dom.propertyTabs) dom.propertyTabs.innerHTML = "";
  completeProgress();
  unclipAll();
};

const loadIfcFiles = async (files) => {
  const list = Array.from(files || []);
  for (const file of list) {
    await readIfcFile(file);
  }
};

const renderModelList = () => {
  if (!dom.modelList || !dom.activeModel) return;
  dom.modelList.innerHTML = "";
  dom.activeModel.innerHTML = "";
  if (!state.models.length) {
    dom.modelList.innerHTML = "<div class=\"hint\">Inga modeller ännu.</div>";
    return;
  }
  state.models.forEach((model) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginBottom = "6px";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = model.visible !== false;
    checkbox.addEventListener("change", () => {
      model.visible = checkbox.checked;
      if (model.object3D) model.object3D.visible = model.visible;
      if (!model.visible && lastSelected?.modelID === model.id) clearSelection();
    });
    const label = document.createElement("div");
    const count = Object.keys(model.ifcIndex || {}).length;
    label.textContent = `${model.filename} (${count})`;
    row.appendChild(checkbox);
    row.appendChild(label);
    dom.modelList.appendChild(row);

    const opt = document.createElement("option");
    opt.value = model.id;
    opt.textContent = model.filename;
    if (state.activeModelId === model.id) opt.selected = true;
    dom.activeModel.appendChild(opt);
  });
  dom.activeModel.onchange = () => {
    state.activeModelId = Number(dom.activeModel.value);
    const active = getActiveModel();
    if (active) {
      renderTree(active.spatialTree);
      buildList(active.ifcIndex);
      resetCamera();
    }
  };
};

const setupClipUI = () => {
  const onInput = () => updateClipPlanes();
  dom.clipXMin?.addEventListener("input", onInput);
  dom.clipXMax?.addEventListener("input", onInput);
  dom.clipYMin?.addEventListener("input", onInput);
  dom.clipYMax?.addEventListener("input", onInput);
  dom.clipZMin?.addEventListener("input", onInput);
  dom.clipZMax?.addEventListener("input", onInput);
  dom.clipUnclip?.addEventListener("click", () => {
    unclipAll();
  });
  dom.clipClose?.addEventListener("click", () => {
    const panel = document.getElementById("clip-panel");
    if (panel) panel.style.display = "none";
  });
  dom.toolClip?.addEventListener("click", () => {
    const panel = document.getElementById("clip-panel");
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    dom.toolClip.classList.toggle("active");
  });
};

const setupDropzone = () => {
  dom.fileButton.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", (event) => {
    const files = event.target.files;
    if (files?.length) loadIfcFiles(files);
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
    const files = event.dataTransfer.files;
    if (files?.length) loadIfcFiles(files);
  });
};

const buildExportZip = async () => {
  if (!state.models.length) return null;

  const activeModel = getActiveModel();
  if (!activeModel) return null;

  const wasmResponse = await fetch(`${wasmBasePath}web-ifc.wasm`);
  if (!wasmResponse.ok) throw new Error("Kunde inte läsa web-ifc.wasm. Kontrollera public/wasm/");
  const wasmBuffer = await wasmResponse.arrayBuffer();

  const bundleResponse = await fetch(`${import.meta.env.BASE_URL}export-bundle.js`);
  if (!bundleResponse.ok) throw new Error("Saknar export-bundle.js. Kör npm run build:export");
  const bundleCode = await bundleResponse.text();

  const zip = new JSZip();
  zip.folder("wasm").file("web-ifc.wasm", wasmBuffer);

  const modelsFolder = zip.folder("models");
  const safeName = activeModel.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const modelPath = `models/0_${safeName}`;
  modelsFolder.file(`0_${safeName}`, activeModel.ifcBuffer);
  zip.file(
    "bundle.json",
    JSON.stringify({
      models: [
        {
          filename: activeModel.filename,
          ifcPath: modelPath,
          visible: true
        }
      ]
    })
  );

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
    <div id="aps-ribbon" aria-label="Viewer tools">
      <button id="tool-clip" class="aps-btn" aria-label="Section/Clip">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8">
          <path d="M4 6h16M8 6v12M4 18h16" />
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
  try {
    if (state.models.length > 1) {
      dom.status.textContent = "Export stödjer en modell. Använder aktiv modell.";
    } else {
      dom.status.textContent = "Skapar export...";
    }
    const blob = await buildExportZip();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ifc-offline-viewer.zip";
    a.click();
    URL.revokeObjectURL(url);
    dom.status.textContent = "Export klar.";
  } catch (err) {
    dom.status.textContent = `Export misslyckades: ${err.message}`;
  }
};

initScene();
setupDropzone();
setupClipUI();
if (dom.toolWalk) {
  dom.toolWalk.addEventListener("click", () => {
    dom.toolWalk.classList.toggle("active");
    console.log("[tool] walk toggle");
  });
}
if (dom.toolMeasure) {
  dom.toolMeasure.addEventListener("click", () => {
    dom.toolMeasure.classList.toggle("active");
    console.log("[tool] measure toggle");
  });
}
if (dom.toolFit) dom.toolFit.addEventListener("click", fitToView);
if (dom.toolReset) dom.toolReset.addEventListener("click", resetCamera);
if (dom.toolSettings) {
  dom.toolSettings.addEventListener("click", () => {
    if (!dom.settingsPanel) return;
    dom.settingsPanel.style.display = dom.settingsPanel.style.display === "none" ? "block" : "none";
  });
}
if (dom.toggleGrid) {
  dom.toggleGrid.addEventListener("change", (event) => {
    if (gridHelper) gridHelper.visible = event.target.checked;
  });
}
if (dom.toggleEdges) {
  dom.toggleEdges.addEventListener("change", () => {
    console.log("[tool] edges toggle (placeholder)");
  });
}
if (cubeRenderer && dom.viewCubeCanvas) {
  dom.viewCubeCanvas.addEventListener("pointermove", (event) => {
    if (!cubeMesh) return;
    const rect = dom.viewCubeCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    cubeMouse.set(x, y);
    cubeRaycaster.setFromCamera(cubeMouse, cubeCamera);
    const cubeHits = cubeRaycaster.intersectObject(cubeMesh, false);
    const faceIndex = cubeHits.length ? Math.floor(cubeHits[0].faceIndex / 2) : null;
    if (faceIndex !== cubeHoverFace) {
      cubeHoverFace = faceIndex;
    cubeMaterials.forEach((mat, idx) => {
      mat.color.set(idx === faceIndex ? "#a9c7ff" : "#ffffff");
    });
    }
  });
  dom.viewCubeCanvas.addEventListener("pointerleave", () => {
    cubeHoverFace = null;
    cubeMaterials.forEach((mat) => mat.color.set("#ffffff"));
  });
  dom.viewCubeCanvas.addEventListener("pointerdown", (event) => {
    if (!cubeMesh || !state.modelCenter || !state.modelRadius) return;
    const rect = dom.viewCubeCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    cubeMouse.set(x, y);
    cubeRaycaster.setFromCamera(cubeMouse, cubeCamera);
    const cubeHits = cubeRaycaster.intersectObject(cubeMesh, false);
    if (!cubeHits.length) return;
    const hit = cubeHits[0];
    const local = cubeMesh.worldToLocal(hit.point.clone());
    const ax = Math.abs(local.x);
    const ay = Math.abs(local.y);
    const az = Math.abs(local.z);
    const edgeThreshold = 0.42;
    const cornerThreshold = 0.42;
    const dir = new THREE.Vector3(
      Math.abs(local.x) > cornerThreshold ? Math.sign(local.x) : 0,
      Math.abs(local.y) > cornerThreshold ? Math.sign(local.y) : 0,
      Math.abs(local.z) > cornerThreshold ? Math.sign(local.z) : 0
    );

    if (dir.length() === 0) {
      const faceIndex = hit.faceIndex;
      const faceMap = ["right", "left", "top", "bottom", "front", "back"];
      const face = faceMap[Math.floor(faceIndex / 2)];
      const dirMap = {
        front: new THREE.Vector3(0, 0, 1),
        back: new THREE.Vector3(0, 0, -1),
        right: new THREE.Vector3(1, 0, 0),
        left: new THREE.Vector3(-1, 0, 0),
        top: new THREE.Vector3(0, 1, 0),
        bottom: new THREE.Vector3(0, -1, 0)
      };
      dir.copy(dirMap[face] || new THREE.Vector3(1, 1, 1).normalize());
    } else {
      // If near edge, combine two axes; near corner, combine three.
      dir.normalize();
    }
    const center = state.modelCenter;
    const distance = state.modelRadius * 2.2;
    cameraTween = {
      start: performance.now(),
      duration: 450,
      fromPos: camera.position.clone(),
      toPos: center.clone().add(dir.multiplyScalar(distance)),
      fromTarget: controls.target.clone(),
      toTarget: center.clone()
    };
  });
}

if (dom.resetBtn) dom.resetBtn.addEventListener("click", resetCamera);
if (dom.exportBtn) dom.exportBtn.addEventListener("click", downloadHtml);
if (dom.publishBtn) {
  const modal = document.getElementById("publish-modal");
  const cmd = document.getElementById("publish-command");
  const closeBtn = document.getElementById("publish-close");
  const copyBtn = document.getElementById("publish-copy");
  dom.publishBtn.addEventListener("click", () => {
    if (modal) modal.style.display = "flex";
  });
  closeBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });
  copyBtn?.addEventListener("click", async () => {
    if (!cmd?.textContent) return;
    try {
      await navigator.clipboard.writeText(cmd.textContent);
      copyBtn.textContent = "Kopierad!";
      setTimeout(() => (copyBtn.textContent = "Kopiera"), 1200);
    } catch {
      // ignore
    }
  });
}
