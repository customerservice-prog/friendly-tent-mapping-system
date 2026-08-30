// Friendly Event Designer — live 3D designer view
// This module renders the event layout in 3D and is the primary editing
// surface: customers orbit/zoom the camera, click a table or dance floor
// section to select it, and drag it to reposition it inside the tent.
// See FRIENDLY-EVENT-DESIGNER.md.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const WALL_H = 9;
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
let stringLightRigs = [];
let isNight = false;
let dynamicGroup = null;
let currentTent = null;
let currentTentId = null;
let callbacks = {};
let raycaster = null;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

let dragging = false;
let dragMoved = false;
let dragTarget = null;
let dragStartPoint = new THREE.Vector3();
let dragOrigX = 0;
let dragOrigY = 0;
let dragLiveX = 0;
let dragLiveY = 0;

function chairColorFor(chairId) {
if (chairId === 'chiavari-gold') return CHAIR_COLOR_GOLD;
if (chairId === 'chiavari-mahogany') return CHAIR_COLOR_MAHOGANY;
if (chairId === 'chiavari-white') return 0xf5f0e6;
return CHAIR_COLOR_DEFAULT;
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

function addTentGroup(tent) {
const group = new THREE.Group();
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;

const bodyGeo = new THREE.BoxGeometry(tent.widthFt, WALL_H, tent.lengthFt);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.set(0, WALL_H / 2, 0);
group.add(body);

const edges = new THREE.EdgesGeometry(bodyGeo);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x2f7a3c });
const edgeLines = new THREE.LineSegments(edges, edgeMat);
edgeLines.position.copy(body.position);
group.add(edgeLines);

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
const poleH = WALL_H + 2.5;
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
const topMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ee });
const legMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a });

let topGeo;
let radiusForChairs;
if (item.shape === 'round') {
const r = item.widthFt / 2;
topGeo = new THREE.CylinderGeometry(r, r, 0.15, 28);
radiusForChairs = r;
} else {
topGeo = new THREE.BoxGeometry(item.widthFt, 0.15, item.depthFt);
radiusForChairs = Math.max(item.widthFt, item.depthFt) / 2;
}
const top = new THREE.Mesh(topGeo, topMat);
top.position.set(0, topY, 0);
group.add(top);

const legGeo = new THREE.CylinderGeometry(0.25, 0.25, topY, 8);
const leg = new THREE.Mesh(legGeo, legMat);
leg.position.set(0, topY / 2, 0);
group.add(leg);

if (item.seatCount > 0) {
const chairMat = new THREE.MeshStandardMaterial({ color: chairColorFor(item.chairId) });
const chairGeo = new THREE.CylinderGeometry(0.35, 0.3, 1.5, 10);
const chairR = radiusForChairs + 1.1;
for (let i = 0; i < item.seatCount; i++) {
const angle = (i / item.seatCount) * Math.PI * 2;
const chair = new THREE.Mesh(chairGeo, chairMat);
chair.position.set(chairR * Math.cos(angle), 0.75, chairR * Math.sin(angle));
group.add(chair);
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
const mat = new THREE.MeshStandardMaterial({ color: 0x7cb87c });
const mesh = new THREE.Mesh(geo, mat);
mesh.rotation.x = -Math.PI / 2;
mesh.position.y = 0;
return mesh;
}

function addStringLights(tent) {
const rigs = [];
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const y = WALL_H + 0.4;
const points = [
[-halfW, -halfL], [0, -halfL], [halfW, -halfL],
[halfW, 0], [halfW, halfL],
[0, halfL], [-halfW, halfL],
[-halfW, 0],
];
const bulbMat = new THREE.MeshStandardMaterial({ color: 0x554422, emissive: 0xffdd88, emissiveIntensity: 0 });
points.forEach(function (p) {
const bulbGeo = new THREE.SphereGeometry(0.18, 8, 8);
const bulb = new THREE.Mesh(bulbGeo, bulbMat.clone());
bulb.position.set(p[0], y, p[1]);
dynamicGroup.add(bulb);
const light = new THREE.PointLight(0xffdd88, 0, 10, 2);
light.position.set(p[0], y, p[1]);
dynamicGroup.add(light);
rigs.push({ bulb: bulb, light: light });
});
return rigs;
}

function applyLighting() {
if (!scene) return;
if (isNight) {
scene.background = new THREE.Color(0x0b1a33);
ambientLight.intensity = 0.28;
ambientLight.color.set(0x5566aa);
sunLight.intensity = 0.12;
sunLight.color.set(0x8899cc);
stringLightRigs.forEach(function (rig) {
rig.light.intensity = 1.1;
rig.bulb.material.emissiveIntensity = 1;
});
} else {
scene.background = new THREE.Color(0xbfe3ff);
ambientLight.intensity = 0.75;
ambientLight.color.set(0xffffff);
sunLight.intensity = 1.0;
sunLight.color.set(0xffffff);
stringLightRigs.forEach(function (rig) {
rig.light.intensity = 0;
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
const dist = Math.max(tent.widthFt, tent.lengthFt);
camera.position.set(dist * 0.9, dist * 0.7, dist * 0.9);
controls.target.set(0, 2, 0);
controls.minDistance = 5;
controls.maxDistance = dist * 4;
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
stringLightRigs = [];
isNight = false;
dynamicGroup = null;
currentTent = null;
currentTentId = null;
callbacks = {};
raycaster = null;
}
