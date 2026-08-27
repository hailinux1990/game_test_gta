/* ============================================================
   PIXEL CITY — open-world top-down 3D (GTA Chinatown Wars style)
   Three.js r128, no external assets, all procedural.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Config ---------------- */
  const PIXEL_SCALE = 2;          // render at 1/N resolution, upscale -> pixel look
  const MAG_SIZE = 100;           // pistol rounds per full magazine (R to reload)
  const AK_MAG = 500;             // AK-47 rounds per full magazine

  /* ---- Weapon table ---- */
  const WEAPONS = [
    { name: 'TAY',   icon: '✊', kind: 'melee', dmg: 12, cd: 0.4,  range: 1.6 },
    { name: 'DAO',   icon: '🔪', kind: 'melee', dmg: 34, cd: 0.4,  range: 1.9 },
    { name: 'SÚNG',  icon: '🔫', kind: 'gun', dmg: 26, headDmg: 60, cd: 0.28, mag: MAG_SIZE, range: 220, spread: 0.035, carHits: 6, snd: 'shoot', tracer: 0xffe08a },
    { name: 'AK-47', icon: '🔫', kind: 'gun', dmg: 30, headDmg: 75, cd: 0.10, mag: AK_MAG,   range: 340, spread: 0.012, carHits: 3, snd: 'ak',    tracer: 0xffc46a }
  ];
  const ASSIST_ANGLE = 0.12;      // rad (~7°) aim-assist cone onto NPCs
  const ASSIST_RANGE = 120;       // max distance for aim-assist
  const CELL = 35;                // block + road pitch
  const ROAD = 9;                 // road width
  const BLOCK = CELL - ROAD;      // buildable block width (26)
  const N = 11;                   // blocks per side -> roads 0..N  (multi-city mega map)
  const CITY = N * CELL;          // 385
  const CENTER = CITY / 2;        // 192.5
  const GROUND_HALF = CENTER + 22;

  const COLORS = {
    ground: 0x2c3138, road: 0x23272e, sidewalk: 0x777d86, grass: 0x2f4a2f,
    line: 0xd8d8d8, water: 0x1d4257, bridge: 0x55585f, railing: 0x9aa0a8,
    building: [0x7a6a5a, 0x9a8571, 0x6f7f8f, 0x8a7f8a, 0x5f6a5f, 0x8a7266, 0x75838a, 0x7f6a7a]
  };
  // GTA 1 style districts: each quarter of the city has its own palette
  const DISTRICT_PALS = {
    nw: [0x6f6a62, 0x7a6a58, 0x5f6560, 0x84766a],            // docklands / industrial
    ne: [0x9a6a4f, 0xa8845f, 0x8f7a5a, 0xb09070],            // residential brick
    sw: [0x8a7266, 0x75685a, 0x9a8571, 0x7f6a7a],            // old town
    se: [0x6f7f8f, 0x5f7a8a, 0x77878f, 0x667a88]             // downtown glass
  };
  // multi-city map (Đông Anh style): each core spawns a dense cluster of
  // high-rise towers — the deeper inside the core, the taller the towers
  const CITY_CORES = [
    { x: -70, z: -75, r: 58 },     // trung tâm phía bắc sông
    { x: 118, z: -125, r: 62 },    // khu đô thị mới đông bắc
    { x: -128, z: 105, r: 52 },    // phố cổ tây nam
    { x: 112, z: 112, r: 60 }      // thành phố phía nam sông
  ];

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

  /* ---- River + bridges (GTA 1 style districts split by water) ---- */
  const RIVER_ROAD = 6;                       // horizontal road row replaced by the river
  const RIVER_HALF = 14;                      // water half-width
  const RIVER_Z = cz(RIVER_ROAD);             // river centre line
  function isInsideWater(x, z) { return Math.abs(z - RIVER_Z) < RIVER_HALF; }
  const SPAWN = new THREE.Vector3(cx(4), 0, cz(4));   // safe road intersection

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
        // outdoor echo bus (urban canyon reverb for gunshots)
        this.echo = this.ctx.createDelay(0.6);
        this.echo.delayTime.value = 0.17;
        const fb = this.ctx.createGain(); fb.gain.value = 0.3;
        const wet = this.ctx.createGain(); wet.gain.value = 0.16;
        this.echo.connect(fb); fb.connect(this.echo);
        this.echo.connect(wet); wet.connect(this.master);
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
    noise(dur, vol, freq, echo) {
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
      if (echo && this.echo) g.connect(this.echo);
      src.start(t);
    },
    shoot() { this.noise(0.12, 0.5, 2600, true); this.tone(140, 0.09, 'square', 0.25, 50); },
    ak() { this.noise(0.1, 0.55, 2100, true); this.tone(110, 0.08, 'square', 0.24, 45); this.noise(0.04, 0.2, 4200); },
    metalHit() { this.tone(1600 + Math.random() * 800, 0.05, 'square', 0.12, 600); this.noise(0.04, 0.16, 5200); },
    boom() { this.noise(0.5, 0.85, 900, true); this.tone(60, 0.5, 'sawtooth', 0.35, 24); this.noise(0.22, 0.4, 2400, true); },
    siren() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle';
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g); g.connect(this.master);
      for (let k = 0; k < 6; k++) o.frequency.setValueAtTime(k % 2 ? 760 : 590, t + k * 0.21);
      o.start(t); o.stop(t + 1.35);
    },
    punch() { this.tone(200, 0.07, 'square', 0.22, 90); this.noise(0.05, 0.15, 700); },
    knife() { this.noise(0.08, 0.2, 5200); this.tone(900, 0.06, 'sawtooth', 0.1, 300); },
    hit() { this.tone(90, 0.09, 'square', 0.28, 40); this.noise(0.06, 0.2, 500); },
    blood() { this.noise(0.06, 0.12, 400); },
    die() { this.tone(220, 0.5, 'sawtooth', 0.25, 40); },
    click() { this.tone(700, 0.04, 'square', 0.12, 900); },
    car() { this.tone(80, 0.2, 'sawtooth', 0.2, 140); },
    warn() { this.tone(880, 0.12, 'square', 0.18); setTimeout(() => this.tone(660, 0.14, 'square', 0.18), 140); },

    /* ---- ambient city soundscape ---- */
    ambientOn: false,
    startAmbient() {
      if (!this.ctx || this.ambientOn) return;
      this.ambientOn = true;
      try {
        const ctx = this.ctx;
        // low city rumble: looping brown-ish noise + slow wind swell
        const len = Math.floor(ctx.sampleRate * 3);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3;
          const edge = Math.min(i, len - i) / (ctx.sampleRate * 0.5); // fade ends -> seamless loop
          d[i] *= Math.min(1, edge);
        }
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
        const g = ctx.createGain(); g.gain.value = 0.05;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
        const lg = ctx.createGain(); lg.gain.value = 0.022;
        lfo.connect(lg); lg.connect(g.gain);
        src.connect(lp); lp.connect(g); g.connect(this.master);
        src.start(); lfo.start();
        this.scheduleTraffic();
        this.scheduleBirds();
        this.scheduleSiren();
      } catch (e) {}
    },
    scheduleTraffic() {
      const loop = () => { setTimeout(() => { this.passBy(); loop(); }, 3500 + Math.random() * 6500); };
      loop();
    },
    passBy() {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime, dur = 1.4;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.linearRampToValueAtTime(900, t + dur / 2);
      bp.frequency.linearRampToValueAtTime(250, t + dur);
      const g = ctx.createGain(); g.gain.value = 0.09;
      let out = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        const dirL = Math.random() < 0.5 ? -1 : 1;
        p.pan.setValueAtTime(-dirL, t);
        p.pan.linearRampToValueAtTime(dirL, t + dur);
        g.connect(p); out = p;
      }
      s.connect(bp); bp.connect(g); out.connect(this.master);
      s.start(t);
    },
    scheduleBirds() {
      const loop = () => { setTimeout(() => { this.birdChirps(); loop(); }, 4000 + Math.random() * 9000); };
      loop();
    },
    birdChirps() {
      if (!this.ctx) return;
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) setTimeout(() => this.chirp(), i * (90 + Math.random() * 120));
    },
    chirp() {
      if (!this.ctx) return;
      const f = 2100 + Math.random() * 1600;
      this.tone(f, 0.07, 'sine', 0.035, f * (0.55 + Math.random() * 0.3));
    },
    scheduleSiren() {
      const loop = () => { setTimeout(() => { this.distantSiren(); loop(); }, 24000 + Math.random() * 30000); };
      loop();
    },
    distantSiren() {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'triangle'; lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 2.5);
      g.gain.linearRampToValueAtTime(0.0001, t + 7);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      for (let k = 0; k < 7; k++) o.frequency.setValueAtTime(k % 2 ? 720 : 560, t + k);
      o.start(t); o.stop(t + 7.2);
    }
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
    scene.fog = new THREE.Fog(0x0d0f13, 150, 480);

    camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 800);

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
    const mx = (minX + maxX) / 2, mz = (minZ + maxZ) / 2;

    // district palette (GTA 1 style quarters)...
    let pal = DISTRICT_PALS[mz < RIVER_Z ? (mx < 0 ? 'nw' : 'ne') : (mx < 0 ? 'sw' : 'se')];
    let h = 4 + Math.pow(rng(), 1.6) * 26;

    // ...plus CITY CORES: dense high-rise clusters (Đông Anh style towers).
    // The deeper inside a core, the taller the tower — up to ~64 units.
    let coreBoost = 0;
    for (const c of CITY_CORES) {
      const dist = Math.hypot(mx - c.x, mz - c.z);
      if (dist < c.r) coreBoost = Math.max(coreBoost, 1 - dist / c.r);
    }
    if (coreBoost > 0) {
      h = 20 + coreBoost * 36 + rng() * 8;                 // tower zone
      if (h > 30) pal = DISTRICT_PALS.se;                  // glassy facades for skyscrapers
    }

    const tex = makeFacade(pal[(rng() * pal.length) | 0], (minX * 13 + minZ * 7) | 0);
    // keep materials OPAQUE by default (huge draw-order win); the occlusion
    // fader flips them to transparent only for the split seconds they fade
    const sideMat = new THREE.MeshLambertMaterial({ map: tex });
    const topMat = new THREE.MeshLambertMaterial({ color: 0x4a4d55 });
    const mats = [sideMat, sideMat, topMat, topMat, sideMat, sideMat];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set((minX + maxX) / 2, 0.02 + h / 2, (minZ + maxZ) / 2);
    worldGroup.add(m);
    buildingMeshes.push(m);

    // rooftop detail for tall towers
    if (h > 30) {
      worldGroup.add(box(Math.min(4, w * 0.35), 1.6, Math.min(4, d * 0.35), 0x3c4046, mx, 0.02 + h + 0.8, mz));
      worldGroup.add(box(0.3, 3.5 + rng() * 2.5, 0.3, 0x2b2e33, mx + w * 0.25, 0.02 + h + 2, mz - d * 0.2));
    }

    buildingBoxes.push({
      minX, maxX, minZ, maxZ, h,
      cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
      mats: [sideMat, topMat], fade: 1, lastOp: 1
    });
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

    // ---- river splitting the city (GTA 1 style), crossed by bridges on every avenue ----
    worldGroup.add(box(CITY + ROAD + 8, 0.12, RIVER_HALF * 2, COLORS.water, 0, 0.26, RIVER_Z));
    // banks: grass strips along the water edge
    worldGroup.add(box(CITY + ROAD + 8, 0.14, 2.5, COLORS.grass, 0, 0.27, RIVER_Z - RIVER_HALF - 1));
    worldGroup.add(box(CITY + ROAD + 8, 0.14, 2.5, COLORS.grass, 0, 0.27, RIVER_Z + RIVER_HALF + 1));

    // blocks: sidewalk slab + buildings
    for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
      const minX = cx(bi) + ROAD / 2, maxX = cx(bi + 1) - ROAD / 2;
      const minZ = cz(bj) + ROAD / 2, maxZ = cz(bj + 1) - ROAD / 2;
      // no buildings inside the river
      if (!(maxZ < RIVER_Z - RIVER_HALF || minZ > RIVER_Z + RIVER_HALF)) continue;
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

    // ---- bridges: every avenue crosses the river on a RAISED concrete arch ----
    // deck sits 1.5 units above the water so the river boats can glide underneath
    for (let i = 0; i <= N; i++) {
      worldGroup.add(box(ROAD, 0.14, RIVER_HALF * 2 + 4, COLORS.bridge, cx(i), DECK_Y - 0.07, RIVER_Z));
      worldGroup.add(box(ROAD, 0.12, RAMP_LEN, COLORS.bridge, cx(i), DECK_Y / 2, RIVER_Z - RIVER_HALF - 2 - RAMP_LEN / 2))
        .rotation.x = Math.atan2(DECK_Y, RAMP_LEN);          // north ramp descends to the bank
      worldGroup.add(box(ROAD, 0.12, RAMP_LEN, COLORS.bridge, cx(i), DECK_Y / 2, RIVER_Z + RIVER_HALF + 2 + RAMP_LEN / 2))
        .rotation.x = -Math.atan2(DECK_Y, RAMP_LEN);         // south ramp
      worldGroup.add(box(0.35, 0.8, RIVER_HALF * 2 + 4, COLORS.railing, cx(i) - ROAD / 2 + 0.25, DECK_Y + 0.36, RIVER_Z));
      worldGroup.add(box(0.35, 0.8, RIVER_HALF * 2 + 4, COLORS.railing, cx(i) + ROAD / 2 - 0.25, DECK_Y + 0.36, RIVER_Z));
      // lane markings across the deck
      for (let s = RIVER_Z - RIVER_HALF + 3; s < RIVER_Z + RIVER_HALF - 3; s += 8) {
        worldGroup.add(plane(0.28, 3.2, COLORS.line, cx(i), DECK_Y + 0.02, s));
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

  /* ---- bridge height for rendering: characters/cars glide up the ramps ---- */
  const DECK_Y = 1.5, RAMP_LEN = 8;
  function groundY(x, z) {
    const dz = Math.abs(z - RIVER_Z);
    if (dz > RIVER_HALF + 2 + RAMP_LEN) return 0;
    for (let i = 0; i <= N; i++) {
      if (Math.abs(x - cx(i)) <= ROAD / 2 + 0.6) {
        if (dz <= RIVER_HALF + 2) return DECK_Y;              // on the arch
        return Math.max(0, DECK_Y * (1 - (dz - RIVER_HALF - 2) / RAMP_LEN)); // ramp slope
      }
    }
    return 0;
  }

  /* ---------------- Road routes for AI cars ---------------- */
  const routes = [];
  function buildRoutes() {
    function ring(a, b) {
      return [[cx(a), cz(a)], [cx(b), cz(a)], [cx(b), cz(b)], [cx(a), cz(b)]];
    }
    // outer + inner rings, crossing the river over the bridges
    routes.push(ring(0, N));
    routes.push(ring(1, N - 1));
    routes.push(ring(2, N - 2));
    routes.push(ring(3, N - 3));
    // straight patrol loops (back & forth) spread across the multi-city map
    routes.push([[cx(1), cz(0)], [cx(1), cz(N)]]);
    routes.push([[cx(4), cz(0)], [cx(4), cz(N)]]);
    routes.push([[cx(7), cz(0)], [cx(7), cz(N)]]);
    routes.push([[cx(9), cz(0)], [cx(9), cz(N)]]);
    routes.push([[cx(0), cz(2)], [cx(N), cz(2)]]);
    routes.push([[cx(0), cz(4)], [cx(N), cz(4)]]);
    routes.push([[cx(0), cz(8)], [cx(N), cz(8)]]);
    routes.push([[cx(0), cz(10)], [cx(N), cz(10)]]);
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
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.7), mat(opt.isPolice ? 0x14181f : 0x25303c));
    cabin.position.set(0, 1.18, -0.15);
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
      bar.position.set(0, 1.56, -0.15);
      const lr = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.32), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      lr.position.set(0, 1.64, -0.15);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.32), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      lb.position.set(0, 1.64, -0.15);
      g.add(bar, lr, lb);
      g.userData.lightRed = lr; g.userData.lightBlue = lb;
    }
    g.add(blobShadow(1.1));
    g.userData.wheels = wheels;
    g.userData.body = body;
    g.userData.cabin = cabin; g.userData.hood = hood; g.userData.trunk = trunk;
    return g;
  }

  // small driver figure seated inside the cabin (visible from top-down)
  function makeDriver(isPolice) {
    const g = new THREE.Group();
    const shirt = isPolice ? 0x1f3a6f : CIV_SHIRTS[(rng() * CIV_SHIRTS.length) | 0];
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.26), mat(shirt));
    torso.position.set(-0.34, 0.96, -0.2);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(0xe8b88a));
    head.position.set(-0.34, 1.3, -0.2);
    g.add(torso, head);
    if (isPolice) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), mat(0x1f3a6f));
      cap.position.set(-0.34, 1.5, -0.2);
      g.add(cap);
    }
    return g;
  }

  /* ---------------- Entities ---------------- */
  const NPCs = [];
  const cars = [];
  const bloodParticles = [];
  const splats = [];
  const tracers = [];
  const smokes = [];      // rising explosion/damage smoke puffs
  const corpses = [];
  const hittables = [];   // meshes raycast can hit (NPC bodies + cars)

  let player = null;

  /* ---------------- Player ---------------- */
  function createPlayer() {
    const g = makeHuman({ shirt: 0xd63a2f, pants: 0x2b2f3a, cap: 0x111418 });
    scene.add(g);

    // ---- held weapon models, all built along +Z then mounted on the RIGHT HAND ----
    function handMount(model, name) {
      const mount = new THREE.Group();
      mount.rotation.x = Math.PI / 2;            // model +Z -> points along the forearm
      mount.add(model);
      mount.position.set(0.09, -0.56, 0.02);     // at the hand, right side of the body
      mount.name = name;
      return mount;
    }

    // FISTS: skin-coloured knuckles so bare-hand punching is visible too
    const fist = new THREE.Group();
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.18), mat(0xe8b88a));
    knuckle.position.z = 0.1;
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.1), mat(0xd9a87a));
    wrist.position.z = 0.02;
    fist.add(knuckle, wrist);

    // KNIFE: blade + guard + handle
    const knife = new THREE.Group();
    const kBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.42), mat(0xd9d9d9));
    kBlade.position.z = 0.24;
    const kGuard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.03), mat(0x3a2a1a));
    kGuard.position.z = 0.03;
    const kHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.15), mat(0x241c14));
    kHandle.position.z = -0.06;
    knife.add(kBlade, kGuard, kHandle);

    // PISTOL: slide + barrel + grip
    const gun = new THREE.Group();
    const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.26), mat(0x1c1c1c));
    gBody.position.z = 0.1;
    const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), mat(0x101010));
    gBarrel.position.set(0, 0.035, 0.29);
    const gGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.09), mat(0x2a2a30));
    gGrip.position.set(0, -0.12, -0.01);
    gGrip.rotation.x = -0.25;
    gun.add(gBody, gBarrel, gGrip);

    // AK-47: receiver + barrel + wooden foregrip & stock + curved magazine
    const ak = new THREE.Group();
    const akReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.74), mat(0x2a2a2e));
    const akBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), mat(0x161616));
    akBarrel.position.set(0, 0.03, 0.52);
    const akForegrip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.26), mat(0x7a4a22));
    akForegrip.position.set(0, -0.02, 0.3);
    const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.36), mat(0x7a4a22));
    akStock.position.set(0, -0.03, -0.52);
    const akMag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.11), mat(0x1c1c1c));
    akMag.position.set(0, -0.16, 0.08);
    akMag.rotation.x = -0.45;
    ak.add(akReceiver, akBarrel, akForegrip, akStock, akMag);

    g.userData.fist = handMount(fist, 'wp-fist');
    g.userData.knife = handMount(knife, 'wp-knife');
    g.userData.gun = handMount(gun, 'wp-gun');
    g.userData.ak = handMount(ak, 'wp-ak');
    g.userData.armR.add(g.userData.fist);        // default: bare fists on show

    const muzzle = new THREE.Group();
    muzzle.position.set(0, 1.45, 0.42);

    return {
      group: g, pos: SPAWN.clone(), prevPos: SPAWN.clone(), vel: new THREE.Vector3(),
      hp: 100, maxHp: 100, weapon: 0,
      ammoStore: { 2: MAG_SIZE, 3: AK_MAG },   // per-weapon reserve
      shotsFired: 0,
      wanted: 0, crimeTimer: 0, speed: 6.4, sprint: 1.65,
      inCar: null, muzzle,
      attackCd: 0, shotCd: 0, dead: false, lastFire: 0
    };
  }

  function getAmmo(w) { return player.ammoStore[w] || 0; }
  function setAmmo(w, v) { player.ammoStore[w] = Math.max(0, v); }

  function setPlayerWeapon(w) {
    if (!player) return;
    player.weapon = w;
    const u = player.group.userData, armR = u.armR;
    [u.knife, u.gun, u.ak, u.fist].forEach(m => armR.remove(m));
    if (w === 1) armR.add(u.knife);          // 🔪 in the right hand
    else if (w === 2) armR.add(u.gun);       // pistol in the right hand
    else if (w === 3) armR.add(u.ak);        // rifle in the right hand
    else armR.add(u.fist);                   // bare knuckles on show
    Sfx.click();
    updateWeaponHUD();                       // also refreshes the held-item icon
  }

  /* ---------------- NPC creation ---------------- */
  function randomWalkablePoint() {
    for (let t = 0; t < 40; t++) {
      const bi = (rng() * N) | 0, bj = (rng() * N) | 0;
      const minX = cx(bi) + ROAD / 2 + 1, maxX = cx(bi + 1) - ROAD / 2 - 1;
      const minZ = cz(bj) + ROAD / 2 + 1, maxZ = cz(bj + 1) - ROAD / 2 - 1;
      const x = minX + rng() * (maxX - minX), z = minZ + rng() * (maxZ - minZ);
      if (!isInsideBuilding(x, z) && !isInsideWater(x, z)) return new THREE.Vector3(x, 0, z);
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
      if (!isInsideBuilding(x, z) && !isInsideWater(x, z)) return new THREE.Vector3(x, 0, z);
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
    npc.group.userData.parts.forEach(p => hittables.push(p));
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
      curSpeed: opt.speed || 7.5,
      laneOffset: (rng() < 0.5 ? 1 : -1) * (ROAD / 4), honkT: 0, dead: false,
      stolen: false, driverMesh: null,
      mode: 'traffic', deployed: false, deploySide: 2.2,   // police pursuit state
      prevPos: start.clone(), prevHeading: 0               // render-interpolation state
    };
    // every AI car starts with a visible driver inside
    const drv = makeDriver(car.isPolice);
    g.add(drv);
    car.driverMesh = drv;
    g.userData.owner = car;
    [g.userData.body, g.userData.cabin, g.userData.hood, g.userData.trunk].forEach(m => {
      m.userData.owner = car;
      hittables.push(m);
    });
    cars.push(car);
    return car;
  }

  /* ---------------- River traffic: boats cruising under the bridges ---------------- */
  const boats = [];
  function makeBoat(dirX, startX) {
    const g = new THREE.Group();
    const hullC = [0xb03a2e, 0x2e6fb0, 0xd9c27a, 0x4a8f5f, 0xe8e4da][(rng() * 5) | 0];
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 4.8), mat(hullC));
    hull.position.y = 0.3;
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 1.5), mat(hullC));
    bow.position.set(0, 0.27, 2.9);                       // tapered nose (same tone)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.48, 1.7), mat(0xe9e4d4));
    cabin.position.set(0, 0.82, -0.5);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.2, 1.74), mat(0x223649));
    glass.position.set(0, 1.02, -0.5);
    g.add(hull, bow, cabin, glass);
    scene.add(g);

    const boat = {
      group: g,
      pos: new THREE.Vector3(startX, 0, RIVER_Z + (rng() * 2 - 1) * (RIVER_HALF - 8)),
      dirX: dirX >= 0 ? 1 : -1,
      speed: 2 + rng() * 2.2,
      baseZ: RIVER_Z + (rng() * 2 - 1) * (RIVER_HALF - 8),
      phase: rng() * Math.PI * 2,
      wobT: rng() * 10, wakeT: 0.5, prevZ: 0
    };
    boat.prevZ = boat.pos.z;
    g.rotation.y = boat.dirX === 1 ? Math.PI / 2 : -Math.PI / 2;
    boats.push(boat);
    return boat;
  }

  function updateBoat(b, dt) {
    b.wobT += dt;
    // steady cruise along the river + lazy weave between the banks
    b.pos.x += b.dirX * b.speed * dt;
    b.pos.z = b.baseZ + Math.sin(b.wobT * 0.35 + b.phase) * (RIVER_HALF - 8);
    // wrap around the map edges -> endless traffic in both directions
    if (b.pos.x > CENTER + 16) b.pos.x = -CENTER - 16;
    if (b.pos.x < -CENTER - 16) b.pos.x = CENTER + 16;

    const vz = (b.pos.z - b.prevZ) / Math.max(dt, 1e-4);
    b.prevZ = b.pos.z;
    const targetH = Math.atan2(b.dirX * b.speed, vz);
    let dh = targetH - b.group.rotation.y;                 // shortest-path yaw glide
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    b.group.rotation.y += dh * Math.min(1, dt * 2.5);
    b.group.position.set(b.pos.x, Math.sin(b.wobT * 2.1 + b.phase) * 0.05, b.pos.z);
    b.group.rotation.z = Math.sin(b.wobT * 1.6 + b.phase) * 0.05;   // gentle roll

    // foam wake behind the stern
    b.wakeT -= dt;
    if (b.wakeT <= 0) {
      b.wakeT = 0.17;
      spawnSmoke(new THREE.Vector3(
        b.pos.x - Math.sin(b.group.rotation.y) * 2.6,
        0.45,
        b.pos.z - Math.cos(b.group.rotation.y) * 2.6), 0.75);
    }
  }

  function spawnWorld() {
    if (spawned) return;
    buildRoutes();
    // CROWDED streets: 80 civilians walking around
    for (let i = 0; i < 80; i++) makeNPC('civilian');
    // and a heavy police PRESENCE on foot (24 beat cops)
    for (let i = 0; i < 24; i++) makeNPC('police');
    // busy traffic across all cities
    const CAR_COLORS = [0xc23a2e, 0x2e6fc2, 0x2e8f4a, 0xc2a02e, 0x7a3ac2];
    for (let i = 0; i < 12; i++) makeCarEntity({ color: CAR_COLORS[(rng() * CAR_COLORS.length) | 0] });
    // police cruisers get a response rank used by the wanted-level escalation
    let beatIdx = 0;
    for (let i = 0; i < 8; i++) {
      const c = makeCarEntity({ isPolice: true, color: 0xe8e8e8, speed: 9.5 });
      c.beatIdx = beatIdx++;
    }
    for (let i = 0; i < 14; i++) makeCarEntity({ color: [0x2e6fc2, 0x2e8f4a, 0xc2a02e, 0x4a4a52, 0x8a5a2e][(rng() * 5) | 0], speed: 6 + rng() * 3 });
    // river life: cruisers & fishing boats running BOTH directions under the bridges
    for (let k = 0; k < 11; k++) {
      const x = -CENTER + 10 + k * ((CENTER * 2 - 20) / 10);
      makeBoat(k % 2 === 0 ? 1 : -1, x);
    }

    spawned = true;
  }

  /* ---------------- Blood FX ---------------- */
  function spawnBlood(pos, dir, amount, color) {
    const n = Math.min(amount || 8, 26);
    for (let i = 0; i < n; i++) {
      const size = 0.06 + rng() * 0.12;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: color || 0xb00a0a, transparent: true, opacity: 1, depthWrite: false }));
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
  function spawnScorch(pos) {
    if (splats.length > 80) { const old = splats.shift(); scene.remove(old.mesh); }
    const r = 1.6 + rng() * 0.8;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), new THREE.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.06, pos.z);
    scene.add(m);
    splats.push({ mesh: m, life: 30, t: 0 });
  }
  // yellow sparks when bullets ricochet off metal
  function spawnSparks(pos, dir) {
    for (let i = 0; i < 6; i++) {
      const size = 0.05 + rng() * 0.07;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd66a : 0xfff2c8, transparent: true, opacity: 1, depthWrite: false }));
      p.position.copy(pos);
      const v = new THREE.Vector3((rng() - 0.5) * 5, 1 + rng() * 4, (rng() - 0.5) * 5).addScaledVector(dir, -2);
      bloodParticles.push({ mesh: p, vel: v, life: 0.22 + rng() * 0.18, t: 0 });
      scene.add(p);
    }
  }
  // rising smoke puffs (explosions & damaged engines)
  function spawnSmoke(pos, scale) {
    if (smokes.length > 90) { const old = smokes.shift(); scene.remove(old.mesh); }
    const s = scale || 1;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 6, 6), new THREE.MeshBasicMaterial({ color: rng() < 0.3 ? 0x3a3a3a : 0x242424, transparent: true, opacity: 0.55, depthWrite: false }));
    m.position.copy(pos);
    scene.add(m);
    smokes.push({
      mesh: m,
      vel: new THREE.Vector3((rng() - 0.5) * 0.7, 1.4 + rng() * 1.6, (rng() - 0.5) * 0.7),
      grow: 1.1 + rng() * 1.2, life: 1.4 + rng() * 1.2, t: 0
    });
  }
  function ejectShell(pos, dir) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: 0xd8a63a, transparent: true }));
    m.position.copy(pos);
    const side = new THREE.Vector3(dir.z, 0, -dir.x);   // perpendicular to aim
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    side.normalize().multiplyScalar(1.2 + rng() * 1.6);
    side.y = 2 + rng() * 1.5;
    bloodParticles.push({ mesh: m, vel: side, life: 1.1, t: 0 });
    scene.add(m);
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

  // ---- Aim assist ("chỉnh tâm"): snap shots toward civilians/police near the crosshair ----
  const _assistPt = new THREE.Vector3();
  function findAssistTarget(origin, aimDirXZ, maxDist) {
    let best = null, bestAng = ASSIST_ANGLE;
    for (let i = 0; i < NPCs.length; i++) {
      const n = NPCs[i];
      if (n.dead) continue;
      const dx = n.pos.x - origin.x, dz = n.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.8 || dist > maxDist) continue;
      const dot = (dx * aimDirXZ.x + dz * aimDirXZ.z) / dist;
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (ang >= bestAng) continue;
      if (!hasLOS(origin, n.pos)) continue;   // no assist through walls
      bestAng = ang; best = n;
    }
    if (!best) return null;
    const head = bestAng < 0.035;             // dead-centre crosshair -> headshot
    _assistPt.set(best.pos.x, head ? 1.64 : 1.08, best.pos.z);
    return _assistPt;
  }

  function fireGun() {
    const w = WEAPONS[player.weapon];
    if (!w || w.kind !== 'gun') return;
    if (player.shotCd > 0) return;
    if (getAmmo(player.weapon) <= 0) { toast('HẾT ĐẠN ' + w.name + '! Nhấn R để nạp'); player.shotCd = 0.4; return; }
    player.shotCd = w.cd;
    setAmmo(player.weapon, getAmmo(player.weapon) - 1);
    player.shotsFired = (player.shotsFired || 0) + 1;
    Sfx[w.snd]();
    const a = aimInfo();
    const muzzleW = player.group.localToWorld(player.muzzle.position.clone());
    spawnMuzzle(muzzleW);
    ejectShell(muzzleW, a.dir);
    pulseAmmo();
    updateAmmoHUD();
    updateShotsHUD();
    floatText(String(getAmmo(player.weapon)), mouse.x + 18, mouse.y - 22, '#7df');

    // direction: aim-assist onto NPCs first, otherwise shoot toward the exact
    // ground point under the crosshair — bullets strike cars/walls standing
    // between muzzle and target instead of sailing over them
    const dir = new THREE.Vector3();
    const assist = findAssistTarget(muzzleW, a.dir, Math.min(w.range, ASSIST_RANGE));
    if (assist) dir.copy(assist).sub(muzzleW).normalize();
    else {
      dir.copy(a.point).sub(muzzleW);
      if (dir.lengthSq() < 0.02) dir.copy(a.dir).setY(-0.03);
      dir.normalize();
    }
    dir.x += (rng() - 0.5) * w.spread;
    dir.y += (rng() - 0.5) * w.spread * 0.6;
    dir.z += (rng() - 0.5) * w.spread;
    dir.normalize();

    _ray.set(muzzleW, dir);
    _ray.far = w.range;                       // bullets fly much farther now
    const hits = _ray.intersectObjects(hittables, false);
    let hitOwner = null, hitPoint = null, hitHead = false;
    if (hits.length) {
      const h = hits[0];
      hitOwner = h.object.userData.owner;
      hitHead = !!h.object.userData.head;
      hitPoint = h.point;
    } else {
      // fall back: extend to ground
      const tg = -muzzleW.y / dir.y;
      hitPoint = muzzleW.clone().addScaledVector(dir, Math.max(tg, 0));
    }
    spawnTracer(muzzleW, hitPoint, w.tracer);

    if (hitOwner) {
      if (hitOwner.type === 'civilian' || hitOwner.type === 'police') {
        const dmg = hitHead ? w.headDmg : w.dmg;
        damageNPC(hitOwner, dmg, hitPoint, dir);
        triggerCrime(hitOwner.type === 'police' ? 1.6 : 0.9);
        floatText(hitHead ? 'HEADSHOT!' : 'TRÚNG!', mouse.x + 18, mouse.y - 44, '#f66');
        hitMark();
      } else if (hitOwner.group && !hitOwner.dead) {
        // metal: sparks fly, the wreck smoulders and finally BLOWS UP
        spawnSparks(hitPoint, dir);
        Sfx.metalHit();
        hitOwner.shot = (hitOwner.shot || 0) + 1;
        const left = w.carHits - hitOwner.shot;
        floatText(left > 0 ? 'XE HỎNG · còn ' + left : '💥 NỔ TUNG!', mouse.x + 18, mouse.y - 44, left > 0 ? '#fc6' : '#f80');
        if (left <= 0) explodeCar(hitOwner);
      }
    } else {
      spawnSplat(hitPoint.clone().setY(0));
    }

    if (getAmmo(player.weapon) <= 0) toast('HẾT ĐẠN! Nhấn R để nạp');
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
    } else {
      hitMark();
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
    car.curSpeed = 0;
    Sfx.boom();
    const p = car.pos.clone().setY(1);

    // fireball (outer orange + inner yellow core)
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.95 }));
    boom.position.copy(p);
    scene.add(boom);
    tracers.push({ mesh: boom, life: 0.5, t: 0, grow: true });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 1 }));
    core.position.copy(p);
    scene.add(core);
    tracers.push({ mesh: core, life: 0.32, t: 0, grow: true });

    // debris + sparks flying out
    for (let i = 0; i < 14; i++) spawnBlood(p, new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5), 2, 0x333330);
    for (let i = 0; i < 10; i++) spawnSparks(p, new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5));
    // smoke column
    for (let i = 0; i < 9; i++) spawnSmoke(p.clone().add(new THREE.Vector3((rng() - 0.5) * 1.6, rng() * 1.2, (rng() - 0.5) * 1.6)), 0.9 + rng());
    // scorched asphalt + charred wreck stays on the map
    spawnScorch(car.pos);
    const u = car.group.userData;
    [u.body, u.cabin, u.hood, u.trunk].forEach(m => { if (m && m.material && m.material.color) m.material.color.setHex(0x181818); });
    if (u.lightRed) { u.lightRed.visible = false; u.lightBlue.visible = false; }
    if (car.driverMesh) { car.group.remove(car.driverMesh); car.driverMesh = null; }
    car.group.rotation.z += (rng() - 0.5) * 0.22;
    [u.body, u.cabin, u.hood, u.trunk].forEach(m => {
      const hi = hittables.indexOf(m); if (hi >= 0) hittables.splice(hi, 1);
    });

    // blast damages pedestrians around the wreck
    NPCs.forEach(n => {
      if (n.dead) return;
      const d = n.pos.distanceTo(car.pos);
      if (d < 6) damageNPC(n, Math.max(20, 90 - d * 12), n.pos.clone().setY(1.1), n.pos.clone().sub(car.pos).normalize());
    });

    // hero caught in the blast
    if (player.inCar === car || car.driver === player) {
      // thrown clear of the exploding car
      const c = car;
      c.driver = null;
      const side = new THREE.Vector3(Math.cos(c.heading), 0, -Math.sin(c.heading)).multiplyScalar(-2.4);
      const ep = c.group.position.clone().add(side);
      clampToWorld(ep);
      player.pos.copy(ep);
      player.group.position.copy(ep);
      scene.add(player.group);
      player.inCar = null;
      updateHealthHUD();
      playerTakeDamage(55, car.pos);
      toast('XE NỔ TUNG! Bạn bắn ra ngoài kịp lúc...');
    } else if (!player.inCar && !player.dead) {
      const pd = player.pos.distanceTo(car.pos);
      if (pd < 5.5) playerTakeDamage(Math.max(15, 60 - pd * 9), car.pos);
    }

    // CHAIN REACTION: nearby cars catch fire and pop shortly after
    cars.forEach(o => {
      if (o !== car && !o.dead && !o.driver && o.fuseT === undefined && o.group.position.distanceTo(car.group.position) < 5.5) {
        o.fuseT = 0.35 + rng() * 0.65;
      }
    });

    triggerCrime(1.5);
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
  let lastSirenAt = 0;
  const _rpos = new THREE.Vector3();   // scratch: rendered run-over position

  /* ---- wanted-level escalation tables ---- */
  const CRUISERS_FOR_STARS = [0, 1, 2, 3, 5, 99];   // index = star level
  const FOOT_COPS_FOR_STARS = [0, 0, 0, 2, 4, 6];   // walking cops hunting the hero
  function cruisersForWanted() {
    return CRUISERS_FOR_STARS[Math.min(5, Math.max(1, Math.round(player.wanted)))];
  }
  // response rank is DYNAMIC: dead cruisers don't hold a slot,
  // survivors are re-ranked every simulation tick
  let beatRankCache = null;
  function beatRank(car) {
    if (!beatRankCache) {
      beatRankCache = cars.filter(c => c.isPolice && !c.dead)
        .sort((a, b) => (a.beatIdx === undefined ? 999 : a.beatIdx) -
                        (b.beatIdx === undefined ? 999 : b.beatIdx));
    }
    return beatRankCache.indexOf(car);
  }
  // higher stars: precinct radio ORDERS beat cops to join the chase citywide;
  // if nobody's close, a fresh squad materialises near the hero (level 3+)
  let escalT = 0;
  function updateEscalation(dt) {
    if (player.dead || player.wanted <= 0) { escalT = 0; return; }
    const quota = FOOT_COPS_FOR_STARS[Math.min(5, Math.max(1, Math.round(player.wanted)))];
    if (!quota) return;
    escalT -= dt;
    if (escalT > 0) return;
    escalT = 5;
    let chasing = 0, best = null, bd = Infinity;
    NPCs.forEach(n => {
      if (n.dead || n.type !== 'police') return;
      if (n.state === 'chase') { chasing++; return; }
      const d = n.pos.distanceToSquared(player.pos);
      if (d < bd) { bd = d; best = n; }
    });
    if (chasing >= quota) return;
    if (!best || bd > 100 * 100) {
      // reinforcements roll in: new officer appears nearby
      const cop = makeNPC('police');
      for (let t = 0; t < 24; t++) {
        const p = randomLocalPoint(player.pos, 70);
        if (!isInsideBuilding(p.x, p.z) && !isInsideWater(p.x, p.z)) { cop.pos.copy(p); break; }
      }
      cop.group.position.copy(cop.pos);
      best = cop;
    }
    best.state = 'chase';                // dispatch order received
    best.path = [];
    Sfx.warn();
  }

  function updateCar(car, dt) {
    if (car.dead) return;
    if (car.driver) return;   // player-driven

    // burning fuse after a chain-reaction ignition
    if (car.fuseT !== undefined) {
      car.fuseT -= dt;
      car.smokeT = (car.smokeT || 0) - dt;
      if (car.smokeT <= 0) { car.smokeT = 0.09; spawnSmoke(car.pos.clone().setY(1.15), 0.9); }
      if (car.fuseT <= 0) { explodeCar(car); return; }
    } else if ((car.shot || 0) > 0) {
      // damaged engine smoulders, warning the player it can blow
      car.smokeT = (car.smokeT || 0) - dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.26;
        spawnSmoke(new THREE.Vector3(
          car.group.position.x + Math.sin(car.heading) * 1.4,
          1.05,
          car.group.position.z + Math.cos(car.heading) * 1.4), 0.55);
      }
    }

    // ---- police PURSUIT mode: WANTED-LEVEL ESCALATION ----
    // how many cruisers join the hunt depends on the star level:
    // 1 sao -> 1 xe, 2 -> 2, 3 -> 3, 4 -> 5, 5 -> TẤT CẢ
    const wanted = !player.dead && player.wanted > 0;
    if (car.isPolice && wanted && car.mode !== 'pursuit' &&
        (car.beatIdx === undefined || beatRank(car) < cruisersForWanted())) {
      car.mode = 'pursuit';
      car.deployed = false;              // fresh hunt -> fresh officer
    } else if (car.mode === 'pursuit' && (!wanted || !car.isPolice)) {
      car.mode = 'traffic';              // stars gone -> back to patrol
    }

    if (car.mode === 'pursuit') drivePursuit(car, dt);
    else driveTraffic(car, dt);

    // siren wail while hunting (visual flicker lives in the interpolated render pass)
    if (car.mode === 'pursuit' && car.group.userData.lightRed &&
        performance.now() - lastSirenAt > 4200 &&
        car.pos.distanceTo(player.pos) < 50) {
      lastSirenAt = performance.now();
      Sfx.siren();
    }

    // run over pedestrians — NPCs only, never the player.
    // The blame goes to the player ONLY when he is the one driving.
    if (car.curSpeed > 2) {
      _rpos.set(
        car.pos.x + Math.cos(car.heading) * car.laneOffset, 0,
        car.pos.z - Math.sin(car.heading) * car.laneOffset);
      const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
      NPCs.forEach(n => {
        if (n.dead) return;
        const d = n.pos.distanceTo(_rpos);
        if (d < 1.1) {
          damageNPC(n, 40, n.pos.clone().setY(1.0), fwd);
          if (car.driver) {
            if (n.type === 'police') triggerCrime(1.5);
            else triggerCrime(0.8);
          }
        }
      });
    }
    // player takes NO damage from cars (chạm xe không chết)
    // NOTE: group transforms are applied in animate() via interpolation
  }

  // normal route traffic: gentle throttle, firm-smooth braking for the hero,
  // lifts off for sharp corners and steers with a capped turn rate
  function driveTraffic(car, dt) {
    const route = car.route;
    let wx = route[car.wpIndex][0], wz = route[car.wpIndex][1];
    let dxT = wx - car.pos.x, dzT = wz - car.pos.z;
    if (dxT * dxT + dzT * dzT < 12.25) {                    // waypoint reached (3.5 m)
      car.wpIndex = (car.wpIndex + 1) % route.length;
      wx = route[car.wpIndex][0]; wz = route[car.wpIndex][1];
      dxT = wx - car.pos.x; dzT = wz - car.pos.z;
    }

    const desired = Math.atan2(dxT, dzT);
    let dh = desired - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;

    const playerNear = !player.inCar && !player.dead && car.pos.distanceTo(player.pos) < 4.5;

    // real-car pacing: ease onto the throttle, lift off for sharp turns,
    // and brake to a FULL but silky stop whenever the hero stands ahead
    let target = car.maxSpeed * Math.max(0.35, 1 - Math.abs(dh) * 0.55);
    let rate = 1.9;
    if (playerNear) { target = 0; rate = 6; }
    car.curSpeed += (target - car.curSpeed) * Math.min(1, dt * rate);
    if (playerNear && car.curSpeed < 0.02) car.curSpeed = 0;

    if (car.curSpeed > 0.01) {
      steerToward(car, wx, wz, dt, false, 2.4);
      const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
      car.pos.addScaledVector(fwd, car.curSpeed * dt);
      clampToWorld(car.pos);
    }
  }

  // WANTED pursuit: race at the hero, glide to a halt close by,
  // officer jumps out shooting
  function drivePursuit(car, dt) {
    const dist = car.pos.distanceTo(player.pos);
    let target, rate;
    if (dist < 11) {
      target = 0; rate = 5;                                  // smooth skid to the kerb
      if (car.curSpeed < 0.8 && !car.deployed) {
        deployOfficer(car);
        car.deployed = true;
      }
    } else {
      target = 13; rate = 2.2;                               // flat-out pursuit
      if (car.deployed && dist > 16) car.deployed = false;   // lost him again? re-arm
    }
    car.curSpeed += (target - car.curSpeed) * Math.min(1, dt * rate);
    if (target === 0 && car.curSpeed < 0.03) car.curSpeed = 0;

    if (car.curSpeed > 0.01) {
      steerToward(car, player.pos.x, player.pos.z, dt, true, 3.2);
      const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
      const step = fwd.clone().multiplyScalar(car.curSpeed * dt);
      car.pos.add(step);
      if (isInsideBuilding(car.pos.x, car.pos.z)) car.pos.sub(step);   // never clip walls
      clampToWorld(car.pos);
    }
  }

  // shared steering with a CAPPED TURN RATE — no snapping, always fluid arcs
  function steerToward(car, tx, tz, dt, avoid, turnRate) {
    const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    let dh = desired - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    if (avoid) {
      const ahead = 3.4;
      const fx = car.pos.x + Math.sin(car.heading) * ahead;
      const fz = car.pos.z + Math.cos(car.heading) * ahead;
      if (isInsideBuilding(fx, fz)) {
        const lx = car.pos.x + Math.sin(car.heading + 0.9) * ahead;
        const lz = car.pos.z + Math.cos(car.heading + 0.9) * ahead;
        dh = (isInsideBuilding(lx, lz) ? -1 : 1) * 1.1;   // swing to the free side
      }
    }
    const maxTurn = (turnRate || 2.4) * dt;                  // rad/s ceiling
    car.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
  }

  // a police officer jumps out of the stopped cruiser and hunts the hero on foot
  function deployOfficer(c) {
    const ped = makeNPC('police');
    c.deploySide = -(c.deploySide || 2.2);            // alternate doors
    const side = new THREE.Vector3(Math.cos(c.heading), 0, -Math.sin(c.heading))
      .multiplyScalar(c.deploySide);
    const p = c.group.position.clone().add(side);
    p.y = 0;
    if (isInsideBuilding(p.x, p.z) || isInsideWater(p.x, p.z)) {
      // on a bridge / tight spot: step out along the road instead
      p.copy(c.group.position).add(new THREE.Vector3(0, 0, c.deploySide * 2.2));
    }
    clampToWorld(p);
    ped.pos.copy(p);
    ped.group.position.copy(p);
    ped.state = 'chase';
    ped.path = [];
    Sfx.warn();
    return ped;
  }

  /* ---------------- Vehicle enter/exit (carjacking) ---------------- */
  function nearestCar() {
    let best = null, bd = 3.4;
    cars.forEach(c => {
      if (c.dead) return;
      const d = c.group.position.distanceTo(player.pos);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }

  // kick the AI driver out of the car: he spawns beside the door and runs away
  function ejectDriver(c) {
    if (c.driverMesh) { c.group.remove(c.driverMesh); c.driverMesh = null; }
    const type = c.isPolice ? 'police' : 'civilian';
    const ped = makeNPC(type);
    const side = new THREE.Vector3(Math.cos(c.heading), 0, -Math.sin(c.heading));
    const p = c.group.position.clone().addScaledVector(side, -2.2);
    p.y = 0;
    if (isInsideBuilding(p.x, p.z)) p.copy(c.group.position).addScaledVector(side, 2.2);
    if (isInsideWater(p.x, p.z)) {   // on a bridge: shove him along the deck instead
      p.copy(c.group.position).add(new THREE.Vector3(0, 0, c.heading > 0 ? -2.4 : 2.4));
      if (isInsideWater(p.x, p.z)) p.z = RIVER_Z + (p.z >= RIVER_Z ? 1 : -1) * (RIVER_HALF + 1.5);
    }
    clampToWorld(p);
    ped.pos.copy(p);
    ped.group.position.copy(p);
    const away = ped.pos.clone().sub(player.pos).setY(0);
    if (type === 'police') {
      ped.state = 'chase'; ped.path = [];   // jacked cop is angry
    } else {
      ped.state = 'flee';
      ped.fleeDir.copy(away.lengthSq() > 0.001 ? away.normalize() : new THREE.Vector3(1, 0, 0));
      ped.fleeT = 7;
    }
    Sfx.warn();
    return ped;
  }

  function enterCar() {
    if (player.inCar) return;
    const c = nearestCar();
    if (!c) { toast('Không có xe nào gần đây'); return; }
    player.inCar = c;
    c.driver = player;
    scene.remove(player.group);
    if (!c.stolen) {
      // TRỘM XE: this car still has its AI driver inside
      c.stolen = true;
      ejectDriver(c);
      triggerCrime(c.isPolice ? 2.2 : 1.2);   // stealing raises the wanted stars
      toast(c.isPolice
        ? 'Trộm xe CẢNH SÁT! Cảnh sát đang truy đuổi!'
        : 'Đã trộm xe — tài xế bị đẩy ra và bỏ chạy!');
    } else {
      toast('Đã lên xe — WASD lái, E xuống xe');
    }
    Sfx.car();
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
    else if (code === 'Digit4' || code === 'Numpad4') setPlayerWeapon(3);
    else if (code === 'KeyR') {
      const w = WEAPONS[player.weapon];
      if (w && w.kind === 'gun') {
        setAmmo(player.weapon, w.mag);
        updateAmmoHUD();
        Sfx.click();
        toast('Đã nạp đầy ' + w.name + ': ' + w.mag + ' viên');
      }
    }
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
      const w = WEAPONS[player.weapon];
      if (w && w.kind === 'gun') fireGun();
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
  const CAM_HEIGHT = 46, CAM_BACK = 28;      // high enough for a wide overview
  const camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const p = player.inCar ? player.inCar.group.position : player.pos;
    const desired = new THREE.Vector3(p.x, CAM_HEIGHT, p.z + CAM_BACK);
    const k = 1 - Math.pow(0.001, dt);
    camTarget.lerp(desired, k);
    camera.position.copy(camTarget);
    camera.lookAt(p.x, 0, p.z);
  }

  /* ---------------- See-through occlusion ----------------
     The camera looks from the south. A tall building standing between it and
     a character would hide them — so any building blocking the view of the
     hero OR of nearby pedestrians smoothly fades to glass (opacity ~0.15)
     and fades back once the path is clear. Roads & people stay visible. */
  function updateOcclusion(dt) {
    // watchers: the hero + every pedestrian close enough to matter
    const watchers = [];
    watchers.push(player.inCar ? player.inCar.group.position : player.pos);
    for (let i = 0; i < NPCs.length; i++) {
      const n = NPCs[i];
      if (n.dead) continue;
      const dx = n.pos.x - watchers[0].x, dz = n.pos.z - watchers[0].z;
      if (dx * dx + dz * dz < 2025) watchers.push(n.pos);   // within 45 m
    }
    for (let i = 0; i < buildingBoxes.length; i++) {
      const b = buildingBoxes[i];
      let target = 1;
      for (let j = 0; j < watchers.length && target === 1; j++) {
        const wx = watchers[j].x, wz = watchers[j].z;
        // sight ray rises from the watcher towards the camera (south).
        // It stays below the rooftop until z = wz + 0.609*h, so a building
        // whose south face begins inside that window blocks the view.
        if (
          b.maxX > wx - 1.4 && b.minX < wx + 1.4 &&                 // overlaps sight column
          b.minZ > wz - 0.6 &&                                      // south of the watcher...
          b.minZ <= wz + Math.min(CAM_BACK, 0.609 * b.h)            // ...inside the blind window
        ) target = 0.15;
      }
      if (target !== b.lastOp) {
        b.fade += (target - b.fade) * Math.min(1, dt * 10);
        const op = Math.abs(b.fade - target) < 0.01 ? target : b.fade;
        if (op !== b.lastOp) {
          const fading = op < 0.999;
          b.mats[0].transparent = fading;      // transparent pipeline only while needed
          b.mats[1].transparent = fading;
          b.mats[0].opacity = op;
          b.mats[1].opacity = op;
          b.lastOp = op;
        }
      }
    }
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
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.t += dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const sc = 1 + s.grow * dt;
      s.mesh.scale.multiplyScalar(sc);
      s.mesh.material.opacity = Math.max(0, 0.55 * (1 - s.t / s.life));
      if (s.t >= s.life) { scene.remove(s.mesh); smokes.splice(i, 1); }
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
  const shotsEl = document.getElementById('shotsN');
  const heldIcon = document.getElementById('heldIcon');
  const heldName = document.getElementById('heldName');
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
    const w = WEAPONS[player.weapon];
    if (w && heldIcon) {
      heldIcon.textContent = w.icon;       // big glyph of the item in hand
      heldName.textContent = w.name;
    }
    updateAmmoHUD();
  }
  function updateAmmoHUD() {
    const w = WEAPONS[player.weapon];
    if (w && w.kind === 'gun') ammoN.textContent = getAmmo(player.weapon);
    else ammoN.textContent = '—';
  }
  function updateShotsHUD() { if (shotsEl) shotsEl.textContent = player.shotsFired || 0; }
  function pulseAmmo() {
    ammoN.classList.remove('pulse');
    void ammoN.offsetWidth;           // restart CSS animation
    ammoN.classList.add('pulse');
  }
  let hitT = null;
  function hitMark() {
    crosshair.classList.add('hit');
    clearTimeout(hitT);
    hitT = setTimeout(() => crosshair.classList.remove('hit'), 140);
  }
  function floatText(txt, x, y, color) {
    const old = document.querySelectorAll('.floater');
    if (old.length > 12) old[0].remove();
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = txt;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (color) el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 750);
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
    player.pos.copy(SPAWN); player.group.position.copy(player.pos);
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
    // river over the roads...
    g.fillStyle = '#17384f';
    g.fillRect(W2(-CITY / 2), W2(RIVER_Z - RIVER_HALF), CITY * mScale, RIVER_HALF * 2 * mScale);
    // ...then bridge stripes where avenues cross
    g.fillStyle = '#3a4046';
    for (let i = 0; i <= N; i++) {
      g.fillRect(W2(cx(i) - ROAD / 2), W2(RIVER_Z - RIVER_HALF), ROAD * mScale, RIVER_HALF * 2 * mScale);
    }
  }
  function updateMinimap() {
    mctx.drawImage(mmapStatic, 0, 0);
    const W2 = (x) => (x + GROUND_HALF) * mScale;
    const dot = (x, z, c, r) => { mctx.fillStyle = c; mctx.fillRect(W2(x) - r / 2, W2(z) - r / 2, r, r); };
    cars.forEach(c => { if (!c.dead) dot(c.group.position.x, c.group.position.z, c.isPolice ? '#6af' : '#fc3', 3); });
    boats.forEach(b => dot(b.pos.x, b.pos.z, '#7ef', 3));
    NPCs.forEach(n => { if (!n.dead) dot(n.pos.x, n.pos.z, n.type === 'police' ? '#35f' : '#5c5', 2); });
    if (player) dot(player.pos.x, player.pos.z, '#fff', 4);
  }

  /* ---------------- Loop ---------------- */
  const clock = new THREE.Clock();
  const FIXED_STEP = 1 / 60;                 // physics runs at a steady 60 Hz
  let simAcc = 0;
  const _ipos = new THREE.Vector3();
  function angLerp(a, b, t) {                // shortest-path angle interpolation
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());

    // snapshot the pre-step state so rendering can interpolate smoothly
    cars.forEach(c => { c.prevPos.copy(c.pos); c.prevHeading = c.heading; });
    player.prevPos.copy(player.pos);

    // FIXED-TIMESTEP SIMULATION — identical handling at any frame rate,
    // lag spikes can no longer teleport cars across the map
    simAcc += dt;
    let steps = 0;
    while (simAcc >= FIXED_STEP && steps < 4) {
      beatRankCache = null;                  // re-rank survivors every tick
      if (!player.dead) updatePlayer(FIXED_STEP);
      NPCs.forEach(n => updateNPC(n, FIXED_STEP));
      cars.forEach(c => updateCar(c, FIXED_STEP));
      boats.forEach(b => updateBoat(b, FIXED_STEP));
      updateEscalation(FIXED_STEP);
      simAcc -= FIXED_STEP;
      steps++;
    }
    if (steps === 4) simAcc = 0;             // huge hitch: drop the backlog
    const alpha = Math.max(0, Math.min(1, simAcc / FIXED_STEP));

    // RENDER INTERPOLATION — every car glides between its last two physics states
    cars.forEach(c => {
      if (!c.dead) {
        _ipos.copy(c.prevPos).lerp(c.pos, alpha);
        const ih = angLerp(c.prevHeading, c.heading, alpha);
        const rx = _ipos.x + Math.cos(ih) * c.laneOffset;
        const rz = _ipos.z - Math.sin(ih) * c.laneOffset;
        c.group.position.set(rx, groundY(rx, rz), rz);   // ride the bridge ramps visually
        c.group.rotation.y = ih;
        c.group.userData.wheels.forEach(w => w.rotation.x += c.curSpeed * dt * 4);
        if (c.group.userData.lightRed) {
          const t = performance.now() / 160;
          const on = Math.floor(t) % 2 === 0;
          c.group.userData.lightRed.visible = on;
          c.group.userData.lightBlue.visible = !on;
        }
      }
    });

    // hero glides on foot as well
    if (!player.inCar) {
      _ipos.copy(player.prevPos).lerp(player.pos, alpha);
      player.group.position.set(_ipos.x, groundY(_ipos.x, _ipos.z), _ipos.z);
    }
    // walking characters follow the bridge decks / ramps too
    NPCs.forEach(n => {
      if (!n.dead) n.group.position.y = groundY(n.pos.x, n.pos.z);
    });

    updateFX(dt);
    updateCamera(dt);

    if (flashT > 0) { flashT -= dt; flashEl.style.opacity = Math.max(0, flashT * 2); }
    updateOcclusion(dt);
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
    Sfx.startAmbient();
    buildStars();
    buildMinimapStatic();
    updateHealthHUD();
    updateWantedHUD();
    updateWeaponHUD();
    updateAmmoHUD();
    updateShotsHUD();
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
  camera.position.set(SPAWN.x, CAM_HEIGHT, SPAWN.z + CAM_BACK);
  camera.lookAt(SPAWN.x, 0, SPAWN.z);
  renderer.render(scene, camera);

  // debug / testing hook (harmless in production)
  window.__GTA__ = {
    get player() { return player; }, NPCs, cars, boats, WEAPONS, hittables,
    get camera() { return camera; }, get scene() { return scene; },
    N, RIVER_Z, RIVER_HALF, isInsideBuilding, isInsideWater, groundY,
    buildingBoxes, CITY_CORES,
    // test hooks: rebuild the police cruiser fleet via the production spawner
    spawnCruiser() {
      const c = makeCarEntity({ isPolice: true, color: 0xe8e8e8, speed: 9.5 });
      c.beatIdx = Math.max(-1, ...cars.filter(x => x.isPolice && x !== c)
        .map(x => x.beatIdx === undefined ? -1 : x.beatIdx)) + 1;
      return c;
    },
    dispatchCopNear(px, pz) {
      const cop = makeNPC('police');
      for (let t = 0; t < 24; t++) {
        const p = randomLocalPoint(new THREE.Vector3(px, 0, pz), 70);
        if (!isInsideBuilding(p.x, p.z) && !isInsideWater(p.x, p.z)) { cop.pos.copy(p); break; }
      }
      cop.group.position.copy(cop.pos);
      return cop;
    }
  };
})();
