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

export const init = async ({ containerId, listId, propsId, ifcBase64, ifcData, wasmBase64 }) => {
  const container = document.getElementById(containerId);
  const listEl = document.getElementById(listId);
  const propsEl = document.getElementById(propsId);

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
  ifcLoader.ifcManager.setWasmPath(createWasmUrl(wasmBase64), true);

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
        propsEl.textContent = JSON.stringify(data, null, 2);
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
    propsEl.textContent = JSON.stringify(data, null, 2);
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
