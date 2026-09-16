import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { byId as linenById } from '../data/linens.js';

let renderer, scene, camera, controls, root, container, ro, raf, state, night = false, ambient, hemi, sun, callbacks = {}, raycaster, pointer, drag = null, danceMesh = null, needsRender = true;
const renderedItems = new Map(), EAVE = 7, M = {}, GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function invalidate() { needsRender = true; }
function mat(k, o) { return M[k] || (M[k] = new THREE.MeshStandardMaterial(o)); }
function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
function cyl(r, h, m, n = 8) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, n), m); }
function tube(a, b, r, m) {
  const d = new THREE.Vector3().subVectors(b, a);
  const q = cyl(r, d.length(), m, 6);
  q.position.copy(a).add(b).multiplyScalar(0.5);
  q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return q;
}

const steel = () => mat('steel', { color: 0xbcc1c4, roughness: 0.3, metalness: 0.65 });
const dark = () => mat('dark', { color: 0x303437, roughness: 0.5 });
const strap = () => mat('strap', { color: 0xe4e0d4, roughness: 0.85 });
const COLORS = {
  'White': 0xf8f7f2, 'Ivory': 0xf0e4c9, 'Champagne': 0xd9c29d, 'Gold': 0xb88b3b,
  'Black': 0x17191c, 'Silver': 0xa9afb5, 'Navy Blue': 0x162b52, 'Royal Blue': 0x1e4da1,
  'Dusty Blue': 0x7895ad, 'Burgundy': 0x641d2b, 'Red': 0xa52527, 'Blush': 0xe5b9b5,
  'Dusty Rose': 0xb87979, 'Pink': 0xe5a7bc, 'Purple': 0x76518e, 'Sage Green': 0x8b9b78,
  'Hunter Emerald Green': 0x285d48
};
function colorFor(n, f = 0xf8f7f2) { return COLORS[n] || f; }

// Crown height based on tent type and width
function crownHeight(type, widthFt) {
  if (type !== 'pole') return EAVE + Math.max(4, widthFt * 0.24);
  if (widthFt <= 20) return EAVE + 7.5;
  if (widthFt < 30) return EAVE + 8.5;
  return EAVE + 10.5;
}

// Peak positions (center pole locations)
function peaks(t) {
  const L = t.lengthFt;
  const a = (t.centerPoles || []).map(p => ({
    x: (p.x ?? t.widthFt / 2) - t.widthFt / 2,
    z: (p.y ?? L / 2) - L / 2
  }));
  return a.length ? a : [{ x: 0, z: 0 }];
}

// Perimeter point locations (spacing every 10ft for pole placement)
function perimeter(t) {
  const hw = t.widthFt / 2, hl = t.lengthFt / 2, p = [];
  for (let x = -hw; x <= hw + 0.01; x += 10) {
    p.push([Math.min(x, hw), -hl], [Math.min(x, hw), hl]);
  }
  for (let z = -hl + 10; z < hl; z += 10) {
    p.push([-hw, z], [hw, z]);
  }
  return p;
}

// Improved roof geometry for pole tents: sharp crowns, realistic saddle transitions
function poleRoof(t) {
  const W = t.widthFt, L = t.lengthFt;
  const h = crownHeight(t.type, W);
  const hw = W / 2, hl = L / 2;
  const ps = peaks(t);
  
  // Higher resolution for realistic curves
  const segW = Math.max(32, Math.round(W * 1.5));
  const segL = Math.max(40, Math.round(L * 1.5));
  const g = new THREE.PlaneGeometry(W, L, segW, segL);
  const a = g.attributes.position;

  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i);
    const z = a.getY(i);
    
    // For each point, find height based on proximity to peaks
    let maxH = EAVE;
    
    ps.forEach((peak, idx) => {
      // Distance from this point to this peak
      const dx = Math.abs(x - peak.x) / hw;
      const zs = ps.map(q => q.z).sort((a, b) => a - b);
      
      // Longitudinal span: distance to neighboring peaks or edge
      let longiSpan = hl;
      if (zs.length > 1) {
        const peakIdx = zs.indexOf(peak.z);
        const prevZ = peakIdx > 0 ? zs[peakIdx - 1] : peak.z - hl;
        const nextZ = peakIdx < zs.length - 1 ? zs[peakIdx + 1] : peak.z + hl;
        longiSpan = Math.max(12, Math.min(
          Math.abs(peak.z - prevZ) / 2,
          Math.abs(nextZ - peak.z) / 2
        ));
      }
      const dz = Math.abs(z - peak.z) / longiSpan;
      
      // Radial distance with separation of lateral vs longitudinal
      // Lateral (width) contributes more sharply to the drop
      const rLateral = dx;
      const rLongi = dz * 0.85; // Slightly gentler in length direction
      const r = Math.min(1, rLateral * rLateral + rLongi * rLongi);
      
      // Sharp peak with realistic parabolic drop: strong exponent for crisp crown
      const candidate = EAVE + (h - EAVE) * Math.pow(Math.max(0, 1 - r), 1.6);
      if (candidate > maxH) maxH = candidate;
    });

    // Edge falloff: sharp drop at perimeter (1.2ft from edge)
    const edgeX = Math.abs(x) > hw - 0.1 ? 0 : Math.min(hw - Math.abs(x), hl - Math.abs(z));
    if (edgeX <= 0.04) {
      maxH = EAVE;
    } else if (edgeX < 1.5) {
      maxH = EAVE + (maxH - EAVE) * Math.pow(edgeX / 1.5, 1.3);
    }

    a.setZ(i, maxH);
  }

  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xfffefa,
    roughness: 0.65,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  const q = new THREE.Mesh(g, roofMat);
  q.castShadow = true;
  q.receiveShadow = true;
  return q;
}

// Frame tent roof: clean ridge roof, no peaks
function frameRoof(t) {
  const W = t.widthFt, L = t.lengthFt;
  const h = EAVE + Math.max(4, W * 0.24);
  const hw = W / 2, hl = L / 2;
  
  const segW = Math.max(24, Math.round(W * 1.2));
  const segL = Math.max(30, Math.round(L * 1.2));
  const g = new THREE.PlaneGeometry(W, L, segW, segL);
  const a = g.attributes.position;

  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i);
    const z = a.getY(i);
    
    // Ridge down the center (along length), symmetric slopes from centerline
    const fromCenterline = Math.abs(x) / hw;
    const ridgeH = h * Math.pow(Math.max(0, 1 - fromCenterline * fromCenterline), 0.95);
    
    // Edge falloff
    const edgeX = Math.min(hw - Math.abs(x), hl - Math.abs(z));
    let finalH = ridgeH;
    if (edgeX <= 0.04) {
      finalH = EAVE;
    } else if (edgeX < 1.2) {
      finalH = EAVE + (ridgeH - EAVE) * Math.pow(edgeX / 1.2, 1.2);
    }

    a.setZ(i, finalH);
  }

  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xfffefa,
    roughness: 0.68,
    metalness: 0.03,
    side: THREE.DoubleSide
  });
  const q = new THREE.Mesh(g, roofMat);
  q.castShadow = true;
  q.receiveShadow = true;
  return q;
}

// Canopy roof: simple paraboloid
function canopyRoof(t) {
  const W = t.widthFt, L = t.lengthFt;
  const h = EAVE + 2.5;
  const hw = W / 2, hl = L / 2;
  
  const segW = Math.max(20, Math.round(W * 1.1));
  const segL = Math.max(20, Math.round(L * 1.1));
  const g = new THREE.PlaneGeometry(W, L, segW, segL);
  const a = g.attributes.position;

  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i);
    const z = a.getY(i);
    const rx = (Math.abs(x) / hw) * (Math.abs(x) / hw);
    const rz = (Math.abs(z) / hl) * (Math.abs(z) / hl);
    const r = Math.max(rx, rz);
    const finalH = EAVE + (h - EAVE) * Math.pow(Math.max(0, 1 - r), 1.1);
    a.setZ(i, finalH);
  }

  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xfffefa,
    roughness: 0.7,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  const q = new THREE.Mesh(g, roofMat);
  q.castShadow = true;
  q.receiveShadow = true;
  return q;
}

// Scalloped valance: hanging fabric edge treatment at eave
function valance(t) {
  const hw = t.widthFt / 2, hl = t.lengthFt / 2;
  const group = new THREE.Group();
  const valMat = new THREE.MeshStandardMaterial({
    color: 0xf5f3ed,
    roughness: 0.8,
    metalness: 0.01,
    side: THREE.FrontSide
  });

  // Corners and edges: scalloped drapes from eave down
  const corners = [
    [-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]
  ];
  const longSides = [
    [-hw, hl, hw, hl], // front
    [-hw, -hl, hw, -hl] // back
  ];
  const shortSides = [
    [hw, -hl, hw, hl], // right
    [-hw, -hl, -hw, hl] // left
  ];

  // Corner scallops: 4 corners, deep drapes
  corners.forEach(([x, z]) => {
    const scallop = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 0.6, 8),
      valMat
    );
    scallop.position.set(x, EAVE - 0.3, z);
    scallop.scale.set(1, 1, 1);
    group.add(scallop);
  });

  // Long sides: distributed shallow scallops
  longSides.forEach(([x1, z1, x2, z2]) => {
    const sideLen = Math.abs(x2 - x1) || Math.abs(z2 - z1);
    const numScallops = Math.max(2, Math.floor(sideLen / 8));
    for (let i = 0; i < numScallops; i++) {
      const t = (i + 0.5) / numScallops;
      const sx = x1 + (x2 - x1) * t;
      const sz = z1 + (z2 - z1) * t;
      const scallop = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 0.5, 8),
        valMat
      );
      scallop.position.set(sx, EAVE - 0.25, sz);
      group.add(scallop);
    }
  });

  // Short sides: distributed scallops
  shortSides.forEach(([x1, z1, x2, z2]) => {
    const sideLen = Math.abs(z2 - z1);
    const numScallops = Math.max(2, Math.floor(sideLen / 8));
    for (let i = 0; i < numScallops; i++) {
      const t = (i + 0.5) / numScallops;
      const sx = x1 + (x2 - x1) * t;
      const sz = z1 + (z2 - z1) * t;
      const scallop = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 0.5, 8),
        valMat
      );
      scallop.position.set(sx, EAVE - 0.25, sz);
      group.add(scallop);
    }
  });

  return group;
}

// Main tent structure
function tent(t, anchor) {
  const g = new THREE.Group();
  const hw = t.widthFt / 2, hl = t.lengthFt / 2;
  const h = crownHeight(t.type, t.widthFt);
  const pp = perimeter(t);
  const vm = mat('val', { color: 0xfffefa, roughness: 0.76 });

  // Roof based on tent type
  if (t.type === 'pole') {
    g.add(poleRoof(t));
  } else if (t.type === 'frame') {
    g.add(frameRoof(t));
  } else if (t.type === 'canopy') {
    g.add(canopyRoof(t));
  }

  // Valance edge treatment
  g.add(valance(t));

  // Eave beam (simplified thin profile now that we have valance)
  [[0, -hl, t.widthFt, 0.04], [0, hl, t.widthFt, 0.04], [-hw, 0, 0.04, t.lengthFt], [hw, 0, 0.04, t.lengthFt]].forEach(v => {
    const q = box(v[2], 0.25, v[3], vm);
    q.position.set(v[0], EAVE - 0.125, v[1]);
    g.add(q);
  });

  // Perimeter eave poles (0.035m radius, crisp look)
  pp.forEach(([x, z]) => {
    const p = cyl(0.035, EAVE, steel());
    p.position.set(x, EAVE / 2, z);
    p.castShadow = true;
    p.receiveShadow = true;
    g.add(p);
  });

  // Center poles: larger (0.08m radius) for pole tents only
  if (t.type === 'pole') {
    peaks(t).forEach(p => {
      const q = cyl(0.08, h + 0.8, steel());
      q.position.set(p.x, (h + 0.8) / 2, p.z);
      q.castShadow = true;
      q.receiveShadow = true;
      g.add(q);
    });
  }

  // Guy straps and stakes
  const c = t.installationClearanceFt || 5;
  pp.forEach(([x, z]) => {
    const ex = Math.abs(x) > hw - 0.1;
    const ez = Math.abs(z) > hl - 0.1;
    const ox = x + (ex ? Math.sign(x) * c : 0);
    const oz = z + (ez ? Math.sign(z) * c : 0);

    if (anchor === 'stake') {
      // Guy strap from pole top to ground stake
      const strapStart = new THREE.Vector3(x, EAVE - 0.08, z);
      const stakePos = new THREE.Vector3(ox, 0.08, oz);
      g.add(tube(strapStart, stakePos, 0.012, strap()));

      // Ratchet hardware at ~55% along strap
      const dir = stakePos.clone().sub(strapStart).normalize();
      const ratchet = box(0.12, 0.09, 0.05, steel());
      ratchet.position.copy(strapStart.clone().lerp(stakePos, 0.55));
      ratchet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      ratchet.castShadow = true;
      g.add(ratchet);

      // Ground stake at ground level
      const stake = cyl(0.018, 0.55, dark(), 6);
      stake.position.copy(stakePos).add(dir.clone().multiplyScalar(0.08));
      stake.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      stake.castShadow = true;
      g.add(stake);
    }
  });

  return g;
}

function chair() {
  const g = new THREE.Group();
  const m = mat('chair', { color: 0xf7f7f2, roughness: 0.55 });
  const s = box(1.05, 0.08, 0.95, m);
  s.position.y = 0.88;
  g.add(s);
  const b = box(1.03, 0.9, 0.055, m);
  b.position.set(0, 1.48, -0.43);
  g.add(b);
  return g;
}

function placeSetting(g, x, z, a, c) {
  const plate = cyl(0.3, 0.025, mat('plate', { color: 0xfafafa, roughness: 0.35 }), 12);
  plate.position.set(x, 2.5, z);
  g.add(plate);
  const nap = box(0.2, 0.025, 0.34, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  nap.position.set(x, 2.53, z);
  nap.rotation.y = -a;
  g.add(nap);
}

function table(o) {
  const g = new THREE.Group();
  const w = o.widthFt || 5, d = o.depthFt || 5, h = 2.45;
  const round = o.shape === 'round' || Math.abs(w - d) < 0.2;
  const linen = linenById(o.linenId);
  const lc = colorFor(o.linenColor || o.color || 'White');
  const tm = new THREE.MeshStandardMaterial({ color: linen ? lc : 0xb88d61, roughness: linen ? 0.88 : 0.58 });

  if (round) {
    const r = w / 2;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, h, 24, 1, true), tm);
    skirt.position.y = h / 2;
    g.add(skirt);
    const top = cyl(r, 0.06, tm, 24);
    top.position.y = h;
    g.add(top);
  } else {
    const q = box(w, linen ? h : 0.16, d, tm);
    q.position.y = linen ? h / 2 : h;
    g.add(q);
  }

  const n = o.seatCount || 0;
  const rr = Math.max(w, d) / 2 + 1;
  const nc = colorFor(o.napkinColor || o.linenColor || 'White');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = chair();
    c.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    c.rotation.y = -a - Math.PI / 2;
    g.add(c);
    if (round) placeSetting(g, Math.cos(a) * (w * 0.31), Math.sin(a) * (w * 0.31), a, nc);
  }

  g.userData = { itemId: o.id, kind: 'table' };
  g.traverse(m => m.userData.itemId = o.id);
  return g;
}

function danceGroup(items, t) {
  const g = new THREE.Group();
  if (!items.length) return g;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  items.forEach(o => {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.widthFt);
    maxY = Math.max(maxY, o.y + o.depthFt);
  });

  const w = maxX - minX, d = maxY - minY;
  const b = box(w, 0.08, d, dark());
  b.position.y = 0.04;
  g.add(b);

  const wm = mat('wood', { color: 0xb57c45, roughness: 0.5 });
  for (let x = -w / 2; x < w / 2; x += 3) {
    for (let z = -d / 2; z < d / 2; z += 3) {
      const pw = Math.min(3, w - (x + w / 2)), pd = Math.min(3, d - (z + d / 2));
      const p = box(pw - 0.03, 0.045, pd - 0.03, wm);
      p.position.set(x + pw / 2, 0.105, z + pd / 2);
      g.add(p);
    }
  }

  g.position.set((minX + maxX) / 2 - t.widthFt / 2, 0, (minY + maxY) / 2 - t.lengthFt / 2);
  g.userData = { kind: 'danceGroup', itemIds: items.map(o => o.id) };
  g.traverse(m => { m.userData.kind = 'danceGroup'; m.userData.itemIds = g.userData.itemIds; });
  return g;
}

function ground(t) {
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(t.widthFt + 100, t.lengthFt + 100),
    mat('ground', { color: 0x829d68, roughness: 1 })
  );
  p.rotation.x = -Math.PI / 2;
  p.receiveShadow = true;
  return p;
}

function clear() {
  while (root && root.children.length) root.remove(root.children[0]);
  renderedItems.clear();
  danceMesh = null;
}

function rebuild(d) {
  state = d;
  clear();
  const t = d?.tent;
  if (!t) return;

  root.add(ground(t), tent(t, d.anchoringMethod));

  const hw = t.widthFt / 2, hl = t.lengthFt / 2;
  const dance = [];
  (d.objects || []).forEach(o => {
    if (o.kind === 'dance') { dance.push(o); return; }
    if (o.kind !== 'table') return;
    const q = table(o);
    q.position.set(o.x + o.widthFt / 2 - hw, 0, o.y + o.depthFt / 2 - hl);
    renderedItems.set(o.id, q);
    root.add(q);
  });

  if (dance.length) {
    danceMesh = danceGroup(dance, t);
    root.add(danceMesh);
  }

  apply();
  invalidate();
}

function apply() {
  if (!scene) return;
  scene.background = new THREE.Color(night ? 0x18263b : 0xe7eef1);
  scene.fog.color.copy(scene.background);
  ambient.intensity = night ? 0.2 : 0.58;
  hemi.intensity = night ? 0.32 : 1.15;
  sun.intensity = night ? 0.08 : 2.1;
  renderer.toneMappingExposure = night ? 0.9 : 1.05;
  invalidate();
}

function pointerRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster;
}

function groundPoint(e) {
  const out = new THREE.Vector3();
  return pointerRay(e).ray.intersectPlane(GROUND, out) ? out : null;
}

function hit(e) {
  pointerRay(e);
  return raycaster.intersectObjects(root.children, true).find(h => h.object.userData.itemId || h.object.userData.kind === 'danceGroup');
}

function down(e) {
  const h = hit(e);
  if (!h) return;
  const ud = h.object.userData, p = groundPoint(e);
  if (!p) return;

  if (ud.kind === 'danceGroup') {
    const ids = ud.itemIds || [], objs = state.objects.filter(o => ids.includes(o.id));
    if (!objs.length) return;
    drag = { kind: 'dance', ids, start: p.clone(), orig: objs.map(o => ({ id: o.id, x: o.x, y: o.y })), meshStart: danceMesh?.position.clone() };
    callbacks.onSelect?.(ids[0]);
  } else if (ud.itemId) {
    const o = state.objects.find(x => x.id === ud.itemId);
    if (!o) return;
    drag = { kind: 'item', id: ud.itemId, start: p.clone(), orig: { ...o } };
    callbacks.onSelect?.(ud.itemId);
  }

  if (drag) {
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
    renderer.domElement.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
}

function move(e) {
  if (!drag) return;
  const p = groundPoint(e);
  if (!p) return;
  const t = state.tent, dx = p.x - drag.start.x, dz = p.z - drag.start.z;

  if (drag.kind === 'dance') {
    const orig = drag.orig, objs = state.objects.filter(o => drag.ids.includes(o.id));
    const minX = Math.min(...orig.map(o => o.x)), minY = Math.min(...orig.map(o => o.y));
    const maxX = Math.max(...orig.map(o => { const live = objs.find(x => x.id === o.id); return o.x + (live?.widthFt || 0); }));
    const maxY = Math.max(...orig.map(o => { const live = objs.find(x => x.id === o.id); return o.y + (live?.depthFt || 0); }));
    const cx = Math.max(-minX, Math.min(t.widthFt - maxX, dx));
    const cy = Math.max(-minY, Math.min(t.lengthFt - maxY, dz));

    orig.forEach(o => {
      const live = state.objects.find(x => x.id === o.id);
      if (live) {
        live.x = o.x + cx;
        live.y = o.y + cy;
      }
    });

    if (danceMesh && drag.meshStart) danceMesh.position.set(drag.meshStart.x + cx, drag.meshStart.y, drag.meshStart.z + cy);
  } else {
    const o = drag.orig, live = state.objects.find(x => x.id === drag.id);
    if (live) {
      live.x = Math.max(0, Math.min(t.widthFt - o.widthFt, o.x + dx));
      live.y = Math.max(0, Math.min(t.lengthFt - o.depthFt, o.y + dz));
      const mesh = renderedItems.get(live.id);
      if (mesh) mesh.position.set(live.x + live.widthFt / 2 - t.widthFt / 2, 0, live.y + live.depthFt / 2 - t.lengthFt / 2);
    }
  }

  invalidate();
  e.preventDefault();
}

function up(e) {
  if (!drag) return;
  if (drag.kind === 'dance') {
    drag.ids.forEach(id => {
      const o = state.objects.find(x => x.id === id);
      if (o) callbacks.onMove?.(id, o.x, o.y);
    });
  } else {
    const o = state.objects.find(x => x.id === drag.id);
    if (o) callbacks.onMove?.(o.id, o.x, o.y);
  }
  drag = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = 'grab';
  try { renderer.domElement.releasePointerCapture?.(e.pointerId); } catch (_) { }
  invalidate();
}

function frame(t) {
  const h = crownHeight(t.type, t.widthFt), hw = t.widthFt / 2, hl = t.lengthFt / 2;
  const radius = Math.sqrt(hw * hw + hl * hl + h * h) * 1.05;
  const fov = (camera.fov || 38) * Math.PI / 180;
  const d = Math.max(radius / Math.sin(fov / 2), Math.max(t.widthFt, t.lengthFt) * 0.9);
  camera.position.set(d * 0.62, d * 0.34, d * 0.72);
  controls.target.set(0, Math.min(h * 0.4, 6), 0);
  controls.update();
  invalidate();
}

function sizeCanvas() {
  if (!renderer || !container) return;
  const w = Math.max(320, Math.round(container.clientWidth));
  const h = Math.max(360, Math.round(container.clientHeight));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, true);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  invalidate();
}

function loop() {
  raf = requestAnimationFrame(loop);
  controls?.update();
  if (needsRender) {
    renderer?.render(scene, camera);
    needsRender = false;
  }
}

export function mount(el, data, cbs = {}) {
  unmount();
  callbacks = cbs;
  container = el;
  container.innerHTML = '';
  night = false;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe7eef1, 150, 420);
  root = new THREE.Group();
  scene.add(root);

  const w = Math.max(320, Math.round(el.clientWidth));
  const h = Math.max(360, Math.round(el.clientHeight));
  camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });

  const mobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setSize(w, h, true);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';

  el.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.addEventListener('change', invalidate);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerup', up);
  renderer.domElement.addEventListener('pointercancel', up);

  ambient = new THREE.AmbientLight(0xffffff, 0.58);
  hemi = new THREE.HemisphereLight(0xe9f4ff, 0x50653d, 1.15);
  sun = new THREE.DirectionalLight(0xfff4e4, 2.1);

  const s = Math.max(data.tent.widthFt, data.tent.lengthFt);
  sun.position.set(s * 0.62, s * 1.18, s * 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -s;
  sun.shadow.camera.right = sun.shadow.camera.top = s;
  sun.shadow.camera.far = s * 4;

  scene.add(ambient, hemi, sun);

  frame(data.tent);
  rebuild(data);

  ro = new ResizeObserver(sizeCanvas);
  ro.observe(el);
  loop();
}

export function update(data) {
  if (!scene) return;
  rebuild(data);
}

export function focusItem(id) {
  if (!state) return;
  const o = state.objects.find(x => x.id === id);
  if (!o) return;
  const t = state.tent;
  controls.target.set(o.x + o.widthFt / 2 - t.widthFt / 2, 1.8, o.y + o.depthFt / 2 - t.lengthFt / 2);
  camera.position.copy(controls.target).add(new THREE.Vector3(6, 5, 6));
  controls.update();
  invalidate();
}

export function toggleDayNight() {
  night = !night;
  apply();
  return night;
}

export function unmount() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  ro?.disconnect();
  ro = null;
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', down);
    renderer.domElement.removeEventListener('pointermove', move);
    renderer.domElement.removeEventListener('pointerup', up);
    renderer.domElement.removeEventListener('pointercancel', up);
  }
  controls?.dispose();
  renderer?.dispose();
  if (container) container.innerHTML = '';
  renderedItems.clear();
  danceMesh = null;
  renderer = scene = camera = controls = root = container = null;
  callbacks = {};
  drag = null;
}

