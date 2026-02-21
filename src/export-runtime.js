import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";

const createRenderer = (container) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  return renderer;
};

const createScene = () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(10, 20, 15);
  scene.add(dirLight);
  return scene;
};

const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const createWasmDataUrl = (base64) => `data:application/wasm;base64,${base64}`;

const buildList = (listEl, data, onSelect) => {
  if (!listEl) return;
  listEl.innerHTML = "";
  Object.entries(data).forEach(([globalId, item]) => {
    const btn = document.createElement("div");
    btn.className = "element-item";
    btn.dataset.globalId = globalId;
    const label = item.attributes?.Name?.value || item.attributes?.Name || item.attributes?.ObjectType?.value || "(Namnlös)";
    btn.innerHTML = `${label}<span class=\"tag\">${item.ifcType || "IFC"}</span><div class=\"hint\">${globalId}</div>`;
    btn.addEventListener("click", () => onSelect(globalId));
    listEl.appendChild(btn);
  });
};

const highlightElement = (listEl, globalId) => {
  if (!listEl) return;
  listEl.querySelectorAll(".element-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.globalId === globalId);
  });
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

const renderPropertyTabs = (tabsEl, tabs, stateRef) => {
  if (!tabsEl) return;
  tabsEl.innerHTML = "";
  Object.keys(tabs).forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab${tab === stateRef.activeTab ? " active" : ""}`;
    btn.textContent = tab;
    btn.addEventListener("click", () => {
      stateRef.activeTab = tab;
      if (stateRef.lastPayload) renderProperties(stateRef, stateRef.lastPayload.data, stateRef.lastPayload.globalId);
    });
    tabsEl.appendChild(btn);
  });
};

const renderProperties = (stateRef, data, globalId) => {
  const tabs = buildPropertyTabs(data, globalId);
  if (!tabs[stateRef.activeTab]) stateRef.activeTab = "Summary";
  renderPropertyTabs(stateRef.tabsEl, tabs, stateRef);
  const rows = tabs[stateRef.activeTab] || [];
  stateRef.propsEl.innerHTML = rows.length ? renderTable(rows) : "Inga parametrar hittades.";
  stateRef.lastPayload = { data, globalId };
};

export const init = async ({ containerId, listId, propsId, ifcBase64, ifcData, wasmBase64 }) => {
  const container = document.getElementById(containerId);
  const listEl = document.getElementById(listId);
  const propsEl = document.getElementById(propsId);
  const tabsEl = document.getElementById("property-tabs");
  const viewCubeCanvas = document.getElementById("view-cube-canvas");
  const toolClip = document.getElementById("tool-clip");
  const propState = { activeTab: "Summary", lastPayload: null, propsEl, tabsEl };

  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.set(12, 10, 12);
  const renderer = createRenderer(container);
  renderer.setClearColor(0xf2f2f2, 1);
  renderer.localClippingEnabled = true;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const cubeScene = new THREE.Scene();
  const cubeCamera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
  cubeCamera.position.set(0, 0, 3);
  cubeCamera.lookAt(0, 0, 0);
  const cubeRenderer = viewCubeCanvas
    ? new THREE.WebGLRenderer({ canvas: viewCubeCanvas, antialias: true, alpha: true })
    : null;
  let cubeMesh = null;
  let cubeMaterials = [];
  const cubeRaycaster = new THREE.Raycaster();
  const cubeMouse = new THREE.Vector2();
  let cubeHoverFace = null;

  const ifcLoader = new IFCLoader();
  if (wasmBase64) {
    const wasmDataUrl = createWasmDataUrl(wasmBase64);
    const api = ifcLoader.ifcManager.ifcAPI;
    await api.Init((path) => (path.endsWith(".wasm") ? wasmDataUrl : path));
  } else {
    ifcLoader.ifcManager.setWasmPath("./wasm/");
  }

  const showError = (message) => {
    if (!container) return;
    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;color:#111;background:#f8f9fb;font-size:14px;text-align:center;";
    el.textContent = message;
    container.appendChild(el);
  };

  let model = null;
  try {
    const buffer = base64ToArrayBuffer(ifcBase64);
    model = await ifcLoader.parse(buffer);
    scene.add(model);
  } catch (err) {
    showError("Kunde inte ladda web-ifc.wasm. Kontrollera att exporten är korrekt.");
    throw err;
  }

  const fitToModel = () => {
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 10;
    const distance = radius * 2.2;
    camera.position.set(center.x + distance, center.y + distance, center.z + distance);
    controls.target.copy(center);
    camera.near = Math.max(0.1, radius / 100);
    camera.far = Math.max(2000, radius * 10);
    camera.updateProjectionMatrix();
    controls.update();
  };
  fitToModel();

  const hoverMat = new THREE.MeshBasicMaterial({ color: 0x7bdff6, transparent: true, opacity: 0.35, depthTest: false });
  const selectMat = new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.4, depthTest: false });

  const clipDom = {
    panel: document.getElementById("clip-panel"),
    xMin: document.getElementById("clip-x-min"),
    xMax: document.getElementById("clip-x-max"),
    yMin: document.getElementById("clip-y-min"),
    yMax: document.getElementById("clip-y-max"),
    zMin: document.getElementById("clip-z-min"),
    zMax: document.getElementById("clip-z-max"),
    xVal: document.getElementById("clip-x-value"),
    yVal: document.getElementById("clip-y-value"),
    zVal: document.getElementById("clip-z-value"),
    unclip: document.getElementById("clip-unclip"),
    close: document.getElementById("clip-close")
  };

  const clipPlanes = {
    xMin: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    xMax: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    yMin: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    yMax: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    zMin: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    zMax: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
  };

  const updateClipPlanes = () => {
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model);
    const min = box.min;
    const max = box.max;
    let xMinT = (Number(clipDom.xMin?.value || 0) || 0) / 100;
    let xMaxT = (Number(clipDom.xMax?.value || 100) || 100) / 100;
    let yMinT = (Number(clipDom.yMin?.value || 0) || 0) / 100;
    let yMaxT = (Number(clipDom.yMax?.value || 100) || 100) / 100;
    let zMinT = (Number(clipDom.zMin?.value || 0) || 0) / 100;
    let zMaxT = (Number(clipDom.zMax?.value || 100) || 100) / 100;

    if (xMinT > xMaxT) [xMinT, xMaxT] = [xMaxT, xMinT];
    if (yMinT > yMaxT) [yMinT, yMaxT] = [yMaxT, yMinT];
    if (zMinT > zMaxT) [zMinT, zMaxT] = [zMaxT, zMinT];

    const eps = 0.001;
    if (xMaxT - xMinT < eps) xMaxT = Math.min(1, xMinT + eps);
    if (yMaxT - yMinT < eps) yMaxT = Math.min(1, yMinT + eps);
    if (zMaxT - zMinT < eps) zMaxT = Math.min(1, zMinT + eps);

    const xMin = min.x + (max.x - min.x) * xMinT;
    const xMax = min.x + (max.x - min.x) * xMaxT;
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

    if (clipDom.xVal) clipDom.xVal.textContent = `${Math.round(xMin)} - ${Math.round(xMax)}`;
    if (clipDom.yVal) clipDom.yVal.textContent = `${Math.round(yMin)} - ${Math.round(yMax)}`;
    if (clipDom.zVal) clipDom.zVal.textContent = `${Math.round(zMin)} - ${Math.round(zMax)}`;
  };

  const unclipAll = () => {
    if (clipDom.xMin) clipDom.xMin.value = "0";
    if (clipDom.xMax) clipDom.xMax.value = "100";
    if (clipDom.yMin) clipDom.yMin.value = "0";
    if (clipDom.yMax) clipDom.yMax.value = "100";
    if (clipDom.zMin) clipDom.zMin.value = "0";
    if (clipDom.zMax) clipDom.zMax.value = "100";
    renderer.clippingPlanes = [];
    if (clipDom.xVal) clipDom.xVal.textContent = "0 - 100";
    if (clipDom.yVal) clipDom.yVal.textContent = "0 - 100";
    if (clipDom.zVal) clipDom.zVal.textContent = "0 - 100";
  };

  if (clipDom.panel) {
    const onInput = () => updateClipPlanes();
    clipDom.xMin?.addEventListener("input", onInput);
    clipDom.xMax?.addEventListener("input", onInput);
    clipDom.yMin?.addEventListener("input", onInput);
    clipDom.yMax?.addEventListener("input", onInput);
    clipDom.zMin?.addEventListener("input", onInput);
    clipDom.zMax?.addEventListener("input", onInput);
    clipDom.unclip?.addEventListener("click", unclipAll);
    clipDom.close?.addEventListener("click", () => {
      if (clipDom.panel) clipDom.panel.style.display = "none";
    });
  }
  if (toolClip && clipDom.panel) {
    toolClip.addEventListener("click", () => {
      const isHidden = clipDom.panel.style.display === "none";
      clipDom.panel.style.display = isHidden ? "block" : "none";
      toolClip.classList.toggle("active", isHidden);
    });
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let modelID = model.modelID;
  let lastHovered = null;
  let lastSelected = null;

  const clearSubset = (customID) => {
    ifcLoader.ifcManager.removeSubset(modelID, undefined, customID);
  };

  const setSubset = (id, material, customID) => {
    ifcLoader.ifcManager.createSubset({ modelID, ids: [id], material, scene, removePrevious: true, customID });
  };

  const pick = (event, isClick) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(model, true);
    if (!hits.length) {
      if (!isClick) clearSubset("hover");
      return;
    }
    const found = hits[0];
    const id = ifcLoader.ifcManager.getExpressId(found.object.geometry, found.faceIndex);
    if (!id) return;
    if (isClick) {
      lastSelected = id;
      setSubset(id, selectMat, "select");
      const item = Object.entries(ifcData).find(([, value]) => value.expressID === id);
      if (item) {
        const [globalId, data] = item;
        renderProperties(propState, data, globalId);
        highlightElement(listEl, globalId);
      }
    } else if (lastHovered !== id) {
      lastHovered = id;
      setSubset(id, hoverMat, "hover");
    }
  };

  renderer.domElement.addEventListener("mousemove", (event) => pick(event, false));
  renderer.domElement.addEventListener("click", (event) => pick(event, true));

  const onSelectGlobal = (globalId) => {
    const data = ifcData[globalId];
    if (!data) return;
    lastSelected = data.expressID;
    setSubset(data.expressID, selectMat, "select");
    renderProperties(propState, data, globalId);
    highlightElement(listEl, globalId);
  };

  buildList(listEl, ifcData, onSelectGlobal);

  if (cubeRenderer && viewCubeCanvas) {
    cubeRenderer.setPixelRatio(window.devicePixelRatio);
    cubeRenderer.setSize(viewCubeCanvas.clientWidth, viewCubeCanvas.clientHeight, false);
    cubeRenderer.setClearColor(0x000000, 0);
    const makeFace = (label, shade) => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, shade);
      grad.addColorStop(1, "#9a9a9a");
      ctx.fillStyle = grad;
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
      makeFace("R", "#bdbdbd"),
      makeFace("L", "#b3b3b3"),
      makeFace("T", "#9e9e9e"),
      makeFace("B", "#b3b3b3"),
      makeFace("F", "#bdbdbd"),
      makeFace("Bk", "#a8a8a8")
    ];
    cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMaterials);
    cubeScene.add(cubeMesh);

    viewCubeCanvas.addEventListener("pointermove", (event) => {
      const rect = viewCubeCanvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      cubeMouse.set(x, y);
      cubeRaycaster.setFromCamera(cubeMouse, cubeCamera);
      const hits = cubeRaycaster.intersectObject(cubeMesh, false);
      const faceIndex = hits.length ? Math.floor(hits[0].faceIndex / 2) : null;
      if (faceIndex !== cubeHoverFace) {
        cubeHoverFace = faceIndex;
        cubeMaterials.forEach((mat, idx) => mat.color.set(idx === faceIndex ? "#a9c7ff" : "#ffffff"));
      }
    });
    viewCubeCanvas.addEventListener("pointerleave", () => {
      cubeHoverFace = null;
      cubeMaterials.forEach((mat) => mat.color.set("#ffffff"));
    });
    viewCubeCanvas.addEventListener("pointerdown", (event) => {
      if (!cubeMesh || !model) return;
      const rect = viewCubeCanvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      cubeMouse.set(x, y);
      cubeRaycaster.setFromCamera(cubeMouse, cubeCamera);
      const hits = cubeRaycaster.intersectObject(cubeMesh, false);
      if (!hits.length) return;
      const face = Math.floor(hits[0].faceIndex / 2);
      const dirMap = {
        0: new THREE.Vector3(1, 0, 0),
        1: new THREE.Vector3(-1, 0, 0),
        2: new THREE.Vector3(0, 1, 0),
        3: new THREE.Vector3(0, -1, 0),
        4: new THREE.Vector3(0, 0, 1),
        5: new THREE.Vector3(0, 0, -1)
      };
      const box = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const radius = Math.max(size.x, size.y, size.z) * 0.5 || 10;
      const distance = radius * 2.2;
      const dir = (dirMap[face] || new THREE.Vector3(1, 1, 1).normalize()).clone();
      const toPos = center.clone().add(dir.multiplyScalar(distance));
      const startPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const start = performance.now();
      const duration = 450;
      const animateTween = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        camera.position.lerpVectors(startPos, toPos, t);
        controls.target.lerpVectors(startTarget, center, t);
        if (t < 1) requestAnimationFrame(animateTween);
      };
      animateTween();
    });
  }

  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    if (cubeMesh && cubeRenderer) {
      cubeMesh.quaternion.copy(camera.quaternion).invert();
      cubeRenderer.render(cubeScene, cubeCamera);
    }
    requestAnimationFrame(animate);
  };
  animate();

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
};
