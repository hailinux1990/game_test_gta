/* Headless smoke test for PIXEL CITY (no GPU needed — WebGLRenderer is stubbed).
   Verifies: AK-47 (500 rounds), aim-assist shots, cars brake/stop for the player
   (player never hurt by cars), carjacking occupied cars. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, "..");

/* ---------- black-hole proxy (2D context etc.) ---------- */
function bhFactory() {
  const fn = function () { return bh; };
  const bh = new Proxy(fn, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'length') return 0;
      return bh;
    },
    apply() { return bh; },
    construct() { return bh; },
    set() { return true; }
  });
  return bh;
}
const bh = bhFactory();

/* ---------- fake clock ---------- */
let now = 1000;
global.performance = { now: () => now };

/* ---------- DOM stubs ---------- */
const handlers = {};
function makeEl(id) {
  const el = {
    id, style: {}, dataset: {}, children: [], textContent: '', className: '', offsetWidth: 0,
    _h: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; },
    remove() {},
    addEventListener(t, f) { if (typeof f === 'function') { (el._h[t] = el._h[t] || []).push(f); } },
    getContext() { return bhFactory(); },
    width: id === 'minimap' ? 150 : 300,
    height: 150
  };
  return el;
}
const els = {};
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement(tag) { return makeEl('_' + tag + Math.random()); },
  querySelectorAll() { return []; },
  body: makeEl('body')
};
global.window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener(t, f) { handlers[t] = f; },
  removeEventListener() {},
  touchJoy: null
};

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 0; };

/* ---------- THREE with stubbed renderer ---------- */
const THREE = require(path.join(ROOT, 'lib/three.min.js'));
// mimic the browser: render() refreshes every object's world matrix
THREE.WebGLRenderer = function (opts) {
  this.domElement = opts && opts.canvas;
  this.setPixelRatio = () => {};
  this.setSize = () => {};
  this.render = (sc) => { sc.updateMatrixWorld(true); };
};
global.THREE = THREE;

/* ---------- load game ---------- */
const code = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
vm.runInThisContext(code);

const G = global.window.__GTA__;
let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}
function step(frames) {
  for (let i = 0; i < frames; i++) {
    now += 16;
    const cb = rafCb; rafCb = null;
    if (cb) cb();
  }
}
function key(c) { handlers.keydown({ code: c, preventDefault() {} }); }

/* ---------- start game (now offset ensures first dt > 0) ---------- */
els.startBtn._h.click[0]();
step(10);

const player = G.player;
check('game started, player exists', !!player);
check('world spawned: NPCs=' + G.NPCs.length + ' cars=' + G.cars.length, G.NPCs.length > 40 && G.cars.length >= 15);
check('every AI car has a visible driver mesh', G.cars.every(c => c.driverMesh !== null));

/* move player to a clear road intersection (-17.5,-17.5); settle camera (~2.5 s) */
player.pos.set(-17.5, 0, -17.5);
player.group.position.copy(player.pos);
step(160);

/* ================= TEST 1: AK-47 with 500 rounds ================= */
key('Digit4');
check('weapon 4 selects AK-47', player.weapon === 3);
check('AK-47 starts with 500 rounds', player.ammoStore[3] === 500);

handlers.mousedown({ button: 0 });
step(20);            // ~0.32 s -> several shots at cd=0.10
handlers.mouseup({ button: 0 });
const afterBurst = player.ammoStore[3];
check('AK-47 ammo decreased while firing (' + afterBurst + '/500)', afterBurst < 500 && afterBurst >= 480);
key('KeyR');
check('R reloads AK-47 back to 500', player.ammoStore[3] === 500);

/* ================= TEST 2: aim assist -> precise hit on NPC ================= */
// clear every other NPC and car far away so the lane is guaranteed clean
G.NPCs.forEach(n => { if (n !== undefined) { n.pos.set(400, 0, 400); n.group.position.set(400, 0, 400); } });
G.cars.forEach(c => { c.pos.set(420, 0, 420); c.group.position.set(420, 0, 420); });
const civ = G.NPCs.find(n => n.type === 'civilian' && !n.dead);
civ.dead = false;
civ.pos.set(player.pos.x, 0, player.pos.z + 8);   // straight ahead (+z = screen-centre aim)
civ.group.position.copy(civ.pos);
civ.hp = 40;
step(2);
handlers.mousedown({ button: 0 });
step(6);             // guarantees >= 1 shot (cd = 0.10 s)
handlers.mouseup({ button: 0 });
// crosshair nearly dead-centre -> aim-assist snaps to HEAD (headshot kill),
// slightly off-centre -> chest hit (40 - 30 = 10). Both prove precise assisted fire.
check('aim-assist shot hit the civilian precisely (headshot kill or hp 40 -> 10)',
  (civ.dead && civ.hp <= 0) || civ.hp === 10);
check('exactly one bullet consumed for the assisted shot', player.ammoStore[3] === 499);

/* ================= TEST 3: cars stop for the player, never hurt him ================= */
const car = G.cars[0];
car.dead = false;
car.isPolice = false;
car.driver = null;
car.inCar = undefined;
car.pos.set(player.pos.x, 0, player.pos.z + 5);   // 5 m away, heading toward the player
car.heading = Math.PI;
car.curSpeed = car.maxSpeed;
car.wpIndex = 0;
car.route = [[player.pos.x, player.pos.z], [player.pos.x, player.pos.z]]; // waypoint = player position
for (let i = 0; i < 90; i++) {                     // ~1.5 s of simulation
  now += 16;
  const cb = rafCb; rafCb = null;
  if (cb) cb();
  if (!isFinite(car.heading)) break;
}
const distAfter = car.pos.distanceTo(player.pos);
check('car braked and STOPPED near the player (curSpeed=' + car.curSpeed.toFixed(2) + ')', car.curSpeed < 0.05);
check('car stopped at safe distance (' + distAfter.toFixed(2) + ' m)', distAfter > 2.5);
check('player took ZERO damage from the car (hp=' + player.hp + ')', player.hp === 100);
// park this car far away so it does not interfere with the carjacking test
car.pos.set(420, 0, 420);
car.group.position.set(420, 0, 420);

/* ================= TEST 4: carjacking an occupied car ================= */
const victim = G.cars[1];
victim.stolen = false;
victim.dead = false;
victim.pos.set(player.pos.x + 2, 0, player.pos.z);
victim.group.position.copy(victim.pos);
const npcCountBefore = G.NPCs.length;
player.wanted = 0;                                 // clear ambient crime noise first
const wantedBefore = player.wanted;
key('KeyE');                                       // E next to an occupied car -> jack it
check('player is now driving', player.inCar === victim);
check('car marked as stolen', victim.stolen === true);
check('driver mesh removed from cabin', victim.driverMesh === null);
check('ejected driver spawned as new ped', G.NPCs.length === npcCountBefore + 1);
check('stealing raised the wanted level (' + player.wanted.toFixed(1) + ' stars)', player.wanted > wantedBefore);
key('KeyE');                                       // exit
check('player exited the car', player.inCar === null);
key('KeyE');                                       // re-enter stolen car
check('re-entering a stolen car spawns no extra driver', G.NPCs.length === npcCountBefore + 1 && player.inCar === victim);
key('KeyE');

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
