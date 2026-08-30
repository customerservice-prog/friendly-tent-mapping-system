// Friendly Event Designer — 3D customer preview (read-only)
// This module is only fetched when the customer opens "View in 3D" from the
// designer screen. It renders a simple, non-editable preview of the finished
// layout (tent, tables, chairs, dance floor) with a day/night lighting toggle.
// Explicitly NOT an editing mode — see FRIENDLY-EVENT-DESIGNER.md Phase 2.

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

function chairColorFor(chairId) {
if (chairId === 'chiavari-gold') return CHAIR_COLOR_GOLD;
if (chairId === 'chiavari-mahogany') return CHAIR_COLOR_MAHOGANY;
if (chairId === 'chiavari-white') return 0xf5f0e6;
return CHAIR_COLOR_DEFAULT;
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
function addTableGroup(item, tent) {
const group = new THREE.Group();
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const cx = item.x + item.widthFt / 2 - halfW;
const cz = item.y + item.depthFt / 2 - halfL;
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
top.position.set(cx, topY, cz);
group.add(top);

const legGeo = new THREE.CylinderGeometry(0.25, 0.25, topY, 8);
const leg = new THREE.Mesh(legGeo, legMat);
leg.position.set(cx, topY / 2, cz);
group.add(leg);

if (item.seatCount > 0) {
const chairMat = new THREE.MeshStandardMaterial({ color: chairColorFor(item.chairId) });
const chairGeo = new THREE.CylinderGeometry(0.35, 0.3, 1.5, 10);
const chairR = radiusForChairs + 1.1;
for (let i = 0; i < item.seatCount; i++) {
const angle = (i / item.seatCount) * Math.PI * 2;
const chair = new THREE.Mesh(chairGeo, chairMat);
chair.position.set(cx + chairR * Math.cos(angle), 0.75, cz + chairR * Math.sin(angle));
group.add(chair);
}
}
return group;
}

function addDanceGroup(item, tent) {
const halfW = tent.widthFt / 2;
const halfL = tent.lengthFt / 2;
const cx = item.x + item.widthFt / 2 - halfW;
const cz = item.y + item.depthFt / 2 - halfL;
const col = Math.round(item.x / item.widthFt);
const row = Math.round(item.y / item.depthFt);
const light = (col + row) % 2 === 0;
const mat = new THREE.MeshStandardMaterial({ color: light ? 0xf2e7c6 : 0xffffff });
const geo = new THREE.BoxGeometry(item.widthFt, 0.1, item.depthFt);
const mesh = new THREE.Mesh(geo, mat);
mesh.position.set(cx, 0.06, cz);
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
scene.add(bulb);
const light = new THREE.PointLight(0xffdd88, 0, 10, 2);
light.position.set(p[0], y, p[1]);
scene.add(light);
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

export function mount(containerEl, data) {
container = containerEl;
container.innerHTML = '';
isNight = false;
stringLightRigs = [];

const tent = data.tent;
const w = container.clientWidth || 640;
const h = container.clientHeight || 420;

scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3ff);

camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
const dist = Math.max(tent.widthFt, tent.lengthFt);
camera.position.set(dist * 0.9, dist * 0.7, dist * 0.9);

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(w, h);
container.appendChild(renderer.domElement);

controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 2, 0);
controls.minDistance = 5;
controls.maxDistance = dist * 4;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);
sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(dist, dist * 1.2, dist * 0.6);
scene.add(sunLight);

scene.add(addGround(tent));
scene.add(addTentGroup(tent));

(data.objects || []).forEach(function (item) {
if (item.kind === 'table') {
scene.add(addTableGroup(item, tent));
} else if (item.kind === 'dance') {
scene.add(addDanceGroup(item, tent));
}
});

if (data.lightingOn) {
stringLightRigs = addStringLights(tent);
}

applyLighting();

if (window.ResizeObserver) {
resizeObserver = new ResizeObserver(function () { onResize(); });
resizeObserver.observe(container);
} else {
window.addEventListener('resize', onResize);
}

animate();
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
renderer.dispose();
if (renderer.domElement && renderer.domElement.parentNode) {
renderer.domElement.parentNode.removeChild(renderer.domElement);
}
}
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
}
