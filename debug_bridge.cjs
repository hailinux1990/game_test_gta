/* Debug: why do characters/vehicles vanish on bridges? */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname);

function bhFactory() {
  const fn = function () { return bh; };
  const bh = new Proxy(fn, {
    get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'length') return 0; return bh; },
    apply() { return bh; }, construct() { return bh; }, set() { return true; }
  });
  return bh;
}
const bh = bhFactory();
let now = 1000;
global.performance = { now: () => now };
function makeEl(id) {
  const el = { id, style: {}, dataset: {}, children: [], textContent: '', className: '', offsetWidth: 0,
    _h: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; }, remove() {},
    addEventListener(t, f) { if (typeof f === 'function') { (el._h[t] = el._h[t] || []).push(f); } },
    getContext() { return bhFactory(); }, width: id === 'minimap' ? 150 : 300, height: 150 };
  return el;
}
const els = {}; const handlers = {};
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement(tag) { return makeEl('_' + tag + Math.random()); },
  querySelectorAll() { return []; }, body: makeEl('body')
};
global.window = { innerWidth: 1280, innerHeight: 720, addEventListener(t, f) { handlers[t] = f; }, removeEventListener() {}, touchJoy: null };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 0; };

const THREE = require(path.join(ROOT, 'lib/three.min.js'));
THREE.WebGLRenderer = function (opts) {
  this.domElement = opts && opts.canvas; this.setPixelRatio = () => {}; this.setSize = () => {};
  this.render = (sc) => { sc.updateMatrixWorld(true); };
};
global.THREE = THREE;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8'));

const G = global.window.__GTA__;
function step(frames) {
  for (let i = 0; i < frames; i++) { now += 16; const cb = rafCb; rafCb = null; if (cb) cb(); }
}
els.startBtn._h.click[0]();
step(170);
const player = G.player;

/* ---- put the hero mid-bridge and see what hides him ---- */
const bx = -17.5, bz = G.RIVER_Z;          // road index 4? use cx(4)-ish: just sample several
for (let i = 0; i <= G.N; i++) {
  const cxv = -192.5 + i * 35;
  const gy = G.groundY(cxv, bz);
  console.log(`bridge col ${i}: groundY(${cxv.toFixed(0)}, ${bz}) = ${gy}`);
}
// teleport hero to middle of column 4 deck
player.pos.set(-52.5, 0, bz);
player.group.position.copy(player.pos);
step(20);
console.log('\nhero on deck: group.position =', player.group.position.toArray().map(v=>+v.toFixed(2)),
            ' pos =', player.pos.toArray().map(v=>+v.toFixed(2)), ' camY =', +G.camera.position.y.toFixed(2));

const rc = new THREE.Raycaster();
const target = player.group.position.clone().add(new THREE.Vector3(0, 0.9, 0));
rc.set(G.camera.position.clone(), target.clone().sub(G.camera.position).normalize());
rc.far = 200;
const hits = rc.intersectObjects(G.scene.children, true);
console.log('\nRaycast camera->hero hits:', hits.length);
hits.slice(0, 8).forEach((h, k) => {
  const m = h.object;
  console.log(` #${k} d=${h.distance.toFixed(1)} type=${m.geometry&&m.geometry.type} y=${m.position&&m.position.y&&m.position.y.toFixed(2)} ` +
    `visible=${m.visible} matType=${m.material&&(Array.isArray(m.material)?m.material.map(x=>x.type):m.material.type)} ` +
    `${m.material&&!Array.isArray(m.material)&&m.material.opacity!==undefined?'op='+m.material.opacity:''}` +
    `${m.material&&Array.isArray(m.material)?' ops='+m.material.map(x=>x.opacity).join(','):''}`);
});
// same for a regular NPC placed on the deck
const npc = G.NPCs.find(n => !n.dead);
npc.pos.set(-49.0, 0, bz + 3);
npc.group.position.copy(npc.pos);
step(10);
const t2 = npc.group.position.clone().add(new THREE.Vector3(0, 0.9, 0));
rc.set(G.camera.position.clone(), t2.clone().sub(G.camera.position).normalize());
const h2 = rc.intersectObjects(G.scene.children, true);
console.log('\nRaycast camera->NPC-on-deck hits:', h2.length);
h2.slice(0, 6).forEach((h, k) => {
  const m = h.object;
  console.log(` #${k} d=${h.distance.toFixed(1)} type=${m.geometry&&m.geometry.type} y=${m.position&&m.position.y&&m.position.y.toFixed(2)} visible=${m.visible}`);
});

/* ---- ramp surface probe: does groundY match the rendered ramps? ---- */
console.log('\ngroundY profile across river at x=-52.5:');
for (let dz = -40; dz <= 40; dz += 4) {
  const z = bz + dz;
  console.log(`  dz=${String(dz).padStart(3)} -> groundY=${G.groundY(-52.5, z).toFixed(2)} isWater=${G.isInsideWater(-52.5, z)}`);
}
/* find actual ramp/deck meshes in scene near column x=-52.5 */
console.log('\nmeshes with world y>0.1 near bridge column (within 25 of x=-52.5):');
G.scene.updateMatrixWorld(true);
const found = [];
G.scene.traverse(o => {
  if (o.isMesh && Math.abs(o.getWorldPosition(new THREE.Vector3()).x + 52.5) < 25 &&
      o.getWorldPosition(new THREE.Vector3()).y > 0.1 &&
      Math.abs(o.getWorldPosition(new THREE.Vector3()).z - bz) < 30) {
    const bb = new THREE.Box3().setFromObject(o);
    found.push({ o, bb });
  }
});
found.slice(0, 14).forEach(f => {
  const mn = f.bb.min, mx = f.bb.max;
  console.log(`  ${f.o.geometry.type}: x[${mn.x.toFixed(1)},${mx.x.toFixed(1)}] y[${mn.y.toFixed(2)},${mx.y.toFixed(2)}] z[${mn.z.toFixed(1)},${mx.z.toFixed(1)}]`);
});
