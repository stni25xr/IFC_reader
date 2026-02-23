import * as THREE from "three";

export const createCameraRig = (width, height, options = {}) => {
  const fov = options.fov ?? 50;
  const near = options.near ?? 0.1;
  const far = options.far ?? 4000;
  const aspect = width / height;

  const persp = new THREE.PerspectiveCamera(fov, aspect, near, far);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, near, far);
  const rig = {
    mode: "persp",
    persp,
    ortho,
    active: persp,
    _target: new THREE.Vector3()
  };

  const updateOrthoFrustum = (distance) => {
    const safeDist = Math.max(distance, 0.001);
    const heightWorld = 2 * Math.tan(THREE.MathUtils.degToRad(fov * 0.5)) * safeDist;
    const widthWorld = heightWorld * (rig.persp.aspect || aspect);
    rig.ortho.left = -widthWorld / 2;
    rig.ortho.right = widthWorld / 2;
    rig.ortho.top = heightWorld / 2;
    rig.ortho.bottom = -heightWorld / 2;
    rig.ortho.updateProjectionMatrix();
  };

  rig.resize = (w, h) => {
    rig.persp.aspect = w / h;
    rig.persp.updateProjectionMatrix();
    const dist = rig.active.position.distanceTo(rig._target || new THREE.Vector3());
    updateOrthoFrustum(dist || 10);
  };

  rig.setTarget = (target) => {
    rig._target = target.clone();
  };

  rig.setMode = (mode, target, distance, direction) => {
    if (target) rig._target = target.clone();
    const tgt = rig._target || target || new THREE.Vector3();
    const dir = direction ? direction.clone().normalize() : rig.active.position.clone().sub(tgt).normalize();
    const dist = distance ?? rig.active.position.distanceTo(tgt);
    if (mode === "ortho") {
      rig.ortho.position.copy(tgt.clone().add(dir.multiplyScalar(dist)));
      rig.ortho.up.copy(rig.persp.up);
      rig.ortho.lookAt(tgt);
      updateOrthoFrustum(dist);
      rig.active = rig.ortho;
      rig.mode = "ortho";
      return;
    }
    rig.persp.position.copy(tgt.clone().add(dir.multiplyScalar(dist)));
    rig.persp.up.copy(rig.ortho.up);
    rig.persp.lookAt(tgt);
    rig.active = rig.persp;
    rig.mode = "persp";
  };

  rig.toggle = (target) => {
    const tgt = target || rig._target || new THREE.Vector3();
    const dir = rig.active.position.clone().sub(tgt).normalize();
    const dist = rig.active.position.distanceTo(tgt);
    rig.setMode(rig.mode === "persp" ? "ortho" : "persp", tgt, dist, dir);
  };

  rig.setFrame = (target, radius) => {
    rig._target = target.clone();
    const dist = Math.max(radius * 2.2, 0.1);
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    rig.setMode(rig.mode, target, dist, dir);
  };

  rig.setTopDown = (target, distance, upAxis = "z") => {
    const tgt = target.clone();
    rig._target = tgt.clone();
    const dist = Math.max(distance, 0.1);
    const dir = upAxis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    rig.setMode(rig.mode, tgt, dist, dir);
  };

  return rig;
};

export const applyPlanSlice = (renderer, elevation, thickness = 0.7, upAxis = "z") => {
  const up = upAxis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const down = up.clone().multiplyScalar(-1);
  const topPlane = new THREE.Plane(down, elevation + thickness);
  const bottomPlane = new THREE.Plane(up, -(elevation - thickness));
  renderer.clippingPlanes = [topPlane, bottomPlane];
};

export const clearPlanSlice = (renderer) => {
  renderer.clippingPlanes = [];
};

export const extractStoreyLevels = async (ifcLoader, modelID, spatialTree) => {
  const levels = [];
  if (!spatialTree) return levels;
  const storeys = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === "IfcBuildingStorey" && node.expressID) {
      storeys.push(node);
    }
    (node.children || []).forEach(walk);
  };
  walk(spatialTree);
  for (const storey of storeys) {
    const props = await ifcLoader.ifcManager.getItemProperties(modelID, storey.expressID, true);
    const elevation =
      Number(props?.Elevation?.value ?? props?.Elevation ?? props?.ObjectPlacement?.RelativePlacement?.Location?.Coordinates?.[2]) || 0;
    const name = props?.LongName?.value || props?.Name?.value || props?.Name || storey.name || `Level ${storey.expressID}`;
    levels.push({ id: storey.expressID, name, elevation, modelID });
  }
  levels.sort((a, b) => a.elevation - b.elevation);
  return levels;
};
