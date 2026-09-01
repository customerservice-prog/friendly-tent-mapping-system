// Friendly Event Designer — live 3D designer view
// This module renders the event layout in 3D and is the primary editing
// surface: customers orbit/zoom the camera, click a table or dance floor
// section to select it, and drag it to reposition it inside the tent.
// See FRIENDLY-EVENT-DESIGNER.md.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { byId as chairById } from '../data/chairs.js';

const WALL_H = 9;
const POLE_PEAK_H = 2.5;
const CHAIR_COLOR_DEFAULT = 0xffffff;
const CHAIR_COLOR_GOLD = 0xd4af37;
const CHAIR_COLOR_MAHOGANY = 0x5a3320;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let animationId = null;
let container = null;
let resizeObserver = null;
let ambientLight = null;
let sunLight = null;
let hemiLight = null;
let stringLightRigs = [];
let isNight = false;
let dynamicGroup = null;
let currentTent = null;
let currentTentId = null;
let callbacks = {};
let raycaster = null;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let groundMaterial = null;

let dragging = false;
let dragMoved = false;
let dragTarget = null;
let dragStartPoint = new THREE.Vector3();
let dragOrigX = 0;
let dragOrigY = 0;
let dragLiveX = 0;
let dragLiveY = 0;

const chairGeometryCache = {};
function cachedGeo(key, factory) {
  if (!chairGeometryCache[key]) chairGeometryCache[key] = factory();
  return chairGeometryCache[key];
}

const chairMaterialCache = {};
function cachedMat(key, factory) {
  if (!chairMaterialCache[key]) chairMaterialCache[key] = factory();
  return chairMaterialCache[key];
}

function chairSpacingFor(chairId) {
  const chair = chairById(chairId) || {};
  const w = chair.seatWidthFt || 1.5;
  const d = chair.seatDepthFt || 1.5;
  return Math.max(w, d) / 2 + 0.5;
}

function buildFoldingChairGroup(chair, frameMat) {
  const group = new THREE.Group();
  const w = chair.seatWidthFt || 1.5;
  const d = chair.seatDepthFt || 1.5;
  const backH = chair.backHeightFt || 2.6;
  const seatH = 0.9;
  const seat = new THREE.Mesh(cachedGeo('fold-seat-' + w + 'x' + d, function () {
    return new THREE.BoxGeometry(w * 0.9, 0.08, d * 0.85);
  }), frameMat);
  seat.position.set(0, seatH, 0.03);
  group.add(seat);

  const backHeight = Math.max(0.4, backH - seatH);
  const back = new THREE.Mesh(cachedGeo('fold-back-' + w + 'x' + backHeight, function () {
    return new THREE.BoxGeometry(w * 0.85, backHeight, 0.06);
  }), frameMat);
  back.position.set(0, seatH + backHeight / 2, -d * 0.4);
  back.rotation.x = -0.08;
  group.add(back);

  const legGeo = cachedGeo('fold-leg-' + seatH, function () { return new THREE.CylinderGeometry(0.035, 0.035, seatH, 6); });
  [[-w * 0.4, -d * 0.38], [w * 0.4, -d * 0.38], [-w * 0.4, d * 0.38], [w * 0.4, d * 0.38]].forEach(function (p) {
    const legMesh = new THREE.Mesh(legGeo, frameMat);
    legMesh.position.set(p[0], seatH / 2, p[1]);
    legMesh.rotation.z = p[1] < 0 ? 0.1 : -0.1;
    group.add(legMesh);
  });
  return group;
}

function buildResinChairGroup(chair, frameMat) {
  const group = new THREE.Group();
  const w = chair.seatWidthFt || 1.55;
  const d = chair.seatDepthFt || 1.6;
  const backH = chair.backHeightFt || 2.75;
  const seatH = 0.92;
  const seat = new THREE.Mesh(cachedGeo('resin-seat-' + w, function () {
    return new THREE.CylinderGeometry(w * 0.46, w * 0.5, 0.16, 16);
  }), frameMat);
  seat.position.set(0, seatH, 0.02);
  group.add(seat);

  const backHeight = Math.max(0.5, backH - seatH);
  const back = new THREE.Mesh(cachedGeo('resin-back-' + w + 'x' + backHeight, function () {
    return new THREE.CylinderGeometry(w * 0.48, w * 0.52, backHeight, 12, 1, true, Math.PI * 0.15, Math.PI * 0.7);
  }), frameMat);
  back.position.set(0, seatH + backHeight / 2, -d * 0.42);
  group.add(back);

  const legGeo = cachedGeo('resin-leg-' + seatH, function () { return new THREE.CylinderGeometry(0.05, 0.05, seatH, 8); });
  [[-w * 0.38, -d * 0.35], [w * 0.38, -d * 0.35], [-w * 0.38, d * 0.35], [w * 0.38, d * 0.35]].forEach(function (p) {
    const legMesh = new THREE.Mesh(legGeo, frameMat);
    legMesh.position.set(p[0], seatH / 2, p[1]);
    group.add(legMesh);
  });
  return group;
}

function buildChiavariChairGroup(chair, frameMat, accentMat) {
  const group = new THREE.Group();
  const w = chair.seatWidthFt || 1.3;
  const d = chair.seatDepthFt || 1.4;
  const backH = chair.backHeightFt || 3.0;
  const seatH = 0.95;
  const seat = new THREE.Mesh(cachedGeo('chiavari-seat-' + w, function () {
    return new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.12, 16);
  }), accentMat);
  seat.position.set(0, seatH, 0);
  group.add(seat);

  const rail = new THREE.Mesh(cachedGeo('chiavari-rail-' + w, function () {
    return new THREE.TorusGeometry(w * 0.4, 0.03, 6, 16, Math.PI);
  }), frameMat);
  rail.position.set(0, backH, -d * 0.32);
  rail.rotation.set(Math.PI / 2, 0, Math.PI);
  group.add(rail);

  const spindleH = Math.max(0.3, backH - seatH);
  const spindleGeo = cachedGeo('chiavari-spindle-' + spindleH, function () {
    return new THREE.CylinderGeometry(0.02, 0.02, spindleH, 4);
  });
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) - 0.5;
    const spindle = new THREE.Mesh(spindleGeo, frameMat);
    spindle.position.set(t * w * 0.7, seatH + spindleH / 2, -d * 0.32);
    group.add(spindle);
  }

  const legGeo = cachedGeo('chiavari-leg-' + seatH, function () { return new THREE.CylinderGeometry(0.025, 0.03, seatH, 6); });
  [[-w * 0.36, -d * 0.34], [w * 0.36, -d * 0.34], [-w * 0.36, d * 0.34], [w * 0.36, d * 0.34]].forEach(function (p) {
    const legMesh = new THREE.Mesh(legGeo, frameMat);
    legMesh.position.set(p[0], seatH / 2, p[1]);
    group.add(legMesh);
  });
  return group;
}

function buildThroneChairGroup(chair, frameMat, accentMat) {
  const group = new THREE.Group();
  const w = chair.seatWidthFt || 2.6;
  const d = chair.seatDepthFt || 2.4;
  const backH = chair.backHeightFt || 4.4;
  const seatH = 1.15;
  const seat = new THREE.Mesh(cachedGeo('throne-seat-' + w + 'x' + d, function () {
    return new THREE.BoxGeometry(w * 0.75, 0.28, d * 0.7);
  }), accentMat);
  seat.position.set(0, seatH, 0.02);
  group.add(seat);

  const backHeight = Math.max(0.8, backH - seatH);
  const back = new THREE.Mesh(cachedGeo('throne-back-' + w + 'x' + backHeight, function () {
    return new THREE.BoxGeometry(w * 0.85, backHeight, 0.18);
  }), accentMat);
  back.position.set(0, seatH + backHeight / 2, -d * 0.36);
  group.add(back);

  const frameBack = new THREE.Mesh(cachedGeo('throne-frame-' + w + 'x' + backHeight, function () {
    return new THREE.BoxGeometry(w * 0.95, backHeight + 0.3, 0.1);
  }), frameMat);
  frameBack.position.set(0, seatH + backHeight / 2, -d * 0.42);
  group.add(frameBack);

  const armGeo = cachedGeo('throne-arm-' + d, function () { return new THREE.BoxGeometry(0.14, 0.35, d * 0.6); });
  [-w * 0.42, w * 0.42].forEach(function (ax) {
    const armMesh = new THREE.Mesh(armGeo, frameMat);
    armMesh.position.set(ax, seatH + 0.22, 0);
    group.add(armMesh);
  });

  const finial = new THREE.Mesh(cachedGeo('throne-finial', function () {
    return new THREE.SphereGeometry(0.14, 10, 10);
  }), frameMat);
  finial.position.set(0, seatH + backHeight + 0.1, -d * 0.42);
  group.add(finial);

  const legGeo = cachedGeo('throne-leg-' + seatH, function () { return new THREE.CylinderGeometry(0.07, 0.09, seatH, 8); });
  [[-w * 0.4, -d * 0.32], [w * 0.4, -d * 0.32], [-w * 0.4, d * 0.32], [w * 0.4, d * 0.32]].forEach(function (p) {
    const legMesh = new THREE.Mesh(legGeo, frameMat);
    legMesh.position.set(p[0], seatH / 2, p[1]);
    group.add(legMesh);
  });
  return group;
}

function buildChairGroup(chairId) {
  const chair = chairById(chairId) || {};
  const silhouette = chair.silhouette || 'folding';
  const frameColor = chair.frameColor || '#f2f1ec';
  const accentColor = chair.accentColor || frameColor;
  const frameMat = cachedMat('frame-' + frameColor + '-' + silhouette, function () {
    return new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: silhouette === 'chiavari' ? 0.35 : (silhouette === 'throne' ? 0.5 : 0.8),
      metalness: silhouette === 'chiavari' ? 0.5 : (silhouette === 'throne' ? 0.25 : 0.03),
      side: THREE.DoubleSide,
    });
  });
  const accentMat = cachedMat('accent-' + accentColor, function () {
    return new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.65, metalness: 0.05 });
  });
  if (silhouette === 'resin') return buildResinChairGroup(chair, frameMat);
  if (silhouette === 'chiavari') return buildChiavariChairGroup(chair, frameMat, accentMat);
  if (silhouette === 'throne') return buildThroneChairGroup(chair, frameMat, accentMat);
  return buildFoldingChairGroup(chair, frameMat);
}

function disposeObject3D(obj) {
obj.traverse(function (child) {
if (child.geometry) child.geometry.dispose();
if (child.material) {
if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
else child.material.dispose();
}
});
}

function clearDynamicGroup() {
if (!dynamicGroup) return;
while (dynamicGroup.children.length) {
const child = dynamicGroup.children.pop();
disposeObject3D(child);
}
}

function quad(p1, p2, p3, p4) {
const positions = new Float32Array([
p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2],
p1[0], p1[1], p1[2], p3[0], p3[1], p3[2], p4[0], p4[1], p4[2],
]);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geo.computeVertexNormals();
return geo;
}

function addTentGroup(tent) {
const group = new THREE.Group();
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const isPole = tent.type === 'pole';
const roofY = WALL_H + (isPole ? POLE_PEAK_H : 0);

const floorGeo = new THREE.PlaneGeometry(tent.widthFt, tent.lengthFt);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x93d494 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
group.add(floor);

const fpPts = [
new THREE.Vector3(-halfW, 0.02, -halfL),
new THREE.Vector3(halfW, 0.02, -halfL),
new THREE.Vector3(halfW, 0.02, halfL),
new THREE.Vector3(-halfW, 0.02, halfL),
new THREE.Vector3(-halfW, 0.02, -halfL),
];
const fpGeo = new THREE.BufferGeometry().setFromPoints(fpPts);
group.add(new THREE.Line(fpGeo, new THREE.LineBasicMaterial({ color: 0x2f7a3c })));

const wallMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0x2f7a3c });

function wall(w, h, x, z, rotY) {
const geo = new THREE.PlaneGeometry(w, h);
const mesh = new THREE.Mesh(geo, wallMat);
mesh.position.set(x, h / 2, z);
if (rotY) mesh.rotation.y = rotY;
group.add(mesh);
const edges = new THREE.EdgesGeometry(geo);
const line = new THREE.LineSegments(edges, wallEdgeMat);
line.position.copy(mesh.position);
line.rotation.copy(mesh.rotation);
group.add(line);
}
wall(tent.widthFt, WALL_H, 0, -halfL, 0);
wall(tent.widthFt, WALL_H, 0, halfL, 0);
wall(tent.lengthFt, WALL_H, -halfW, 0, Math.PI / 2);
wall(tent.lengthFt, WALL_H, halfW, 0, Math.PI / 2);

const roofMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.7 });
const roofEdgeMat = new THREE.LineBasicMaterial({ color: 0x2f7a3c });
if (isPole) {
const left = quad([0, roofY, -halfL], [0, roofY, halfL], [-halfW, WALL_H, halfL], [-halfW, WALL_H, -halfL]);
const right = quad([0, roofY, -halfL], [0, roofY, halfL], [halfW, WALL_H, halfL], [halfW, WALL_H, -halfL]);
[left, right].forEach(function (g) {
group.add(new THREE.Mesh(g, roofMat));
group.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), roofEdgeMat));
});
const ridgeGeo = new THREE.BoxGeometry(0.18, 0.18, tent.lengthFt);
const ridge = new THREE.Mesh(ridgeGeo, new THREE.MeshStandardMaterial({ color: 0xd8cfa0 }));
ridge.position.set(0, roofY, 0);
group.add(ridge);
} else {
const flatGeo = new THREE.PlaneGeometry(tent.widthFt, tent.lengthFt);
const flat = new THREE.Mesh(flatGeo, roofMat);
flat.rotation.x = -Math.PI / 2;
flat.position.set(0, roofY, 0);
group.add(flat);
const edges = new THREE.EdgesGeometry(flatGeo);
const line = new THREE.LineSegments(edges, roofEdgeMat);
line.rotation.x = -Math.PI / 2;
line.position.set(0, roofY, 0);
group.add(line);
}

const poleMat = new THREE.MeshStandardMaterial({ color: 0xbfbfbf, metalness: 0.3, roughness: 0.5 });
const poleInset = Math.min(0.6, halfW * 0.1, halfL * 0.1);
const cornerXs = [-halfW + poleInset, halfW - poleInset];
const cornerZs = [-halfL + poleInset, halfL - poleInset];
cornerXs.forEach(function (cx) {
cornerZs.forEach(function (cz) {
const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, WALL_H, 8);
const pole = new THREE.Mesh(poleGeo, poleMat);
pole.position.set(cx, WALL_H / 2, cz);
group.add(pole);
});
});

(tent.centerPoles || []).forEach(function (p) {
const cx = p.x - halfW;
const cz = p.y - halfL;
const poleH = roofY;
const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, poleH, 8);
const pole = new THREE.Mesh(poleGeo, poleMat);
pole.position.set(cx, poleH / 2, cz);
group.add(pole);
});

return group;
}

function tableLocalGroup(item) {
const group = new THREE.Group();
const topY = 2.4;
const topMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.6 });
let radiusForChairs;

if (item.shape === 'round') {
const r = item.widthFt / 2;
const topGeo = new THREE.CylinderGeometry(r, r, 0.15, 32);
const top = new THREE.Mesh(topGeo, topMat);
top.position.set(0, topY, 0);
group.add(top);
radiusForChairs = r;

const skirtGeo = new THREE.CylinderGeometry(r, r, topY - 0.08, 32, 1, true);
const skirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 });
const skirt = new THREE.Mesh(skirtGeo, skirtMat);
skirt.position.set(0, (topY - 0.08) / 2, 0);
group.add(skirt);
} else {
const topGeo = new THREE.BoxGeometry(item.widthFt, 0.15, item.depthFt);
const top = new THREE.Mesh(topGeo, topMat);
top.position.set(0, topY, 0);
group.add(top);
radiusForChairs = Math.max(item.widthFt, item.depthFt) / 2;

const legMat = new THREE.MeshStandardMaterial({ color: 0x6b6b6b });
const legGeo = new THREE.BoxGeometry(0.18, topY - 0.15, 0.18);
const lx = item.widthFt / 2 - 0.3;
const lz = item.depthFt / 2 - 0.3;
[[-lx, -lz], [lx, -lz], [lx, lz], [-lx, lz]].forEach(function (p) {
const leg = new THREE.Mesh(legGeo, legMat);
leg.position.set(p[0], (topY - 0.15) / 2, p[1]);
group.add(leg);
});
}

if (item.seatCount > 0) {
    const chairR = radiusForChairs + chairSpacingFor(item.chairId);
    for (let i = 0; i < item.seatCount; i++) {
      const angle = (i / item.seatCount) * Math.PI * 2;
      const cx = chairR * Math.cos(angle);
      const cz = chairR * Math.sin(angle);
      const chairGroup = buildChairGroup(item.chairId);
      chairGroup.position.set(cx, 0, cz);
      chairGroup.rotation.y = -angle - Math.PI / 2;
      group.add(chairGroup);
    }
  }
  return group;
}

function danceLocalGroup(item) {
const group = new THREE.Group();
const col = Math.round(item.x / item.widthFt);
const row = Math.round(item.y / item.depthFt);
const light = (col + row) % 2 === 0;
const mat = new THREE.MeshStandardMaterial({ color: light ? 0xf2e7c6 : 0xffffff });
const geo = new THREE.BoxGeometry(item.widthFt, 0.1, item.depthFt);
const mesh = new THREE.Mesh(geo, mat);
mesh.position.set(0, 0.06, 0);
group.add(mesh);
return group;
}

function highlightRing(widthFt, depthFt, color) {
const geo = new THREE.BoxGeometry(widthFt + 0.8, 0.04, depthFt + 0.8);
const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55 });
const mesh = new THREE.Mesh(geo, mat);
mesh.position.y = 0.03;
return mesh;
}

function addGround(tent) {
const w = tent.widthFt + 40;
const l = tent.lengthFt + 40;
const geo = new THREE.PlaneGeometry(w, l);
const mat = new THREE.MeshStandardMaterial({ color: isNight ? 0x24361f : 0x7cb87c });
groundMaterial = mat;
const mesh = new THREE.Mesh(geo, mat);
mesh.rotation.x = -Math.PI / 2;
mesh.position.y = 0;
return mesh;
}

function addStringLights(tent) {
const rigs = [];
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const y = WALL_H + 0.5;
const spacing = 6;
const pts = [];
function walk(a, b) {
const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
const steps = Math.max(1, Math.round(segLen / spacing));
for (let i = 0; i < steps; i++) {
const t = i / steps;
pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}
}
const corners = [[-halfW, -halfL], [halfW, -halfL], [halfW, halfL], [-halfW, halfL]];
walk(corners[0], corners[1]);
walk(corners[1], corners[2]);
walk(corners[2], corners[3]);
walk(corners[3], corners[0]);

const wirePts = pts.map(function (p) { return new THREE.Vector3(p[0], y, p[1]); });
wirePts.push(wirePts[0].clone());
const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
dynamicGroup.add(new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: 0x33321f })));

const bulbGeo = new THREE.SphereGeometry(0.15, 8, 8);
pts.forEach(function (p, idx) {
const bulbMat = new THREE.MeshStandardMaterial({ color: 0x554422, emissive: 0xffdd88, emissiveIntensity: 0 });
const bulb = new THREE.Mesh(bulbGeo, bulbMat);
bulb.position.set(p[0], y, p[1]);
dynamicGroup.add(bulb);
let light = null;
if (idx % 2 === 0) {
light = new THREE.PointLight(0xffdd88, 0, 26, 1.5);
light.position.set(p[0], y, p[1]);
dynamicGroup.add(light);
}
rigs.push({ bulb: bulb, light: light });
});
return rigs;
}

function applyLighting() {
if (!scene) return;
if (isNight) {
scene.background = new THREE.Color(0x162b4d);
ambientLight.intensity = 0.6;
ambientLight.color.set(0x8fa5cc);
sunLight.intensity = 0.45;
sunLight.color.set(0xaebedd);
if (hemiLight) {
hemiLight.intensity = 0.45;
hemiLight.color.set(0x3b4d7a);
hemiLight.groundColor.set(0x22331f);
}
if (groundMaterial) groundMaterial.color.set(0x314d2c);
stringLightRigs.forEach(function (rig) {
if (rig.light) rig.light.intensity = 6;
rig.bulb.material.emissiveIntensity = 1.6;
});
} else {
scene.background = new THREE.Color(0xbfe3ff);
ambientLight.intensity = 0.75;
ambientLight.color.set(0xffffff);
sunLight.intensity = 1.0;
sunLight.color.set(0xffffff);
if (hemiLight) {
hemiLight.intensity = 0.6;
hemiLight.color.set(0xbfe3ff);
hemiLight.groundColor.set(0x7cb87c);
}
if (groundMaterial) groundMaterial.color.set(0x7cb87c);
stringLightRigs.forEach(function (rig) {
if (rig.light) rig.light.intensity = 0;
rig.bulb.material.emissiveIntensity = 0;
});
}
}

function rebuildScene(data) {
currentTent = data.tent;
clearDynamicGroup();
stringLightRigs = [];

dynamicGroup.add(addGround(currentTent));
dynamicGroup.add(addTentGroup(currentTent));

const halfW = currentTent.widthFt / 2;
const halfL = currentTent.lengthFt / 2;

(data.objects || []).forEach(function (item) {
let local;
if (item.kind === 'table') {
local = tableLocalGroup(item);
} else if (item.kind === 'dance') {
local = danceLocalGroup(item);
} else {
return;
}
const cx = item.x + item.widthFt / 2 - halfW;
const cz = item.y + item.depthFt / 2 - halfL;
local.position.set(cx, 0, cz);
local.userData = {
itemId: item.id,
kind: item.kind,
widthFt: item.widthFt,
depthFt: item.depthFt,
x: item.x,
y: item.y,
};
const sev = data.severityMap && data.severityMap[item.id];
if (sev) {
const color = sev === 'error' ? 0xb91c1c : 0xb45309;
local.add(highlightRing(item.widthFt, item.depthFt, color));
} else if (data.selectedId && data.selectedId === item.id) {
local.add(highlightRing(item.widthFt, item.depthFt, 0x2f7a3c));
}
dynamicGroup.add(local);
});

if (data.lightingOn) {
stringLightRigs = addStringLights(currentTent);
}

applyLighting();
}

function frameCameraForTent(tent) {
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const roofY = WALL_H + POLE_PEAK_H;
const radius = Math.sqrt(halfW * halfW + halfL * halfL + roofY * roofY) * 1.08;
const vFov = (camera.fov * Math.PI) / 180;
const dist = radius / Math.tan(vFov / 2);
const dirLen = Math.sqrt(0.9 * 0.9 + 0.7 * 0.7 + 0.9 * 0.9);
const scale = dist / dirLen;
camera.position.set(scale * 0.9, scale * 0.7, scale * 0.9);
controls.target.set(0, 3, 0);
controls.minDistance = 5;
controls.maxDistance = dist * 3;
controls.update();
}

function getPointerNDC(e) {
const rect = renderer.domElement.getBoundingClientRect();
return new THREE.Vector2(
((e.clientX - rect.left) / rect.width) * 2 - 1,
-((e.clientY - rect.top) / rect.height) * 2 + 1
);
}

function findSelectable(obj) {
let o = obj;
while (o) {
if (o.userData && o.userData.itemId) return o;
o = o.parent;
}
return null;
}

function onPointerDown(e) {
if (e.button !== undefined && e.button !== 0) return;
const ndc = getPointerNDC(e);
raycaster.setFromCamera(ndc, camera);
const intersects = raycaster.intersectObjects(dynamicGroup.children, true);
let hit = null;
for (let i = 0; i < intersects.length; i++) {
const anc = findSelectable(intersects[i].object);
if (anc) { hit = anc; break; }
}
if (!hit) return;
const ip = new THREE.Vector3();
if (!raycaster.ray.intersectPlane(groundPlane, ip)) return;
dragging = true;
dragMoved = false;
dragTarget = hit;
dragStartPoint.copy(ip);
dragOrigX = hit.userData.x;
dragOrigY = hit.userData.y;
dragLiveX = dragOrigX;
dragLiveY = dragOrigY;
controls.enabled = false;
}

function onPointerMove(e) {
if (!dragging || !dragTarget) return;
const ndc = getPointerNDC(e);
raycaster.setFromCamera(ndc, camera);
const ip = new THREE.Vector3();
if (!raycaster.ray.intersectPlane(groundPlane, ip)) return;
const dx = ip.x - dragStartPoint.x;
const dz = ip.z - dragStartPoint.z;
if (Math.abs(dx) > 0.08 || Math.abs(dz) > 0.08) dragMoved = true;
let newX = dragOrigX + dx;
let newY = dragOrigY + dz;
newX = Math.max(0, Math.min(currentTent.widthFt - dragTarget.userData.widthFt, newX));
newY = Math.max(0, Math.min(currentTent.lengthFt - dragTarget.userData.depthFt, newY));
dragLiveX = newX;
dragLiveY = newY;
const halfW = currentTent.widthFt / 2;
const halfL = currentTent.lengthFt / 2;
dragTarget.position.x = newX + dragTarget.userData.widthFt / 2 - halfW;
dragTarget.position.z = newY + dragTarget.userData.depthFt / 2 - halfL;
}

function onPointerUp() {
if (!dragging) return;
dragging = false;
controls.enabled = true;
const target = dragTarget;
dragTarget = null;
if (!target) return;
if (!dragMoved) {
if (callbacks.onSelect) callbacks.onSelect(target.userData.itemId);
} else {
if (callbacks.onMove) callbacks.onMove(target.userData.itemId, dragLiveX, dragLiveY);
}
}

function onResize() {
if (!container || !renderer || !camera) return;
const w = container.clientWidth || 640;
const h = container.clientHeight || 420;
camera.aspect = w / h;
camera.updateProjectionMatrix();
renderer.setSize(w, h);
}

function animate() {
animationId = requestAnimationFrame(animate);
if (controls) controls.update();
if (renderer && scene && camera) renderer.render(scene, camera);
}

export function mount(containerEl, data, cbs) {
container = containerEl;
container.innerHTML = '';
isNight = false;
callbacks = cbs || {};

const tent = data.tent;
const w = container.clientWidth || 640;
const h = container.clientHeight || 420;

scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3ff);
dynamicGroup = new THREE.Group();
scene.add(dynamicGroup);

camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(w, h);
container.appendChild(renderer.domElement);

controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

frameCameraForTent(tent);
currentTentId = tent.id;

ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);
sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
const dist = Math.max(tent.widthFt, tent.lengthFt);
sunLight.position.set(dist, dist * 1.2, dist * 0.6);
scene.add(sunLight);
hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x7cb87c, 0.6);
scene.add(hemiLight);

raycaster = new THREE.Raycaster();

renderer.domElement.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);

rebuildScene(data);

if (window.ResizeObserver) {
resizeObserver = new ResizeObserver(function () { onResize(); });
resizeObserver.observe(container);
} else {
window.addEventListener('resize', onResize);
}

animate();
}

export function update(data) {
if (!scene) return;
if (data.tent && data.tent.id !== currentTentId) {
currentTentId = data.tent.id;
frameCameraForTent(data.tent);
}
rebuildScene(data);
}

export function toggleDayNight() {
isNight = !isNight;
applyLighting();
return isNight;
}

export function unmount() {
if (animationId) {
cancelAnimationFrame(animationId);
animationId = null;
}
if (resizeObserver && container) {
resizeObserver.disconnect();
resizeObserver = null;
} else {
window.removeEventListener('resize', onResize);
}
if (renderer) {
renderer.domElement.removeEventListener('pointerdown', onPointerDown);
}
window.removeEventListener('pointermove', onPointerMove);
window.removeEventListener('pointerup', onPointerUp);
if (renderer) {
renderer.dispose();
if (renderer.domElement && renderer.domElement.parentNode) {
renderer.domElement.parentNode.removeChild(renderer.domElement);
}
}
if (dynamicGroup) clearDynamicGroup();
if (container) container.innerHTML = '';
renderer = null;
scene = null;
camera = null;
controls = null;
container = null;
ambientLight = null;
sunLight = null;
hemiLight = null;
stringLightRigs = [];
isNight = false;
dynamicGroup = null;
currentTent = null;
currentTentId = null;
callbacks = {};
raycaster = null;
}
