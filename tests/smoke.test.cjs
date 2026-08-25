/* Headless smoke test for PIXEL CITY (no GPU needed — WebGLRenderer is stubbed).
   Run: node tests/smoke.test.cjs
   Verifies: expanded GTA1-style map (river + bridges), AK-47 (500 rounds),
   aim-assist shots, cars brake/stop for the player, carjacking occupied cars,
   shoot-a-car-until-it-explodes with chain reactions. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

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
const handlers = {};
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
step(170);           // let the chase-cam converge: screen-centre aim == straight ahead

const player = G.player;

/* ================= TEST 0: expanded GTA1-style map ================= */
check('game started, player exists', !!player);
check('map expanded to N=' + G.N + ' blocks per side (GTA 1 style)', G.N === 9);
check('river runs through the city', Math.abs(G.RIVER_Z) > 0 && G.RIVER_HALF === 14);
check('water detection works', G.isInsideWater(0, G.RIVER_Z) && !G.isInsideWater(0, G.RIVER_Z - 30));
check('player spawns on open ground (no building/water)',
  !G.isInsideBuilding(player.pos.x, player.pos.z) && !G.isInsideWater(player.pos.x, player.pos.z));
check('world spawned: NPCs=' + G.NPCs.length + ' cars=' + G.cars.length,
  G.NPCs.length === 60 && G.cars.length === 20);
check('every AI car has a visible driver mesh', G.cars.every(c => c.driverMesh !== null));

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
G.NPCs.forEach(n => { n.pos.set(400, 0, 400); n.group.position.set(400, 0, 400); });
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
victim.maxSpeed = 0; victim.curSpeed = 0;         // keep it parked for the test
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
key('KeyE');                                       // exit again

/* ================= TEST 5: shoot a car until it EXPLODES (+ chain reaction) ===== */
G.NPCs.forEach(n => { n.pos.set(400, 0, 400); n.group.position.set(400, 0, 400); });
const c1 = G.cars[2], c2 = G.cars[3];
[c1, c2].forEach(c => {                            // freeze both targets in place
  c.dead = false; c.stolen = true;                 // stolen=true so nothing re-ejects drivers
  c.driverMesh = null;
  c.maxSpeed = 0; c.curSpeed = 0;
  c.laneOffset = 0;                                // centre them on the bullet line
});
c1.pos.set(player.pos.x, 0, player.pos.z + 12);    // straight ahead of the crosshair
c1.group.position.copy(c1.pos);
c1.heading = Math.PI;
c2.pos.set(player.pos.x, 0, player.pos.z + 16);    // 4 m behind c1 -> inside blast chain radius
c2.group.position.copy(c2.pos);
c2.heading = Math.PI;
player.wanted = 0;
const hpBeforeBoom = player.hp;
check('target car alive before shooting', !c1.dead && (c1.shot || 0) === 0);
// aim like a real player: park the crosshair on the road a bit past the car so
// the bullet's descending path passes through the car's body/cabin
function aimCrosshairAtGround(z) {
  const cam = G.camera;
  const rc = new THREE.Raycaster();
  let bestNy = 0, bestErr = Infinity;
  for (let ny = -0.95; ny <= 0.95; ny += 0.01) {
    rc.setFromCamera(new THREE.Vector2(0, ny), cam);
    if (rc.ray.direction.y >= -0.001) continue;
    const t = -rc.ray.origin.y / rc.ray.direction.y;
    const p = rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
    if (Math.abs(p.x - player.pos.x) > 4) continue;
    const err = Math.abs(p.z - z);
    if (err < bestErr) { bestErr = err; bestNy = ny; }
  }
  handlers.mousemove({ clientX: 640, clientY: (1 - bestNy) / 2 * 720 });
}
aimCrosshairAtGround(player.pos.z + 22);
handlers.mousedown({ button: 0 });
step(45);                                          // 3+ AK shots at cd=0.10 s
handlers.mouseup({ button: 0 });
check('car exploded after ' + (c1.shot || 0) + ' bullets', c1.dead === true);
check('wreck is charred black', c1.group.userData.body.material.color.getHex() === 0x181818);
check('explosion raised the wanted level (' + player.wanted.toFixed(1) + ')', player.wanted > 0);
check('hero standing 12 m away took NO blast damage', player.hp === hpBeforeBoom);
check('nearby car caught the chain-reaction fuse', c2.fuseT !== undefined || c2.dead);
step(120);                                         // let the fuse burn out
check('chain reaction blew up the second car', c2.dead === true);
check('dead wrecks removed from bullet targets', !G.hittables.includes(c1.group.userData.body));

/* ================= TEST 6: WANTED -> police car PURSUIT -> officer deploys ===== */
G.NPCs.forEach(n => { n.pos.set(400, 0, 400); n.group.position.set(400, 0, 400); });
const copCar = G.cars.find(c => c.isPolice && !c.dead);
G.cars.forEach(c => { if (c !== copCar) c.dead = true; });   // quiet streets for the test
copCar.dead = false;
copCar.mode = 'traffic';
copCar.deployed = false;
copCar.maxSpeed = 9.5; copCar.curSpeed = 0;
copCar.laneOffset = 0;
copCar.pos.set(player.pos.x, 0, player.pos.z - 30);          // 30 m up the same avenue
copCar.group.position.copy(copCar.pos);
copCar.heading = 0;                                          // facing the hero
const npcsBeforePursuit = G.NPCs.length;
player.inCar = null;
player.wanted = 3;                                           // crime reported: heat is ON
let sawPursuit = false, stoppedClose = false;
for (let i = 0; i < 480; i++) {
  now += 16;
  const cb = rafCb; rafCb = null;
  if (cb) cb();
  if (copCar.mode === 'pursuit') sawPursuit = true;
  const d = copCar.pos.distanceTo(player.pos);
  if (sawPursuit && d <= 11.5 && copCar.curSpeed < 0.05) { stoppedClose = true; break; }
}
check('police cruiser switched to PURSUIT while wanted', sawPursuit);
check('cruiser raced over and STOPPED near the hero (' +
  copCar.pos.distanceTo(player.pos).toFixed(1) + ' m)', stoppedClose);
check('police officer jumped OUT of the stopped cruiser', copCar.deployed === true);
check('exactly one officer deployed', G.NPCs.length === npcsBeforePursuit + 1);
const officer = G.NPCs.find(n => n.type === 'police' && n.state === 'chase' && !n.dead &&
  n.pos.distanceTo(copCar.group.position) < 6);
check('deployed officer hunts on foot right beside the cruiser', !!officer);
check('officer is inside shooting range of the hero (<16 m)',
  !!officer && officer.pos.distanceTo(player.pos) < 16);
player.wanted = 0;                                           // heat off
step(10);
check('cruiser stands down to normal traffic when stars are gone', copCar.mode === 'traffic');
const officerAfter = G.NPCs.find(n => n.type === 'police' && !n.dead &&
  n.pos.distanceTo(copCar.group.position) < 8);
check('deployed officer holsters and stops chasing', !!officerAfter && officerAfter.state !== 'chase');

/* ================= TEST 7: held-weapon models in hand + HUD icon ============== */
const armR = G.player.group.userData.armR;
function heldMount() {
  return armR.children.find(ch => ch.name && ch.name.startsWith('wp-')) || null;
}
function selectAndCheck(digit, mountName, iconName, label) {
  key(digit);
  const m = heldMount();
  check(label + ' model is mounted on the right hand', !!m && m.name === mountName);
  check(label + ' HUD icon shows ' + iconName,
    els.heldIcon.textContent === iconName && els.heldName.textContent === label);
}
selectAndCheck('Digit1', 'wp-fist', '✊', 'TAY');
selectAndCheck('Digit2', 'wp-knife', '🔪', 'DAO');
selectAndCheck('Digit3', 'wp-gun', '🔫', 'SÚNG');
selectAndCheck('Digit4', 'wp-ak', '🔫', 'AK-47');
step(2);   // refresh world matrices via the stubbed render
const akMount = heldMount();
const handPos = new THREE.Vector3().setFromMatrixPosition(akMount.matrixWorld);
check('AK model sits at HAND height (' + handPos.y.toFixed(2) + ' m), not on the floor',
  handPos.y > 0.9 && handPos.y < 1.9);
check('AK muzzle points forward of the player',
  Math.abs(handPos.x - player.pos.x) < 1.2 && handPos.z > player.pos.z - 1);

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
