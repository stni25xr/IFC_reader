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

const createWasmUrl = (base64) => {
  const buffer = base64ToArrayBuffer(base64);
  const blob = new Blob([buffer], { type: "application/wasm" });
  return URL.createObjectURL(blob);
};

const buildList = (listEl, data, onSelect) => {
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
  const propState = { activeTab: "Summary", lastPayload: null, propsEl, tabsEl };

  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.set(12, 10, 12);
  const renderer = createRenderer(container);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const grid = new THREE.GridHelper(50, 50, 0x7bdff6, 0x1f2346);
  grid.material.opacity = 0.2;
  grid.material.transparent = true;
  scene.add(grid);

  const ifcLoader = new IFCLoader();
  if (wasmBase64) {
    ifcLoader.ifcManager.setWasmPath(createWasmUrl(wasmBase64), true);
  } else {
    const wasmBasePath = `${import.meta.env.BASE_URL || "/"}wasm/`;
    ifcLoader.ifcManager.setWasmPath(wasmBasePath, true);
  }

  const buffer = base64ToArrayBuffer(ifcBase64);
  const model = await ifcLoader.parse(buffer);
  scene.add(model);

  const hoverMat = new THREE.MeshBasicMaterial({ color: 0x7bdff6, transparent: true, opacity: 0.35, depthTest: false });
  const selectMat = new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.4, depthTest: false });

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

  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
};
