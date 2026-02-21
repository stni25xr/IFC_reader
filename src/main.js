import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";

const state = {
  ifcModel: null,
  ifcArrayBuffer: null,
  ifcIndex: {},
  ifcIndexByExpressId: {},
  ifcDataFull: {},
  spatialIndex: {},
  modelID: null,
  modelBox: null,
  modelCenter: null,
  modelRadius: null
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
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  fileButton: document.getElementById("file-button"),
  treePanel: document.getElementById("tree-panel"),
  progressContainer: document.getElementById("ifc-progress-container"),
  progressBar: document.getElementById("ifc-progress-bar"),
  progressText: document.getElementById("ifc-progress-text"),
  clipXMin: document.getElementById("clip-x-min"),
  clipXMax: document.getElementById("clip-x-max"),
  clipYMin: document.getElementById("clip-y-min"),
  clipYMax: document.getElementById("clip-y-max"),
  clipUnclip: document.getElementById("clip-unclip"),
  clipClose: document.getElementById("clip-close")
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

let cubeMesh = null;
let cubeViewport = { x: 0, y: 0, size: 100 };
let cameraTween = null;
let cubeMaterials = [];
let cubeHoverFace = null;

const clipPlanes = {
  xMin: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
  xMax: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
  yMin: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  yMax: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
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

  camera.position.set(14, 10, 14);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(10, 20, 15);
  scene.add(dirLight);

  const grid = new THREE.GridHelper(60, 60, 0xcccccc, 0xdddddd);
  grid.material.opacity = 0.2;
  grid.material.transparent = true;
  scene.add(grid);

  const createLabelMaterial = (label) => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#cfcfcf";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, size, size);
    ctx.fillStyle = "#333333";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size / 2, size / 2);
    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color("#ffffff") });
  };

  cubeMaterials = [
    createLabelMaterial("RIGHT"),
    createLabelMaterial("LEFT"),
    createLabelMaterial("TOP"),
    createLabelMaterial("BOTTOM"),
    createLabelMaterial("FRONT"),
    createLabelMaterial("BACK")
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
      const size = 96 * window.devicePixelRatio;
      const margin = 16 * window.devicePixelRatio;
      const w = renderer.domElement.width;
      const h = renderer.domElement.height;
      cubeViewport = { x: w - size - margin, y: margin, size };
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(cubeViewport.x, cubeViewport.y, cubeViewport.size, cubeViewport.size);
      renderer.setViewport(cubeViewport.x, cubeViewport.y, cubeViewport.size, cubeViewport.size);
      renderer.render(cubeScene, cubeCamera);
      renderer.setScissorTest(false);
    }
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

const getFullDataForExpressId = async (expressID, globalId) => {
  if (state.ifcDataFull[globalId]) return state.ifcDataFull[globalId];
  const ifcAPI = ifcLoader.ifcManager.ifcAPI;
  const safe = async (fn, fallback) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const rawLine = await safe(() => ifcAPI.GetLine(state.modelID, expressID, true), null);
  const attrs = await safe(() => ifcLoader.ifcManager.getItemProperties(state.modelID, expressID, true), null);
  const psets = await safe(() => ifcLoader.ifcManager.getPropertySets(state.modelID, expressID, true), []);
  const qtos = await safe(() => ifcLoader.ifcManager.getQuantities(state.modelID, expressID, true), []);
  const materials = await safe(() => ifcLoader.ifcManager.getMaterialsProperties(state.modelID, expressID, true), []);
  const typeProps = await safe(() => ifcLoader.ifcManager.getTypeProperties(state.modelID, expressID, true), {});

  const full = {
    expressID,
    ifcType: rawLine?.type || attrs?.type || rawLine?.constructor?.name,
    attributes: attrs || {},
    psets,
    qtos,
    materials,
    type: typeProps,
    relations: rawLine || {},
    spatial: state.spatialIndex[expressID] || []
  };
  state.ifcDataFull[globalId] = full;
  return full;
};

const extractAllFullData = async (onProgress) => {
  const entries = Object.entries(state.ifcIndex);
  const total = entries.length;
  const result = {};
  for (let i = 0; i < total; i += 1) {
    const [globalId, item] = entries[i];
    const data = await getFullDataForExpressId(item.expressID, globalId);
    result[globalId] = data;
    if (i % 100 === 0) {
      if (onProgress) onProgress(i + 1, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return result;
};

const buildList = (data) => {
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
  const globalId = node.expressID ? state.ifcIndexByExpressId[node.expressID] : null;

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
  dom.list.querySelectorAll(".element-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.globalId === globalId);
  });
};

const clearSubset = (customID) => {
  if (!state.modelID) return;
  ifcLoader.ifcManager.removeSubset(state.modelID, scene, customID);
};

const setSubset = (expressID, material, customID) => {
  if (!state.modelID) return;
  ifcLoader.ifcManager.createSubset({ modelID: state.modelID, ids: [expressID], material, scene, removePrevious: true, customID });
};

const clearSelection = () => {
  lastSelected = null;
  clearSubset("selection");
  dom.props.textContent = "Klicka på ett element för att se metadata.";
  highlightList(null);
};

const getExpressIdFromHit = (hit) => {
  const fromManager = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
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
  const indexItem = state.ifcIndex[globalId];
  if (!indexItem) return;
  lastSelected = indexItem.expressID;
  setSubset(indexItem.expressID, selectMat, "selection");
  highlightList(globalId);
  dom.props.textContent = "Laddar parametrar...";
  try {
    console.log("[meta] load", { globalId, expressID: indexItem.expressID });
    const data = await getFullDataForExpressId(indexItem.expressID, globalId);
    console.log("[meta] ok", { globalId, expressID: indexItem.expressID });
    renderProperties(data, globalId);
  } catch (err) {
    console.error("[meta] fail", err);
    dom.props.textContent = "Kunde inte läsa metadata.";
  }
};

const handlePick = (event, isClick) => {
  if (!state.ifcModel) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

  const canvasX = (event.clientX - bounds.left) * (renderer.domElement.width / bounds.width);
  const canvasY = (bounds.height - (event.clientY - bounds.top)) * (renderer.domElement.height / bounds.height);
  const inCube =
    cubeMesh &&
    canvasX >= cubeViewport.x &&
    canvasX <= cubeViewport.x + cubeViewport.size &&
    canvasY >= cubeViewport.y &&
    canvasY <= cubeViewport.y + cubeViewport.size;

  if (!isClick && cubeMesh) {
    if (inCube) {
      const localX = (canvasX - cubeViewport.x) / cubeViewport.size;
      const localY = (canvasY - cubeViewport.y) / cubeViewport.size;
      cubeMouse.x = localX * 2 - 1;
      cubeMouse.y = localY * 2 - 1;
      cubeRaycaster.setFromCamera(cubeMouse, cubeCamera);
      const cubeHits = cubeRaycaster.intersectObject(cubeMesh, false);
      const faceIndex = cubeHits.length ? Math.floor(cubeHits[0].faceIndex / 2) : null;
      if (faceIndex !== cubeHoverFace) {
        cubeHoverFace = faceIndex;
        cubeMaterials.forEach((mat, idx) => {
          mat.color.set(idx === faceIndex ? "#e9f2ff" : "#ffffff");
        });
      }
    } else if (cubeHoverFace !== null) {
      cubeHoverFace = null;
      cubeMaterials.forEach((mat) => mat.color.set("#ffffff"));
    }
  }

  if (isClick && inCube) {
    const localX = (canvasX - cubeViewport.x) / cubeViewport.size;
    const localY = (canvasY - cubeViewport.y) / cubeViewport.size;
    cubeMouse.x = localX * 2 - 1;
    cubeMouse.y = localY * 2 - 1;
    cubeRaycaster.setFromCamera(cubeMouse, cubeCamera);
    const cubeHits = cubeRaycaster.intersectObject(cubeMesh, false);
    if (cubeHits.length) {
      const faceIndex = cubeHits[0].faceIndex;
      const faceMap = ["right", "left", "top", "bottom", "front", "back"];
      const face = faceMap[Math.floor(faceIndex / 2)];
      if (state.modelCenter && state.modelRadius) {
        const center = state.modelCenter;
        const distance = state.modelRadius * 2.2;
        const dirMap = {
          front: new THREE.Vector3(0, 0, 1),
          back: new THREE.Vector3(0, 0, -1),
          right: new THREE.Vector3(1, 0, 0),
          left: new THREE.Vector3(-1, 0, 0),
          top: new THREE.Vector3(0, 1, 0),
          bottom: new THREE.Vector3(0, -1, 0)
        };
        const dir = dirMap[face] || new THREE.Vector3(1, 1, 1).normalize();
        cameraTween = {
          start: performance.now(),
          duration: 450,
          fromPos: camera.position.clone(),
          toPos: center.clone().add(dir.multiplyScalar(distance)),
          fromTarget: controls.target.clone(),
          toTarget: center.clone()
        };
      }
    }
    return;
  }

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (isClick) console.log("[pick] click", { x: event.clientX, y: event.clientY });
  console.log("[pick] hits:", hits.length);
  if (!hits.length) {
    if (!isClick) clearSubset("hover");
    if (isClick) clearSelection();
    return;
  }
  let id = null;
  let hit = null;
  for (const candidate of hits) {
    const candidateId = getExpressIdFromHit(candidate);
    if (candidateId) {
      id = candidateId;
      hit = candidate;
      break;
    }
  }
  console.log("[pick] expressID:", id);
  if (!id || !hit) {
    if (!isClick) clearSubset("hover");
    if (isClick) clearSelection();
    return;
  }
  if (isClick) {
    lastSelected = id;
    setSubset(id, selectMat, "selection");
    const globalId = state.ifcIndexByExpressId[id];
    if (globalId) {
      selectByGlobalId(globalId);
    } else {
      dom.props.textContent = "Ingen GlobalId hittades för valt element.";
    }
  } else if (lastHovered !== id) {
    lastHovered = id;
    setSubset(id, hoverMat, "hover");
  }
};

renderer.domElement.style.pointerEvents = "auto";
renderer.domElement.addEventListener("pointermove", (event) => handlePick(event, false));
renderer.domElement.addEventListener("pointerdown", (event) => handlePick(event, true));

const resetCamera = () => {
  if (state.modelCenter && state.modelRadius) {
    const center = state.modelCenter;
    const distance = state.modelRadius * 2.2;
    camera.position.set(center.x + distance, center.y + distance, center.z + distance);
    controls.target.copy(center);
  } else {
    camera.position.set(14, 10, 14);
    controls.target.set(0, 0, 0);
  }
  controls.update();
  clearSelection();
};

const updateClipPlanes = () => {
  if (!state.modelBox) return;
  const min = state.modelBox.min;
  const max = state.modelBox.max;
  const xMinT = (Number(dom.clipXMin?.value || 0) || 0) / 100;
  const xMaxT = (Number(dom.clipXMax?.value || 100) || 100) / 100;
  const yMinT = (Number(dom.clipYMin?.value || 0) || 0) / 100;
  const yMaxT = (Number(dom.clipYMax?.value || 100) || 100) / 100;

  const xMin = min.x + (max.x - min.x) * xMinT;
  const xMax = min.x + (max.x - min.x) * xMaxT;
  const yMin = min.y + (max.y - min.y) * yMinT;
  const yMax = min.y + (max.y - min.y) * yMaxT;

  clipPlanes.xMin.constant = -xMin;
  clipPlanes.xMax.constant = xMax;
  clipPlanes.yMin.constant = -yMin;
  clipPlanes.yMax.constant = yMax;

  renderer.clippingPlanes = [clipPlanes.xMin, clipPlanes.xMax, clipPlanes.yMin, clipPlanes.yMax];
};

const unclipAll = () => {
  if (dom.clipXMin) dom.clipXMin.value = "0";
  if (dom.clipXMax) dom.clipXMax.value = "100";
  if (dom.clipYMin) dom.clipYMin.value = "0";
  if (dom.clipYMax) dom.clipYMax.value = "100";
  renderer.clippingPlanes = [];
};

const readIfcFile = async (file) => {
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
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
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  state.modelBox = box;
  state.modelCenter = center;
  state.modelRadius = Math.max(size.x, size.y, size.z) * 0.5 || 10;
  resetCamera();
  state.spatialTree = await ifcLoader.ifcManager.getSpatialStructure(state.modelID);
  state.spatialIndex = await getSpatialIndex(state.modelID);
  showProgress();
  const indexResult = await extractIfcIndex(state.modelID, (done, total) => {
    const percent = Math.round((done / total) * 100);
    dom.status.textContent = `Indexerar IFC... ${done}/${total}`;
    updateProgress(percent, "Laddar element");
  });
  state.ifcIndex = indexResult.indexByGuid;
  state.ifcIndexByExpressId = indexResult.indexByExpressId;
  state.ifcDataFull = {};

  buildList(state.ifcIndex);
  renderTree(state.spatialTree);
  dom.status.textContent = "";
  dom.viewerInfo.textContent = `Modell laddad: ${file.name}`;
  dom.exportBtn.disabled = false;
  dom.props.textContent = "Välj ett element för att se alla IFC-parametrar.";
  if (dom.propertyTabs) dom.propertyTabs.innerHTML = "";
  completeProgress();
  unclipAll();
};

const setupClipUI = () => {
  const onInput = () => updateClipPlanes();
  dom.clipXMin?.addEventListener("input", onInput);
  dom.clipXMax?.addEventListener("input", onInput);
  dom.clipYMin?.addEventListener("input", onInput);
  dom.clipYMax?.addEventListener("input", onInput);
  dom.clipUnclip?.addEventListener("click", () => {
    unclipAll();
  });
  dom.clipClose?.addEventListener("click", () => {
    const panel = document.getElementById("clip-panel");
    if (panel) panel.style.display = "none";
  });
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

  const bundleResponse = await fetch(`${import.meta.env.BASE_URL}export-bundle.js`);
  if (!bundleResponse.ok) throw new Error("Saknar export-bundle.js. Kör npm run build:export");
  const bundleCode = await bundleResponse.text();

  const fullData = await extractAllFullData((done, total) => {
    dom.status.textContent = `Samlar all IFC-data... ${done}/${total}`;
  });
  const dataJson = JSON.stringify(fullData);

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
    .tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px; }
    .tab { padding:6px 10px; font-size:12px; border-radius:6px; background:#e8ebf2; color:#1d1f2b; border:1px solid #d7dbe3; cursor:pointer; }
    .tab.active { background:#7bdff6; color:#081018; border-color:transparent; }
    #props { font-size:12px; background:#f8f9fb; color:#1d1f2b; padding:8px; border-radius:8px; border:1px solid #d7dbe3; }
    .prop-table { width:100%; border-collapse:collapse; font-size:12px; }
    .prop-table tr:nth-child(even) { background:#eef1f6; }
    .prop-table td { padding:6px 8px; vertical-align:top; border-bottom:1px solid #e1e5ec; word-break:break-word; }
    .prop-key { width:40%; color:#3f4661; font-weight:600; }
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
    <div id="property-tabs" class="tabs"></div>
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
setupClipUI();

if (dom.resetBtn) dom.resetBtn.addEventListener("click", resetCamera);
if (dom.exportBtn) dom.exportBtn.addEventListener("click", downloadHtml);
