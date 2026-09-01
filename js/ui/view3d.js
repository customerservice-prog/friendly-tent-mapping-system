// Friendly Event Designer — live 3D designer view
// This module renders the event layout in 3D and is the primary editing
// surface: customers orbit/zoom the camera, click a table or dance floor
// section to select it, and drag it to reposition it inside the tent.
// See FRIENDLY-EVENT-DESIGNER.md.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { byId as chairById } from '../data/chairs.js';
import { byId as tableById } from '../data/tables.js';
import { byId as lightingById } from '../data/lighting.js';

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
const tableDef = tableById(item.tableId);
const silhouette = tableDef ? tableDef.silhouette : 'dining-round';
const topMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.6 });
let radiusForChairs;
const topY = silhouette === 'cocktail-pedestal' ? 3.5 : 2.4;

if (silhouette === 'cocktail-pedestal') {
const r = item.widthFt / 2;
const topGeo = new THREE.CylinderGeometry(r, r, 0.12, 32);
const top = new THREE.Mesh(topGeo, topMat);
top.position.set(0, topY, 0);
group.add(top);
radiusForChairs = r;

const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.4, roughness: 0.5 });
const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, topY - 0.3, 12);
const pole = new THREE.Mesh(poleGeo, poleMat);
pole.position.set(0, (topY - 0.3) / 2 + 0.2, 0);
group.add(pole);

const footGeo = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.2, 24);
const foot = new THREE.Mesh(footGeo, poleMat);
foot.position.set(0, 0.1, 0);
group.add(foot);
} else if (silhouette === 'fillchill-tub') {
const tubMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.1 });
const tubGeo = new THREE.BoxGeometry(item.widthFt, 0.4, item.depthFt);
const tub = new THREE.Mesh(tubGeo, tubMat);
tub.position.set(0, topY, 0);
group.add(tub);

const basinMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5 });
const basinGeo = new THREE.BoxGeometry(Math.max(item.widthFt - 0.4, 0.2), 0.08, Math.max(item.depthFt - 0.4, 0.2));
const basin = new THREE.Mesh(basinGeo, basinMat);
basin.position.set(0, topY + 0.16, 0);
group.add(basin);
radiusForChairs = Math.max(item.widthFt, item.depthFt) / 2;

const legMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b });
const legGeo = new THREE.BoxGeometry(0.18, topY - 0.2, 0.18);
const lx = item.widthFt / 2 - 0.3;
const lz = item.depthFt / 2 - 0.3;
[[-lx, -lz], [lx, -lz], [lx, lz], [-lx, lz]].forEach(function (p) {
const leg = new THREE.Mesh(legGeo, legMat);
leg.position.set(p[0], (topY - 0.2) / 2, p[1]);
group.add(leg);
});
} else if (item.shape === 'round') {
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

if (silhouette === 'banquet-rect') {
const seamMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.7 });
const seamGeo = new THREE.BoxGeometry(0.03, 0.02, item.depthFt - 0.1);
const seam = new THREE.Mesh(seamGeo, seamMat);
seam.position.set(0, topY + 0.075, 0);
group.add(seam);
}
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


function addTentLightingGrid(tent) {
const rigs = [];
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const y = WALL_H + POLE_PEAK_H - 0.5;
const spacing = 5;
const bulbGeo = new THREE.SphereGeometry(0.12, 8, 8);
const cols = [];
for (let x = -halfW + 2.2; x <= halfW - 1.2; x += spacing) cols.push(x);
if (!cols.length) cols.push(0);
const rows = [];
for (let z = -halfL + 2.2; z <= halfL - 1.2; z += spacing) rows.push(z);
if (!rows.length) rows.push(0);
const lineMat = new THREE.LineBasicMaterial({ color: 0x33321f });
cols.forEach(function (x) {
const pts = [new THREE.Vector3(x, y, -halfL), new THREE.Vector3(x, y, halfL)];
dynamicGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
});
rows.forEach(function (z) {
const pts = [new THREE.Vector3(-halfW, y, z), new THREE.Vector3(halfW, y, z)];
dynamicGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
});
let idx = 0;
cols.forEach(function (x) {
rows.forEach(function (z) {
const bulbMat = new THREE.MeshStandardMaterial({ color: 0x554422, emissive: 0xffdd88, emissiveIntensity: 0 });
const bulb = new THREE.Mesh(bulbGeo, bulbMat);
bulb.position.set(x, y, z);
dynamicGroup.add(bulb);
let light = null;
if (idx % 3 === 0) {
light = new THREE.PointLight(0xffdd88, 0, 18, 1.6);
light.position.set(x, y, z);
dynamicGroup.add(light);
}
rigs.push({ bulb: bulb, light: light });
idx++;
});
});
return rigs;
}

function addBistroSwagLights(tent) {
const rigs = [];
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const y = WALL_H + 1.4;
const sag = 1.3;
const bulbGeo = new THREE.SphereGeometry(0.15, 8, 8);
const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a });
function swag(a, b) {
const steps = 16;
const pts = [];
for (let i = 0; i <= steps; i++) {
const tt = i / steps;
const x = a[0] + (b[0] - a[0]) * tt;
const z = a[1] + (b[1] - a[1]) * tt;
const droop = Math.sin(Math.PI * tt) * sag;
pts.push(new THREE.Vector3(x, y - droop, z));
}
dynamicGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
for (let i = 2; i < steps; i += 2) {
const p = pts[i];
const bulbMat = new THREE.MeshStandardMaterial({ color: 0x554422, emissive: 0xffb347, emissiveIntensity: 0 });
const bulb = new THREE.Mesh(bulbGeo, bulbMat);
bulb.position.copy(p);
dynamicGroup.add(bulb);
let light = null;
if (i % 4 === 2) {
light = new THREE.PointLight(0xffb347, 0, 16, 1.6);
light.position.copy(p);
dynamicGroup.add(light);
}
rigs.push({ bulb: bulb, light: light });
}
}
swag([-halfW, -halfL], [halfW, halfL]);
swag([halfW, -halfL], [-halfW, halfL]);
return rigs;
}

function addUplightingPucks(tent, count) {
const rigs = [];
const inset = 0.9;
const w = Math.max(1, tent.widthFt - inset * 2);
const l = Math.max(1, tent.lengthFt - inset * 2);
const perimLen = 2 * (w + l);
const puckGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.2, 12);
const puckMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
const glowGeo = new THREE.SphereGeometry(0.14, 8, 8);
const uplightColor = 0x7c4fe0;
for (let i = 0; i < count; i++) {
const d = count === 1 ? perimLen * 0.5 : (i / count) * perimLen;
let x, z;
if (d < w) { x = -w / 2 + d; z = -l / 2; }
else if (d < w + l) { x = w / 2; z = -l / 2 + (d - w); }
else if (d < 2 * w + l) { x = w / 2 - (d - w - l); z = l / 2; }
else { x = -w / 2; z = l / 2 - (d - 2 * w - l); }
const puck = new THREE.Mesh(puckGeo, puckMat);
puck.position.set(x, 0.1, z);
dynamicGroup.add(puck);
const glowMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, emissive: uplightColor, emissiveIntensity: 0 });
const glow = new THREE.Mesh(glowGeo, glowMat);
glow.position.set(x, 0.28, z);
dynamicGroup.add(glow);
const light = new THREE.PointLight(uplightColor, 0, 9, 2);
light.position.set(x, 1.4, z);
dynamicGroup.add(light);
rigs.push({ bulb: glow, light: light });
}
return rigs;
}

function addChandelier(tent) {
const rigs = [];
const y = WALL_H + POLE_PEAK_H - 0.5;
const group = new THREE.Group();
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 });
const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), goldMat);
rod.position.set(0, y - 0.45, 0);
group.add(rod);
const tiers = [0.55, 0.4, 0.25];
tiers.forEach(function (r, i) {
const torus = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 16), goldMat);
torus.rotation.x = Math.PI / 2;
const ty = y - 0.95 - i * 0.32;
torus.position.set(0, ty, 0);
group.add(torus);
const dropCount = 8;
for (let j = 0; j < dropCount; j++) {
const ang = (j / dropCount) * Math.PI * 2;
const dropMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0, transparent: true, opacity: 0.85 });
const drop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dropMat);
drop.position.set(Math.cos(ang) * r, ty - 0.15, Math.sin(ang) * r);
group.add(drop);
if (i === tiers.length - 1 && j % 2 === 0) rigs.push({ bulb: drop, light: null });
}
});
const centerY = y - 0.95 - (tiers.length - 1) * 0.32 - 0.55;
const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffe9b0, emissiveIntensity: 0 });
const centerBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), bulbMat);
centerBulb.position.set(0, centerY, 0);
group.add(centerBulb);
const light = new THREE.PointLight(0xffe9b0, 0, 22, 1.8);
light.position.set(0, centerY, 0);
group.add(light);
rigs.push({ bulb: centerBulb, light: light });
dynamicGroup.add(group);
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

const lightingOpt = data.lightingId ? lightingById(data.lightingId) : null;
if (lightingOpt && lightingOpt.visual && lightingOpt.visual !== 'none') {
if (lightingOpt.visual === 'grid-canopy') {
stringLightRigs = addTentLightingGrid(currentTent);
} else if (lightingOpt.visual === 'perimeter-swag') {
stringLightRigs = addBistroSwagLights(currentTent);
} else if (lightingOpt.visual === 'uplight-ring') {
stringLightRigs = addUplightingPucks(currentTent, 12);
} else if (lightingOpt.visual === 'uplight-single') {
stringLightRigs = addUplightingPucks(currentTent, 1);
} else if (lightingOpt.visual === 'chandelier') {
stringLightRigs = addChandelier(currentTent);
} else if (lightingOpt.visual === 'perimeter-strand') {
stringLightRigs = addStringLights(currentTent);
}
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
