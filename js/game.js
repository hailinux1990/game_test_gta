/* ============================================================
   PIXEL CITY — open-world top-down 3D (GTA Chinatown Wars style)
   Three.js r128, no external assets, all procedural.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Config ---------------- */
  const PIXEL_SCALE = 2;          // render at 1/N resolution, upscale -> pixel look
  const CELL = 35;                // block + road pitch
  const ROAD = 9;                 // road width
  const BLOCK = CELL - ROAD;      // buildable block width (26)
  const N = 5;                    // blocks per side -> roads 0..N
  const CITY = N * CELL;          // 175
  const CENTER = CITY / 2;        // 87.5
  const GROUND_HALF = CENTER + 22;

  const COLORS = {
    ground: 0x2c3138, road: 0x23272e, sidewalk: 0x777d86, grass: 0x2f4a2f,
    line: 0xd8d8d8, building: [0x7a6a5a, 0x9a8571, 0x6f7f8f, 0x8a7f8a, 0x5f6a5f, 0x8a7266, 0x75838a, 0x7f6a7a]
  };

  /* ---------------- Seeded RNG ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20240824);

  const cx = (i) => i * CELL - CENTER;   // x of vertical road i
  const cz = (j) => j * CELL - CENTER;   // z of horizontal road j

  /* ---------------- Audio (procedural) ---------------- */
  const Sfx = {
    ctx: null, master: null, enabled: true,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    tone(freq, dur, type, vol, slideTo) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 2000;
      const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    },
    shoot() { this.noise(0.12, 0.5, 2600); this.tone(140, 0.09, 'square', 0.25, 50); },
    punch() { this.tone(200, 0.07, 'square', 0.22, 90); this.noise(0.05, 0.15, 700); },
    knife() { this.noise(0.08, 0.2, 5200); this.tone(900, 0.06, 'sawtooth', 0.1, 300); },
    hit() { this.tone(90, 0.09, 'square', 0.28, 40); this.noise(0.06, 0.2, 500); },
    blood() { this.noise(0.06, 0.12, 400); },
    die() { this.tone(220, 0.5, 'sawtooth', 0.25, 40); },
    click() { this.tone(700, 0.04, 'square', 0.12, 900); },
    car() { this.tone(80, 0.2, 'sawtooth', 0.2, 140); },
    warn() { this.tone(880, 0.12, 'square', 0.18); setTimeout(() => this.tone(660, 0.14, 'square', 0.18), 140); }
  };

  /* ---------------- Renderer / Scene ---------------- */
  const canvas = document.getElementById('game');
  let renderer, scene, camera;
  let W = window.innerWidth, H = window.innerHeight;

  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1 / PIXEL_SCALE);
    renderer.setSize(W, H, false);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f13);
    scene.fog = new THREE.Fog(0x0d0f13, 120, 320);

    camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 600);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const hemi = new THREE.HemisphereLight(0xdfe7ff, 0x3a2f24, 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 0.9);
    sun.position.set(-60, 90, 40);
    scene.add(sun);
  }

  /* ---------------- World ---------------- */
  let built = false, spawned = false;
  let worldGroup = new THREE.Group();
  const buildingBoxes = [];   // AABB footprints {minX,maxX,minZ,maxZ}
  const buildingMeshes = [];  // for raycast LOS

  function box(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }
  function plane(w, d, color, x, y, z, rx) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = rx === undefined ? -Math.PI / 2 : rx;
    m.position.set(x, y, z);
    return m;
  }

  // window facade texture (pixelated)
  function makeFacade(baseColor, variant) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const b = new THREE.Color(baseColor);
    g.fillStyle = '#' + b.getHexString();
    g.fillRect(0, 0, 64, 64);
    const win = ['#2a3545', '#38475a', '#1f2733', '#3b4f66'];
    const lit = ['#ffd76a', '#ffcf5a', '#ffe08a', '#f4c64e'];
    const cols = 6, rows = 6, gap = 4, ww = (64 - gap * (cols + 1)) / cols, hh = (64 - gap * (rows + 1)) / rows;
    const lrng = mulberry32(baseColor + variant * 97);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = gap + i * (ww + gap), y = gap + j * (hh + gap);
      if (lrng() < 0.25) g.fillStyle = lit[(lrng() * 4) | 0];
      else g.fillStyle = win[(lrng() * 4) | 0];
      g.fillRect(x, y, ww, hh);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  function addBuilding(minX, minZ, maxX, maxZ) {
    const w = maxX - minX, d = maxZ - minZ;
    if (w < 4 || d < 4) return;
    const base = COLORS.building[(rng() * COLORS.building.length) | 0];
    const h = 4 + Math.pow(rng(), 1.6) * 26;
    const tex = makeFacade(base, (minX * 13 + minZ * 7) | 0);
    const sideMat = new THREE.MeshLambertMaterial({ map: tex });
    const topMat = new THREE.MeshLambertMaterial({ color: 0x4a4d55 });
    const mats = [sideMat, sideMat, topMat, topMat, sideMat, sideMat];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set((minX + maxX) / 2, 0.02 + h / 2, (minZ + maxZ) / 2);
    worldGroup.add(m);
    buildingMeshes.push(m);
    buildingBoxes.push({ minX, maxX, minZ, maxZ });
  }

  function addTree(x, z) {
    const g = new THREE.Group();
    const trunk = box(0.6, 1.4, 0.6, 0x6b4a2f, 0, 0.7, 0);
    const crown = box(1.8, 1.8, 1.8, 0x3f7a3a, 0, 2.2, 0);
    const crown2 = box(1.1, 1.1, 1.1, 0x4f8a44, 0, 3.4, 0);
    g.add(trunk, crown, crown2);
    g.position.set(x, 0.02, z);
    worldGroup.add(g);
  }

  function buildCity() {
    if (built) return;
    // ground
    const ground = box(GROUND_HALF * 2, 1, GROUND_HALF * 2, COLORS.grass, 0, -0.5, 0);
    worldGroup.add(ground);
    // asphalt slab
    worldGroup.add(box(CITY + ROAD + 8, 0.6, CITY + ROAD + 8, COLORS.ground, 0, -0.05, 0));

    // roads (darker)
    for (let i = 0; i <= N; i++) {
      worldGroup.add(plane(ROAD, CITY, COLORS.road, cx(i), 0.01, 0));
      worldGroup.add(plane(CITY, ROAD, COLORS.road, 0, 0.01, cz(i)));
    }

    // lane markings (dashed center line)
    for (let i = 0; i <= N; i++) {
      // along x road (horizontal), z = cz(i)
      for (let s = -CENTER; s < CENTER; s += 8) {
        worldGroup.add(plane(3.2, 0.28, COLORS.line, s + 2, 0.03, cz(i)));
      }
      // along z road (vertical), x = cx(i)
      for (let s = -CENTER; s < CENTER; s += 8) {
        worldGroup.add(plane(0.28, 3.2, COLORS.line, cx(i), 0.03, s + 2));
      }
    }

    // blocks: sidewalk slab + buildings
    for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
      const minX = cx(bi) + ROAD / 2, maxX = cx(bi + 1) - ROAD / 2;
      const minZ = cz(bj) + ROAD / 2, maxZ = cz(bj + 1) - ROAD / 2;
      worldGroup.add(plane(BLOCK, BLOCK, COLORS.sidewalk, (minX + maxX) / 2, 0.02, (minZ + maxZ) / 2));

      // simple lot layout
      const gap = 1.2;
      const inner = { minX: minX + gap, maxX: maxX - gap, minZ: minZ + gap, maxZ: maxZ - gap };
      const r = rng();
      if (r < 0.3) {
        // one big building + a tree
        addBuilding(inner.minX + 1, inner.minZ + 1, inner.maxX - 1, inner.maxZ - 1);
      } else if (r < 0.62) {
        // two buildings
        const midX = (inner.minX + inner.maxX) / 2;
        addBuilding(inner.minX, inner.minZ, midX - gap / 2, inner.maxZ);
        addBuilding(midX + gap / 2, inner.minZ, inner.maxX, inner.maxZ);
      } else if (r < 0.9) {
        // 2x2 lots, one may be a courtyard
        const midX = (inner.minX + inner.maxX) / 2;
        const midZ = (inner.minZ + inner.maxZ) / 2;
        addBuilding(inner.minX, inner.minZ, midX - gap / 2, midZ - gap / 2);
        addBuilding(midX + gap / 2, inner.minZ, inner.maxX, midZ - gap / 2);
        addBuilding(inner.minX, midZ + gap / 2, midX - gap / 2, inner.maxZ);
        if (rng() < 0.6) addBuilding(midX + gap / 2, midZ + gap / 2, inner.maxX, inner.maxZ);
        else addTree(midX + 4, midZ + 4);
      } else {
        // park block with trees
        for (let t = 0; t < 6; t++) {
          const tx = inner.minX + 2 + rng() * (inner.maxX - inner.minX - 4);
          const tz = inner.minZ + 2 + rng() * (inner.maxZ - inner.minZ - 4);
          addTree(tx, tz);
        }
      }
    }
    scene.add(worldGroup);
    built = true;
  }

  function isInsideBuilding(x, z) {
    for (let i = 0; i < buildingBoxes.length; i++) {
      const b = buildingBoxes[i];
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }
  function clampToWorld(v) {
    const L = CENTER + 6;
    v.x = Math.max(-L, Math.min(L, v.x));
    v.z = Math.max(-L, Math.min(L, v.z));
    return v;
  }

  /* ---------------- Road routes for AI cars ---------------- */
  const routes = [];
  function buildRoutes() {
    function ring(a, b) {
      return [[cx(a), cz(a)], [cx(b), cz(a)], [cx(b), cz(b)], [cx(a), cz(b)]];
    }
    routes.push(ring(0, N));
    routes.push(ring(1, N - 1));
    routes.push(ring(2, N - 2));
    // straight patrol loops (back & forth)
    routes.push([[cx(2), cz(0)], [cx(2), cz(N)]]);
    routes.push([[cx(0), cz(2)], [cx(N), cz(2)]]);
  }

  /* ---------------- Models ---------------- */
  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  function blobShadow(r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.045;
    return m;
  }

  function makeHuman(opt) {
    const g = new THREE.Group();
    const skin = opt.skin || 0xe8b88a, shirt = opt.shirt || 0x3366ff, pants = opt.pants || 0x2c2c34;
    const shirtM = mat(shirt), pantsM = mat(pants), skinM = mat(skin), hairM = mat(opt.hair || 0x241c14);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtM);
    body.position.y = 1.06;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skinM);
    head.position.y = 1.64;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), hairM);
    hair.position.y = 1.82;
    const cap = opt.cap ? new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), mat(opt.cap)) : null;
    if (cap) { cap.position.y = 1.86; cap.position.z = -0.02; }
    const brim = cap ? new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.22), mat(opt.cap)) : null;
    if (brim) { brim.position.y = 1.83; brim.position.z = -0.22; }

    const legGeo = new THREE.BoxGeometry(0.18, 0.72, 0.2); legGeo.translate(0, -0.36, 0);
    const legL = new THREE.Mesh(legGeo, pantsM); legL.position.set(-0.15, 0.72, 0);
    const legR = new THREE.Mesh(legGeo, pantsM); legR.position.set(0.15, 0.72, 0);

    const armGeo = new THREE.BoxGeometry(0.15, 0.56, 0.17); armGeo.translate(0, -0.28, 0);
    const armL = new THREE.Mesh(armGeo, shirtM); armL.position.set(-0.33, 1.36, 0);
    const armR = new THREE.Mesh(armGeo, shirtM); armR.position.set(0.33, 1.36, 0);

    g.add(body, head, hair, legL, legR, armL, armR);
    if (cap) g.add(cap, brim);
    const shadow = blobShadow(0.42); g.add(shadow);

    g.userData = { body, head, legL, legR, armL, armR, parts: [body, head, hair, legL, legR, armL, armR] };
    return g;
  }

  function makeCar(opt) {
    const g = new THREE.Group();
    const bodyC = opt.color || 0xc23a2e;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 3.3), mat(bodyC));
    body.position.y = 0.62;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.7), mat(opt.isPolice ? 0x14181f : 0x25303c));
    cabin.position.set(0, 1.12, -0.15);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), mat(bodyC));
    hood.position.set(0, 0.88, 1.35);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.8), mat(bodyC));
    trunk.position.set(0, 0.88, -1.5);

    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    [[-0.9, 1.05], [0.9, 1.05], [-0.9, -1.15], [0.9, -1.15]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wheelGeo, mat(0x141414));
      w.position.set(wx, 0.34, wz);
      wheels.push(w); g.add(w);
    });
    g.add(body, cabin, hood, trunk);

    if (opt.isPolice) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.9), mat(0x222));
      bar.position.set(0, 1.42, -0.15);
      const lr = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.32), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      lr.position.set(0, 1.5, -0.15);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.32), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      lb.position.set(0, 1.5, -0.15);
      g.add(bar, lr, lb);
      g.userData.lightRed = lr; g.userData.lightBlue = lb;
    }
    g.add(blobShadow(1.1));
    g.userData.wheels = wheels;
    g.userData.body = body;
    return g;
  }

  /* ---------------- Entities ---------------- */
  const NPCs = [];
  const cars = [];
  const bloodParticles = [];
  const splats = [];
  const tracers = [];
  const corpses = [];
  const hittables = [];   // meshes raycast can hit (NPC bodies + cars)

  let player = null;

  /* ---------------- Player ---------------- */
  function createPlayer() {
    const g = makeHuman({ shirt: 0xd63a2f, pants: 0x2b2f3a, cap: 0x111418 });
    scene.add(g);

    // held weapon meshes (attached to right arm)
    const knife = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.08), new THREE.MeshLambertMaterial({ color: 0xd9d9d9 }));
    knife.position.set(0.02, -0.1, 0.16);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.34), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
    gun.position.set(0.02, -0.02, 0.2);

    g.userData.knife = knife; g.userData.gun = gun;

    const muzzle = new THREE.Group();
    muzzle.position.set(0, 1.45, 0.42);

    return {
      group: g, pos: new THREE.Vector3(0, 0, 6), vel: new THREE.Vector3(),
      hp: 100, maxHp: 100, weapon: 0, ammo: 0,
      wanted: 0, crimeTimer: 0, speed: 6.4, sprint: 1.65,
      inCar: null, muzzle,
      attackCd: 0, shotCd: 0, dead: false, lastFire: 0
    };
  }

  function setPlayerWeapon(w) {
    if (!player) return;
    player.weapon = w;
    const g = player.group, u = g.userData;
    g.remove(u.knife); g.remove(u.gun);
    if (w === 1) g.add(u.knife);
    else if (w === 2) g.add(u.gun);
    Sfx.click();
    updateWeaponHUD();
  }

  /* ---------------- NPC creation ---------------- */
  function randomWalkablePoint() {
    for (let t = 0; t < 40; t++) {
      const bi = (rng() * N) | 0, bj = (rng() * N) | 0;
      const minX = cx(bi) + ROAD / 2 + 1, maxX = cx(bi + 1) - ROAD / 2 - 1;
      const minZ = cz(bj) + ROAD / 2 + 1, maxZ = cz(bj + 1) - ROAD / 2 - 1;
      const x = minX + rng() * (maxX - minX), z = minZ + rng() * (maxZ - minZ);
      if (!isInsideBuilding(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3((rng() * 2 - 1) * CENTER, 0, (rng() * 2 - 1) * CENTER);
  }
  function randomRoadNode() {
    const i = (rng() * (N + 1)) | 0, j = (rng() * (N + 1)) | 0;
    return new THREE.Vector3(cx(i), 0, cz(j));
  }
  function randomLocalPoint(pos, r) {
    for (let t = 0; t < 20; t++) {
      const a = rng() * Math.PI * 2, d = 2 + rng() * r;
      const x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d;
      if (!isInsideBuilding(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return pos.clone();
  }

  const CIV_SHIRTS = [0x3f8f3f, 0x2f6fbf, 0xb0702f, 0x8f3f8f, 0x2f8f8f, 0x8f8f2f, 0x6f4f2f, 0x4f6f8f, 0x9f4f4f, 0x555a66];
  function makeNPC(type) {
    const isPolice = type === 'police';
    const opt = isPolice
      ? { shirt: 0x1f3a6f, pants: 0x16161c, cap: 0x1f3a6f, skin: 0xe8b88a }
      : { shirt: CIV_SHIRTS[(rng() * CIV_SHIRTS.length) | 0], pants: 0x2c2c34, hair: 0x241c14 };
    const g = makeHuman(opt);
    const start = isPolice ? randomRoadNode() : randomWalkablePoint();
    g.position.copy(start);
    scene.add(g);

    const npc = {
      type, group: g, pos: start.clone(),
      hp: isPolice ? 70 : 40, maxHp: isPolice ? 70 : 40,
      state: isPolice ? 'patrol' : 'walk',
      target: null, wanderTimer: 0, speed: isPolice ? 3.4 : 1.9,
      dead: false, deathT: 0, fleeDir: new THREE.Vector3(),
      path: [], pathI: 0, shootCd: rng() * 1.2, losTimer: 0, los: true,
      anim: 0, facing: 0, runSpeed: 5.2
    };
    g.userData.owner = npc;
    g.userData.parts.forEach(p => p.userData.owner = npc);
    g.userData.head.userData.head = true;
    NPCs.push(npc);
    return npc;
  }

  function makeCarEntity(opt) {
    const g = makeCar(opt);
    scene.add(g);
    const route = routes[(rng() * routes.length) | 0];
    const wp = (rng() * route.length) | 0;
    const start = new THREE.Vector3(route[wp][0], 0, route[wp][1]);
    g.position.copy(start);
    const car = {
      group: g, route, wpIndex: wp, pos: start.clone(), heading: 0, speed: opt.speed || 7.5,
      isPolice: !!opt.isPolice, color: opt.color, maxSpeed: opt.speed || 7.5,
      laneOffset: (rng() < 0.5 ? 1 : -1) * (ROAD / 4), honkT: 0, dead: false
    };
    g.userData.owner = car;
    g.userData.body.userData.owner = car;
    cars.push(car);
    return car;
  }

  function spawnWorld() {
    if (spawned) return;
    buildRoutes();
    // civilians
    for (let i = 0; i < 34; i++) makeNPC('civilian');
    // police
    for (let i = 0; i < 9; i++) makeNPC('police');
    // traffic
    for (let i = 0; i < 5; i++) makeCarEntity({ color: [0xc23a2e, 0x2e6fc2, 0x2e8f4a, 0xc2a02e, 0x7a3ac2][i] });
    for (let i = 0; i < 4; i++) makeCarEntity({ isPolice: true, color: 0xe8e8e8, speed: 9.5 });
    for (let i = 0; i < 6; i++) makeCarEntity({ color: [0x2e6fc2, 0x2e8f4a, 0xc2a02e, 0x4a4a52, 0x8a5a2e][(rng() * 5) | 0], speed: 6 + rng() * 3 });

    // collect hittables
    NPCs.forEach(n => n.group.userData.parts.forEach(p => hittables.push(p)));
    cars.forEach(c => hittables.push(c.group.userData.body));
    spawned = true;
  }

  /* ---------------- Blood FX ---------------- */
  function spawnBlood(pos, dir, amount) {
    const n = Math.min(amount || 8, 26);
    for (let i = 0; i < n; i++) {
      const size = 0.06 + rng() * 0.12;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0xb00a0a, transparent: true, opacity: 1, depthWrite: false }));
      p.position.set(pos.x + (rng() - 0.5) * 0.3, pos.y + 0.2 + rng() * 0.5, pos.z + (rng() - 0.5) * 0.3);
      const dirH = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      const side = new THREE.Vector3(-dirH.z, 0, dirH.x);
      const v = dirH.clone().multiplyScalar(1 + rng() * 2.5).add(side.multiplyScalar((rng() - 0.5) * 2.5));
      v.y = 1.5 + rng() * 2.5;
      bloodParticles.push({ mesh: p, vel: v, life: 0.7 + rng() * 0.5, t: 0 });
      scene.add(p);
    }
  }
  function spawnSplat(pos) {
    if (splats.length > 80) { const old = splats.shift(); scene.remove(old.mesh); }
    const r = 0.3 + rng() * 0.4;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10), new THREE.MeshBasicMaterial({ color: 0x7a0505, transparent: true, opacity: 0.85, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.05 + rng() * 0.02, pos.z);
    scene.add(m);
    splats.push({ mesh: m, life: 18 + rng() * 12, t: 0 });
  }
  function spawnTracer(from, to, color) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), new THREE.MeshBasicMaterial({ color: color || 0xffe08a }));
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.lookAt(to);
    scene.add(m);
    tracers.push({ mesh: m, life: 0.06, t: 0 });
  }
  function spawnMuzzle(pos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffd66a }));
    m.position.copy(pos);
    scene.add(m);
    tracers.push({ mesh: m, life: 0.05, t: 0 });
  }

  /* ---------------- Damage ---------------- */
  const raycaster = new THREE.Raycaster();

  function damageNPC(npc, dmg, hitPoint, dir) {
    if (npc.dead) return;
    npc.hp -= dmg;
    npc.meshFlash = 0.12;
    spawnBlood(hitPoint || npc.pos.clone().setY(1.1), dir, dmg > 30 ? 14 : 8);
    Sfx.blood();
    if (npc.hp <= 0) killNPC(npc, dir);
    else if (npc.type === 'civilian') { npc.state = 'flee'; npc.fleeDir.copy(dir).setY(0).normalize(); npc.fleeT = 4; }
  }

  function killNPC(npc, dir) {
    npc.dead = true;
    npc.deathT = 0;
    Sfx.die();
    spawnBlood(npc.pos.clone().setY(1.0), dir, 20);
    spawnSplat(npc.pos.clone());
    // mark meshes non-hittable
    npc.group.userData.parts.forEach(p => { const i = hittables.indexOf(p); if (i >= 0) hittables.splice(i, 1); });
    corpses.push(npc);
  }

  function playerTakeDamage(dmg, from) {
    if (player.dead) return;
    player.hp -= dmg;
    flash();
    spawnBlood(player.pos.clone().setY(1.1), from ? player.pos.clone().sub(from).normalize() : new THREE.Vector3(1, 0, 0), 6);
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      showWasted();
    }
    updateHealthHUD();
  }

  /* ---------------- Combat ---------------- */
  const _aim = new THREE.Vector3();
  const _aimDir = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();

  function aimInfo() {
    // world aim point on ground plane from mouse
    _ndc.set((mouse.x / W) * 2 - 1, -(mouse.y / H) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const t = -_ray.ray.origin.y / _ray.ray.direction.y;
    _aim.copy(_ray.ray.origin).addScaledVector(_ray.ray.direction, t);
    _aimDir.copy(_aim).sub(player.pos).setY(0);
    if (_aimDir.lengthSq() < 0.0001) _aimDir.set(0, 0, 1);
    _aimDir.normalize();
    return { point: _aim, dir: _aimDir };
  }

  function fireGun() {
    if (player.shotCd > 0) return;
    if (player.ammo <= 0) { setPlayerWeapon(0); toast('HẾT ĐẠN! Nhấn R để nạp đạn'); return; }
    player.shotCd = 0.28;
    player.ammo = Math.max(0, player.ammo - 1);
    Sfx.shoot();
    const a = aimInfo();
    const muzzle = player.group.localToWorld(player.muzzle.position.clone());
    spawnMuzzle(muzzle);

    // slight spread
    const spread = new THREE.Vector3((rng() - 0.5) * 0.06, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.06);
    const dir = a.dir.clone().add(new THREE.Vector3(0, 0.12, 0)).add(spread).normalize();
    _ray.set(muzzle, dir);
    _ray.far = 140;
    const hits = _ray.intersectObjects(hittables, false);
    let hitOwner = null, hitPoint = null, hitHead = false;
    if (hits.length) {
      const h = hits[0];
      hitOwner = h.object.userData.owner;
      hitHead = !!h.object.userData.head;
      hitPoint = h.point;
    } else {
      // fall back: extend to ground
      const tg = -muzzle.y / dir.y;
      hitPoint = muzzle.clone().addScaledVector(dir, Math.max(tg, 0));
    }
    spawnTracer(muzzle, hitPoint, 0xffe08a);

    if (hitOwner) {
      if (hitOwner.type === 'civilian' || hitOwner.type === 'police') {
        const dmg = hitHead ? 60 : 26;
        damageNPC(hitOwner, dmg, hitPoint, dir);
        triggerCrime(hitOwner.type === 'police' ? 1.6 : 0.9);
      } else if (hitOwner.group && !hitOwner.dead) {
        // car
        spawnBlood(hitPoint, dir, 4);
        if (!hitOwner.shot) hitOwner.shot = 0;
        hitOwner.shot++;
        if (hitOwner.shot > 5) explodeCar(hitOwner);
      }
    } else {
      spawnSplat(hitPoint.clone().setY(0));
    }

    // muzzle flash light near camera? skip
    if (player.ammo <= 0 && player.weapon === 2) {
      setTimeout(() => setPlayerWeapon(0), 250);
      toast('HẾT ĐẠN! Đấm tay thôi');
    }
    updateAmmoHUD();
  }

  function meleeAttack() {
    if (player.attackCd > 0) return;
    player.attackCd = 0.4;
    const a = aimInfo();
    const isKnife = player.weapon === 1;
    Sfx[isKnife ? 'knife' : 'punch']();
    const range = isKnife ? 1.9 : 1.6;
    const ang = isKnife ? 0.5 : 0.55;
    let hitAny = false;
    NPCs.forEach(npc => {
      if (npc.dead) return;
      const d = npc.pos.clone().sub(player.pos).setY(0);
      const dist = d.length();
      if (dist > range + 0.4) return;
      const cos = d.normalize().dot(a.dir);
      if (cos < Math.cos(ang)) return;
      const dmg = isKnife ? 34 : 12;
      hitAny = true;
      damageNPC(npc, dmg, npc.pos.clone().setY(1.1), a.dir);
      if (npc.dead) {
        triggerCrime(npc.type === 'police' ? 1.6 : 0.9);
      } else if (npc.type === 'civilian') {
        triggerCrime(0.7);
      } else if (npc.type === 'police') {
        triggerCrime(1.2);
      }
    });
    if (!hitAny) {
      // swing whoosh visual: brief arm anim handled by cooldown
      if (isKnife) Sfx.click();
    }
  }

  function triggerCrime(amount) {
    if (player.dead) return;
    player.wanted = Math.min(5, player.wanted + amount);
    player.crimeTimer = 0;
    if (amount >= 1.2) Sfx.warn();
    updateWantedHUD();
    // aggro police in radius
    NPCs.forEach(n => {
      if (n.type === 'police' && !n.dead && n.state !== 'chase' && n.pos.distanceTo(player.pos) < 60) {
        n.state = 'chase'; n.path = [];
      }
    });
  }

  function explodeCar(car) {
    if (car.dead) return;
    car.dead = true;
    Sfx.shoot(); Sfx.die();
    const p = car.pos.clone().setY(1);
    for (let i = 0; i < 20; i++) spawnBlood(p, new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5), 3);
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9 }));
    boom.position.copy(p);
    scene.add(boom);
    tracers.push({ mesh: boom, life: 0.25, t: 0, grow: true });
    // damage nearby NPCs
    NPCs.forEach(n => { if (!n.dead && n.pos.distanceTo(car.pos) < 4) damageNPC(n, 50, n.pos.clone().setY(1.1), n.pos.clone().sub(car.pos)); });
    if (player.pos.distanceTo(car.pos) < 4) playerTakeDamage(40, car.pos);
    triggerCrime(2);
  }

  /* ---------------- AI: civilians ---------------- */
  function updateNPC(npc, dt) {
    if (npc.dead) {
      npc.deathT += dt;
      // fall over
      const g = npc.group;
      if (npc.deathT < 0.5) g.rotation.x = Math.min(Math.PI / 2, npc.deathT * Math.PI * 2);
      g.position.y = Math.max(0, 0.1 * Math.sin(npc.deathT * 2));
      if (npc.deathT > 0.6 && npc.deathT < 4) {
        g.userData.parts.forEach(p => { if (p.material && p.material.opacity === undefined) p.material.transparent = true; });
      }
      if (npc.deathT > 4.5) {
        g.userData.parts.forEach(p => { if (p.material) { p.material.transparent = true; p.material.opacity = Math.max(0, 1 - (npc.deathT - 4.5) * 0.8); } });
      }
      if (npc.deathT > 6) { scene.remove(g); npc.gone = true; }
      return;
    }

    if (npc.meshFlash > 0) {
      npc.meshFlash -= dt;
      const c = new THREE.Color(0x881111);
      npc.group.userData.parts.forEach(p => { if (p.material && p.material.emissive) p.material.emissive.copy(c); });
      if (npc.meshFlash <= 0) {
        npc.group.userData.parts.forEach(p => { if (p.material && p.material.emissive) p.material.emissive.setHex(0x000000); });
      }
    }

    let moveDir = new THREE.Vector3();
    let moving = false;

    if (npc.type === 'police') {
      if (player.wanted > 0 && !player.dead && npc.state === 'patrol') {
        if (npc.pos.distanceTo(player.pos) < 55) npc.state = 'chase';
      }
      if (npc.state === 'patrol') {
        if (npc.path.length === 0) npc.path = findPath(npc.pos, randomRoadNode());
        const wp = npc.path[0];
        moveDir.set(wp.x - npc.pos.x, 0, wp.z - npc.pos.z);
        if (moveDir.length() < 1.2) npc.path.shift();
        moving = true;
      } else if (npc.state === 'chase') {
        // pathfind along road grid
        npc.losTimer -= dt;
        if (npc.losTimer <= 0) { npc.losTimer = 0.25; npc.los = hasLOS(npc.pos, player.pos); }
        if (npc.path.length === 0) npc.path = findPath(npc.pos, player.pos);
        if (npc.path.length) {
          const wp = npc.path[0];
          moveDir.set(wp.x - npc.pos.x, 0, wp.z - npc.pos.z);
          if (moveDir.length() < 1.4) npc.path.shift();
        } else {
          moveDir.copy(player.pos).sub(npc.pos).setY(0);
        }
        const dist = npc.pos.distanceTo(player.pos);
        if (dist > 30 && npc.path.length === 0) npc.path = findPath(npc.pos, player.pos);
        moving = true;
        if (npc.los && dist < 16) {
          // stop and shoot
          moving = dist > 9;
          moveDir.set(0, 0, 0);
          npc.shootCd -= dt;
          if (npc.shootCd <= 0) {
            npc.shootCd = 1.1 + rng() * 0.8;
            policeShoot(npc);
          }
        }
        if (player.dead || player.wanted <= 0) { npc.state = 'patrol'; npc.path = []; }
      }
      npc.speed = npc.state === 'chase' ? 4.6 : 3.0;
    } else {
      // civilian
      if (npc.state === 'flee') {
        npc.fleeT = (npc.fleeT || 0) - dt;
        moveDir.copy(npc.fleeDir);
        npc.speed = npc.runSpeed;
        if (npc.fleeT <= 0) npc.state = 'walk';
      } else {
        npc.speed = 1.9;
        if (player.wanted > 0 && !player.dead) {
          const d = npc.pos.distanceTo(player.pos);
          if (d < 9) { npc.state = 'flee'; npc.fleeDir = npc.pos.clone().sub(player.pos).setY(0).normalize(); npc.fleeT = 5; }
        } else {
          if (!npc.target || npc.wanderTimer <= 0 || npc.pos.distanceTo(npc.target) < 1) {
            npc.target = randomLocalPoint(npc.pos, 6);
            npc.wanderTimer = 2 + rng() * 6;
          }
          npc.wanderTimer -= dt;
          moveDir.copy(npc.target).sub(npc.pos).setY(0);
        }
      }
      moving = true;
    }

    if (moving && moveDir.lengthSq() > 0.0001) {
      moveDir.normalize();
      npc.pos.addScaledVector(moveDir, npc.speed * dt);
      // keep on walkable ground (block sidewalks / roads), avoid buildings
      if (isInsideBuilding(npc.pos.x, npc.pos.z)) {
        npc.pos.sub(moveDir.clone().multiplyScalar(npc.speed * dt * 2));
        if (npc.type !== 'police') { npc.target = null; }
      }
      clampToWorld(npc.pos);
      npc.facing = Math.atan2(moveDir.x, moveDir.z);
      npc.anim += dt * (npc.speed * 2.2);
    }
    npc.group.position.set(npc.pos.x, npc.pos.y, npc.pos.z);
    npc.group.rotation.y = npc.facing;
    // limb animation
    const swing = Math.sin(npc.anim) * 0.5;
    npc.group.userData.legL.rotation.x = swing;
    npc.group.userData.legR.rotation.x = -swing;
    const armSwing = moving ? Math.sin(npc.anim + Math.PI) * 0.4 : 0;
    npc.group.userData.armL.rotation.x = armSwing;
    npc.group.userData.armR.rotation.x = -armSwing;
  }

  function policeShoot(npc) {
    const from = npc.pos.clone().setY(1.35);
    const to = player.pos.clone().setY(1.0);
    const dir = to.clone().sub(from).normalize();
    // inaccuracy
    dir.x += (rng() - 0.5) * 0.12; dir.z += (rng() - 0.5) * 0.12; dir.normalize();
    Sfx.shoot();
    spawnMuzzle(from);
    spawnTracer(from, player.pos.clone().setY(1.0), 0xffb0a0);
    // hit chance based on distance
    const dist = npc.pos.distanceTo(player.pos);
    const hitChance = Math.max(0.25, 1 - dist / 30);
    if (rng() < hitChance) playerTakeDamage(7 + rng() * 6, npc.pos);
  }

  /* ---------------- Pathfinding (road grid BFS) ---------------- */
  function nearestNode(p) {
    let bi = Math.round((p.x + CENTER) / CELL), bj = Math.round((p.z + CENTER) / CELL);
    bi = Math.max(0, Math.min(N, bi)); bj = Math.max(0, Math.min(N, bj));
    return { i: bi, j: bj };
  }
  function nodePos(node) { return new THREE.Vector3(cx(node.i), 0, cz(node.j)); }
  function findPath(from, to) {
    const s = nearestNode(from), e = nearestNode(to);
    if (s.i === e.i && s.j === e.j) return [to.clone()];
    const key = (i, j) => i + ',' + j;
    const q = [{ i: s.i, j: s.j, path: [] }];
    const seen = new Set([key(s.i, s.j)]);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const cur = q.shift();
      for (const [di, dj] of dirs) {
        const ni = cur.i + di, nj = cur.j + dj;
        if (ni < 0 || ni > N || nj < 0 || nj > N) continue;
        const k = key(ni, nj);
        if (seen.has(k)) continue;
        seen.add(k);
        const np = cur.path.concat([nodePos({ i: ni, j: nj })]);
        if (ni === e.i && nj === e.j) { np.push(to.clone()); return np; }
        q.push({ i: ni, j: nj, path: np });
      }
    }
    return [to.clone()];
  }
  function hasLOS(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a).setY(0);
    const len = dir.length();
    if (len < 0.01) return true;
    dir.normalize();
    const r = new THREE.Raycaster(a.clone().setY(0.6), dir, 0, len);
    const hits = r.intersectObjects(buildingMeshes, false);
    return hits.length === 0;
  }

  /* ---------------- AI: cars ---------------- */
  function updateCar(car, dt) {
    if (car.dead) return;
    if (car.driver) return;   // player-driven
    const route = car.route;
    const wp = new THREE.Vector3(route[car.wpIndex][0], 0, route[car.wpIndex][1]);
    const toWp = wp.clone().sub(car.pos);
    const dist = toWp.length();
    if (dist < 2.5) car.wpIndex = (car.wpIndex + 1) % route.length;

    const desired = Math.atan2(toWp.x, toWp.z);
    let dh = desired - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += dh * Math.min(1, dt * 4);

    const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    car.pos.addScaledVector(fwd, car.speed * dt);
    clampToWorld(car.pos);

    // render with right-lane offset
    const right = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    const renderPos = car.pos.clone().addScaledVector(right, car.laneOffset);
    car.group.position.set(renderPos.x, 0, renderPos.z);
    car.group.rotation.y = car.heading;
    car.group.userData.wheels.forEach(w => w.rotation.x += car.speed * dt * 4);

    // police light flicker
    if (car.group.userData.lightRed) {
      const t = performance.now() / 160;
      const on = Math.floor(t) % 2 === 0;
      car.group.userData.lightRed.visible = on;
      car.group.userData.lightBlue.visible = !on;
    }

    // run over pedestrians
    NPCs.forEach(n => {
      if (n.dead) return;
      const d = n.pos.clone().sub(renderPos).setY(0).length();
      if (d < 1.1) {
        damageNPC(n, 40, n.pos.clone().setY(1.0), fwd);
        if (n.type === 'police') triggerCrime(1.5);
        else triggerCrime(0.8);
      }
    });
    if (!player.inCar && !player.dead) {
      const d = player.pos.clone().sub(renderPos).setY(0).length();
      if (d < 1.1) playerTakeDamage(25, renderPos);
    }
  }

  /* ---------------- Vehicle enter/exit ---------------- */
  function nearestCar() {
    let best = null, bd = 3.2;
    cars.forEach(c => {
      if (c.dead) return;
      const d = c.group.position.distanceTo(player.pos);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }
  function enterCar() {
    if (player.inCar) return;
    const c = nearestCar();
    if (!c) { toast('Không có xe nào gần đây'); return; }
    player.inCar = c;
    c.driver = player;
    scene.remove(player.group);
    Sfx.car();
    toast('Đã lên xe — WASD lái, E xuống xe');
  }
  function exitCar() {
    if (!player.inCar) return;
    const c = player.inCar;
    c.driver = null;
    const p = c.group.position.clone().add(new THREE.Vector3(2, 0, 2));
    if (isInsideBuilding(p.x, p.z)) { p.set(c.group.position.x - 2, 0, c.group.position.z - 2); }
    clampToWorld(p);
    player.pos.copy(p);
    player.group.position.copy(p);
    scene.add(player.group);
    player.inCar = null;
    Sfx.click();
  }

  /* ---------------- Input ---------------- */
  const keys = {};
  const mouse = { x: W / 2, y: H / 2, down: false };

  function onKey(e, down) { keys[e.code] = down; if (down) handleKeyPress(e.code); }
  function handleKeyPress(code) {
    if (!player || player.dead) return;
    if (code === 'Digit1' || code === 'Numpad1') setPlayerWeapon(0);
    else if (code === 'Digit2' || code === 'Numpad2') setPlayerWeapon(1);
    else if (code === 'Digit3' || code === 'Numpad3') setPlayerWeapon(2);
    else if (code === 'KeyR') { player.ammo = 30; updateAmmoHUD(); Sfx.click(); toast('Đã nạp đạn: 30'); }
    else if (code === 'KeyE') { if (player.inCar) exitCar(); else enterCar(); }
  }

  function bindInput() {
    window.addEventListener('keydown', e => { if (e.code === 'Space') e.preventDefault(); onKey(e, true); });
    window.addEventListener('keyup', e => onKey(e, false));
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; updateCrosshair(); });
    window.addEventListener('mousedown', e => { if (e.button === 0) { mouse.down = true; } });
    window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    // touch: left = joystick, right = attack toward tap, buttons
    setupTouch();
  }

  function setupTouch() {
    const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    canvas.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (t.clientX < W * 0.4 && joy.id === null) {
          joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = t.clientX; joy.y = t.clientY;
        } else {
          mouse.x = t.clientX; mouse.y = t.clientY; mouse.down = true;
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
        else { mouse.x = t.clientX; mouse.y = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) { joy.id = null; joy.x = joy.ox; joy.y = joy.oy; touchMove = { x: 0, y: 0 }; }
        else { mouse.down = false; }
      }
    });
    window.touchJoy = joy;
  }

  let touchMove = { x: 0, y: 0 };
  function readMoveInput() {
    let x = 0, z = 0;
    if (keys['KeyW'] || keys['ArrowUp']) z -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) z += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) x += 1;
    const joy = window.touchJoy;
    if (joy && joy.id !== null) {
      const dx = (joy.x - joy.ox) / 40, dy = (joy.y - joy.oy) / 40;
      const m = Math.hypot(dx, dy);
      if (m > 0.2) { x = dx / m * Math.min(1, m); z = dy / m * Math.min(1, m); touchMove = { x, y: 0, z }; }
    }
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    return { x, z, sprint };
  }

  /* ---------------- Player update ---------------- */
  function updatePlayer(dt) {
    if (player.dead) return;
    player.attackCd = Math.max(0, player.attackCd - dt);
    player.shotCd = Math.max(0, player.shotCd - dt);

    // wanted decay
    if (player.wanted > 0) {
      player.crimeTimer += dt;
      if (player.crimeTimer > 12) {
        player.wanted = Math.max(0, player.wanted - 1);
        player.crimeTimer = 0;
        updateWantedHUD();
        if (player.wanted === 0) toast('Đã thoát truy nã');
      }
    }
    // regen
    if (player.hp < player.maxHp && player.crimeTimer > 4) {
      player.hp = Math.min(player.maxHp, player.hp + 2.5 * dt);
      updateHealthHUD();
    }

    if (player.inCar) {
      driveCar(dt);
      return;
    }

    const mi = readMoveInput();
    const move = new THREE.Vector3(mi.x, 0, mi.z);
    if (move.lengthSq() > 0.0001) move.normalize();
    const spd = player.speed * (mi.sprint ? player.sprint : 1);
    player.pos.addScaledVector(move, spd * dt);
    if (isInsideBuilding(player.pos.x, player.pos.z)) player.pos.sub(move.clone().multiplyScalar(spd * dt * 1.2));
    clampToWorld(player.pos);
    player.group.position.copy(player.pos);

    // face aim
    const a = aimInfo();
    const fy = Math.atan2(a.dir.x, a.dir.z);
    player.group.rotation.y = fy;

    // walking animation
    const moving = move.lengthSq() > 0.0001;
    player.anim = (player.anim || 0) + dt * (moving ? spd * 2.2 : 0);
    const swing = Math.sin(player.anim) * 0.5;
    player.group.userData.legL.rotation.x = moving ? swing : 0;
    player.group.userData.legR.rotation.x = moving ? -swing : 0;

    // held weapon aim pose (arms forward)
    const hasWeapon = player.weapon !== 0;
    player.group.userData.armR.rotation.x = hasWeapon ? -1.3 : (moving ? -Math.sin(player.anim + Math.PI) * 0.4 : 0);
    player.group.userData.armL.rotation.x = hasWeapon ? -1.3 : (moving ? Math.sin(player.anim + Math.PI) * 0.4 : 0);

    // attacks
    if (mouse.down) {
      if (player.weapon === 2) fireGun();
      else meleeAttack();
    }
  }

  function driveCar(dt) {
    const car = player.inCar;
    const mi = readMoveInput();
    const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    const right = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    let speed = 0;
    if (mi.z < 0) speed = 13;          // W = forward
    else if (mi.z > 0) speed = -7;     // S = reverse
    if (mi.x !== 0) car.heading += mi.x * dt * 1.6;   // A/D steer

    car.pos.addScaledVector(fwd, speed * dt);
    clampToWorld(car.pos);
    if (isInsideBuilding(car.pos.x, car.pos.z)) car.pos.sub(fwd.clone().multiplyScalar(speed * dt * 1.5));
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    car.group.userData.wheels.forEach(w => w.rotation.x += speed * dt * 4);

    // running over people while driving
    NPCs.forEach(n => {
      if (n.dead) return;
      if (n.pos.distanceTo(car.pos) < 1.1 && Math.abs(speed) > 4) {
        damageNPC(n, 45, n.pos.clone().setY(1.0), fwd);
        triggerCrime(n.type === 'police' ? 1.5 : 0.8);
      }
    });
    player.pos.copy(car.pos);
  }

  /* ---------------- Camera ---------------- */
  const camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const p = player.inCar ? player.inCar.group.position : player.pos;
    const desired = new THREE.Vector3(p.x, 40, p.z + 26);
    const k = 1 - Math.pow(0.001, dt);
    camTarget.lerp(desired, k);
    camera.position.copy(camTarget);
    camera.lookAt(p.x, 0, p.z);
  }

  /* ---------------- FX update ---------------- */
  function updateFX(dt) {
    for (let i = bloodParticles.length - 1; i >= 0; i--) {
      const b = bloodParticles[i];
      b.t += dt;
      b.vel.y -= 12 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.mesh.position.y < 0.02) { b.mesh.position.y = 0.02; b.vel.set(0, 0, 0); }
      b.mesh.material.opacity = Math.max(0, 1 - b.t / b.life);
      if (b.t >= b.life) { scene.remove(b.mesh); bloodParticles.splice(i, 1); }
    }
    for (let i = splats.length - 1; i >= 0; i--) {
      const s = splats[i];
      s.t += dt;
      if (s.t > s.life) { scene.remove(s.mesh); splats.splice(i, 1); }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.t += dt;
      if (tr.grow) tr.mesh.scale.multiplyScalar(1 + dt * 8);
      tr.mesh.material.opacity = Math.max(0, 1 - tr.t / tr.life);
      if (tr.t >= tr.life) { scene.remove(tr.mesh); tracers.splice(i, 1); }
    }
  }

  /* ---------------- HUD ---------------- */
  const healthFill = document.getElementById('healthFill');
  const wantedBox = document.getElementById('wantedBox');
  const ammoN = document.getElementById('ammoN');
  const msgEl = document.getElementById('msg');
  const flashEl = document.getElementById('flash');
  const crosshair = document.getElementById('crosshair');
  let msgTimer = null, flashT = 0;

  function buildStars() {
    wantedBox.innerHTML = '';
    for (let i = 0; i < 5; i++) { const s = document.createElement('span'); s.className = 'star'; s.textContent = '★'; wantedBox.appendChild(s); }
  }
  function updateHealthHUD() { healthFill.style.width = Math.max(0, player.hp) + '%'; }
  function updateWantedHUD() {
    const stars = wantedBox.children;
    const w = Math.round(player.wanted);
    for (let i = 0; i < stars.length; i++) stars[i].className = 'star' + (i < w ? ' on' : '');
  }
  function updateWeaponHUD() {
    document.querySelectorAll('.wslot').forEach(el => el.classList.toggle('active', +el.dataset.w === player.weapon));
    updateAmmoHUD();
  }
  function updateAmmoHUD() {
    if (player.weapon === 2) ammoN.textContent = player.ammo === Infinity ? '∞' : player.ammo;
    else if (player.weapon === 1) ammoN.textContent = '—';
    else ammoN.textContent = '—';
    ammoN.parentElement.style.color = player.weapon === 2 ? '#0ff' : '#fff';
  }
  function toast(text) {
    msgEl.textContent = text;
    msgEl.style.opacity = 1;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => msgEl.style.opacity = 0, 2600);
  }
  function flash() {
    flashEl.style.opacity = 0.5;
    flashT = 0.25;
  }
  function updateCrosshair() {
    crosshair.style.left = mouse.x + 'px';
    crosshair.style.top = mouse.y + 'px';
  }
  function showWasted() {
    document.getElementById('wasted').classList.remove('hidden');
  }
  function respawn() {
    player.hp = player.maxHp; player.dead = false; player.wanted = 0; player.crimeTimer = 0;
    player.pos.set(0, 0, 6); player.group.position.copy(player.pos);
    player.group.rotation.set(0, 0, 0);
    if (player.inCar) { player.inCar.driver = null; player.inCar = null; }
    scene.add(player.group);
    document.getElementById('wasted').classList.add('hidden');
    updateHealthHUD(); updateWantedHUD();
  }

  /* ---------------- Minimap ---------------- */
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');
  const mScale = minimap.width / (GROUND_HALF * 2);
  const mmapStatic = document.createElement('canvas');
  mmapStatic.width = minimap.width; mmapStatic.height = minimap.height;
  function buildMinimapStatic() {
    const g = mmapStatic.getContext('2d');
    g.fillStyle = '#16181c'; g.fillRect(0, 0, mmapStatic.width, mmapStatic.height);
    const W2 = (x) => (x + GROUND_HALF) * mScale;
    g.fillStyle = '#2c3138'; g.fillRect(W2(-GROUND_HALF), W2(-GROUND_HALF), CITY * mScale, CITY * mScale);
    g.fillStyle = '#23272e';
    for (let i = 0; i <= N; i++) {
      g.fillRect(W2(cx(i) - ROAD / 2), W2(-CITY / 2), ROAD * mScale, CITY * mScale);
      g.fillRect(W2(-CITY / 2), W2(cz(i) - ROAD / 2), CITY * mScale, ROAD * mScale);
    }
  }
  function updateMinimap() {
    mctx.drawImage(mmapStatic, 0, 0);
    const W2 = (x) => (x + GROUND_HALF) * mScale;
    const dot = (x, z, c, r) => { mctx.fillStyle = c; mctx.fillRect(W2(x) - r / 2, W2(z) - r / 2, r, r); };
    cars.forEach(c => { if (!c.dead) dot(c.group.position.x, c.group.position.z, c.isPolice ? '#6af' : '#fc3', 3); });
    NPCs.forEach(n => { if (!n.dead) dot(n.pos.x, n.pos.z, n.type === 'police' ? '#35f' : '#5c5', 2); });
    if (player) dot(player.pos.x, player.pos.z, '#fff', 4);
  }

  /* ---------------- Loop ---------------- */
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());

    if (!player.dead) {
      updatePlayer(dt);
    }
    NPCs.forEach(n => updateNPC(n, dt));
    cars.forEach(c => updateCar(c, dt));
    updateFX(dt);
    updateCamera(dt);

    if (flashT > 0) { flashT -= dt; flashEl.style.opacity = Math.max(0, flashT * 2); }
    updateMinimap();
    renderer.render(scene, camera);
  }

  /* ---------------- Boot ---------------- */
  function start() {
    Sfx.init();
    buildCity();
    spawnWorld();
    player = createPlayer();
    player.group.position.copy(player.pos);
    player.ammo = 30; // 30 rounds, press R to reload
    buildStars();
    buildMinimapStatic();
    updateHealthHUD();
    updateWantedHUD();
    updateWeaponHUD();
    updateAmmoHUD();
    updateCrosshair();
    document.getElementById('startOverlay').classList.add('hidden');
    toast('Chào mừng đến Pixel City! Nhấn CLICK để tấn công.');
    animate();
  }

  initThree();
  bindInput();
  window.addEventListener('resize', () => {
    W = window.innerWidth; H = window.innerHeight;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  });

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('respawnBtn').addEventListener('click', respawn);

  // build world immediately so background is visible behind overlay
  buildCity();
  buildRoutes();
  spawnWorld();
  buildMinimapStatic();
  updateMinimap();
  camera.position.set(0, 40, 30);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
})();
