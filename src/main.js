import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildWorld } from './table.js';
import { Ball, BALL_R } from './physics.js';

/* ============================================================
   NEON PINBALL — game shell: rendering, audio, rules, input.
   Physics lives in physics.js / table.js; this file maps
   board-space physics state onto meshes and tracks the score.
   Rendering map: board (x, y, h) -> world (x, h, -y). The board
   group is tilted about X so "up-field" (-z) is uphill.
   ============================================================ */

const TILT = 0.115; // visual tilt of the playfield (rad)

const dom = {
  score: document.getElementById('score'),
  mult: document.getElementById('mult'),
  comboFill: document.getElementById('comboFill'),
  balls: document.getElementById('balls'),
  ballNo: document.getElementById('ballNo'),
  msg: document.getElementById('msg'),
  powerFill: document.getElementById('powerFill'),
  camMode: document.getElementById('camMode'),
  fps: document.getElementById('fps'),
  overlay: document.getElementById('overlay'),
  startBtn: document.getElementById('startBtn'),
  stats: document.getElementById('stats'),
};

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060d);
scene.fog = new THREE.Fog(0x04060d, 2.2, 6);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.02, 20);
camera.position.set(0.02, 0.78, 0.62);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.6, 0.9));

// ---------- lighting ----------
scene.add(new THREE.HemisphereLight(0x334466, 0x0a0a12, 0.9));
const key = new THREE.DirectionalLight(0xfff2dd, 2.2);
key.position.set(0.9, 2.0, 0.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -0.5; key.shadow.camera.right = 0.5;
key.shadow.camera.top = 0.7; key.shadow.camera.bottom = -0.3;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 4;
scene.add(key);
const neonCyan = new THREE.PointLight(0x00e5ff, 2.0, 1.6); neonCyan.position.set(-0.55, 0.55, -0.55);
const neonMag = new THREE.PointLight(0xff2d95, 2.0, 1.6); neonMag.position.set(0.55, 0.5, -0.9);
const neonAmb = new THREE.PointLight(0xffb300, 1.4, 1.4); neonAmb.position.set(0, 0.45, 0.35);
scene.add(neonCyan, neonMag, neonAmb);

// ---------- board group ----------
const board = new THREE.Group();
board.rotation.x = TILT; // lifts the far (-z) end
scene.add(board);

const world = buildWorld();

// ---------- procedural deck texture ----------
function makeDeckTexture() {
  const S = 1024, W = Math.round(S * (0.44 / 0.94)), H = S;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#241428');
  base.addColorStop(0.5, '#1a1030');
  base.addColorStop(1, '#241428');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  g.globalAlpha = 0.06;
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = Math.random() > 0.5 ? '#000' : '#8899ff';
    g.lineWidth = Math.random() * 2.4;
    const x = Math.random() * W, y = Math.random() * H;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 60, y + Math.random() * 90);
    g.stroke();
  }
  g.globalAlpha = 1;

  // neon lane decals (glow strokes) — canvas y grows downward = board -y
  const sx = (bx) => ((bx + 0.22) / 0.44) * W;
  const sy = (by) => (1 - by / 0.94) * H;
  const glowLine = (pts, color, width) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))));
    g.stroke();
    g.shadowBlur = 0;
  };
  glowLine([[-0.185, 0.62], [-0.185, 0.36], [-0.13, 0.24], [-0.13, 0.16]], '#00e5ff', 5); // left orbit
  glowLine([[0.185, 0.4], [0.185, 0.6], [0.12, 0.66], [0, 0.7], [-0.12, 0.66], [-0.16, 0.58]], '#ff2d95', 5); // loop
  glowLine([[0.1325, 0.34], [0.1236, 0.51]], '#ffb300', 5); // ramp
  glowLine([[-0.17, 0.13], [-0.05, 0.13]], '#00e5ff', 4); // left inlane
  glowLine([[0.17, 0.13], [0.05, 0.13]], '#ff2d95', 4); // right inlane

  g.save();
  g.translate(W / 2, H * 0.42);
  g.textAlign = 'center';
  g.font = `800 ${Math.round(W * 0.11)}px Orbitron, sans-serif`;
  g.fillStyle = 'rgba(255,45,149,0.5)';
  g.shadowColor = '#ff2d95'; g.shadowBlur = 24;
  g.fillText('NEON', 0, 0);
  g.fillStyle = 'rgba(0,229,255,0.5)';
  g.shadowColor = '#00e5ff';
  g.fillText('PINBALL', 0, Math.round(W * 0.13));
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------- playfield deck ----------
{
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.94),
    new THREE.MeshStandardMaterial({ map: makeDeckTexture(), roughness: 0.35, metalness: 0.15 })
  );
  deck.rotation.x = -Math.PI / 2; // lay the textured plane flat
  deck.position.set(0, 0, -0.47); // board y in [0, 0.94] -> z in [-0.94, 0]
  deck.receiveShadow = true;
  board.add(deck);
}

// ---------- cabinet shell + underglow ----------
{
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x120a18, roughness: 0.5, metalness: 0.4 });
  const side = new THREE.BoxGeometry(0.03, 0.06, 0.98);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(side, shellMat);
    m.position.set(s * 0.235, -0.01, -0.47);
    board.add(m);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.03), shellMat);
  back.position.set(0, -0.01, -0.955);
  board.add(back);
  const glowMat = (hex) => new THREE.MeshBasicMaterial({ color: hex });
  for (const [s, hex] of [[-1, 0x00e5ff], [1, 0xff2d95]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.94), glowMat(hex));
    strip.position.set(s * 0.252, -0.041, -0.47);
    board.add(strip);
  }
}

// ---------- rails & slingshot rubbers from world geometry ----------
{
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd8, roughness: 0.45, metalness: 0.6 });
  const slingMat = new THREE.MeshStandardMaterial({ color: 0xff5722, emissive: 0xff5722, emissiveIntensity: 0.5, roughness: 0.6 });
  for (const w of world.walls) {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (L < 1e-4) continue;
    const isSling = w.kind === 'sling';
    const geo = new THREE.CylinderGeometry(isSling ? 0.005 : 0.0045, isSling ? 0.005 : 0.0045, L, 8);
    const m = new THREE.Mesh(geo, isSling ? slingMat : railMat);
    m.position.set((w.a.x + w.b.x) / 2, isSling ? 0.012 : 0.011, -(w.a.y + w.b.y) / 2);
    m.rotation.order = 'YXZ';
    m.rotation.y = Math.atan2(w.b.x - w.a.x, -(w.b.y - w.a.y));
    m.rotation.x = Math.PI / 2; // cylinder axis Y -> along the wall in XZ
    m.castShadow = true;
    board.add(m);
  }
}

// ---------- posts & bumpers ----------
{
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.6, emissive: 0x221100 });
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0xff2d95, emissive: 0xff2d95, emissiveIntensity: 0.6, roughness: 0.4 });
  const bumperSkirtMat = new THREE.MeshStandardMaterial({ color: 0x0a2a33, emissive: 0x00e5ff, emissiveIntensity: 0.35, roughness: 0.6 });
  for (const c of world.circles) {
    const isBumper = c.kind === 'bumper';
    const r = c.r + (isBumper ? 0.006 : 0.002);
    const h = isBumper ? 0.03 : 0.024;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 20),
      isBumper ? bumperMat.clone() : postMat
    );
    m.position.set(c.c.x, h / 2 + 0.004, -c.c.y);
    m.castShadow = true;
    board.add(m);
    if (isBumper) {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.7, 0.008, 20), bumperSkirtMat.clone());
      skirt.position.set(c.c.x, 0.006, -c.c.y);
      board.add(skirt);
      c.flashMesh = m; // flash-on-hit glow in the frame loop
    }
  }
}

// ---------- elevated lanes: loop tube + ramp deck ----------
function hAt(x, y) { return world.height ? world.height(x, y) : 0; }
{
  // loop tube: entry run up the launch lane, arc across the top, descent
  // into the left orbit lane — same centerline as the physics height field.
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const y = 0.40 + (i / 10) * 0.22;
    pts.push(new THREE.Vector3(0.182, hAt(0.182, y) + 0.016, -y));
  }
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI / 2 - (i / 24) * Math.PI; // right -> over the top -> left
    const x = 0.18 * Math.sin(a), y = 0.62 + 0.18 * Math.cos(a);
    pts.push(new THREE.Vector3(x, hAt(x, y) + 0.016, -y));
  }
  for (let i = 1; i <= 6; i++) {
    const x = -0.18 - (i / 6) * 0.005, y = 0.62 - (i / 6) * 0.06;
    pts.push(new THREE.Vector3(x, hAt(x, y) + 0.014, -y));
  }
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.017, 10, false),
    new THREE.MeshPhysicalMaterial({
      color: 0x66e0ff, transparent: true, opacity: 0.32,
      roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide,
      emissive: 0x00637a, emissiveIntensity: 0.5,
    })
  );
  board.add(tube);
}
{
  // ramp deck: ribbon from (0.1325, 0.33) to (0.1236, 0.51)
  const ax = 0.1325, ay = 0.33, bx = 0.1236, by = 0.51;
  const N = 28;
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L; // lateral offset direction
  const hw = 0.016;
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cx = ax + dx * t, cy = ay + dy * t;
    for (const s of [-1, 1]) {
      const x = cx + nx * hw * s, y = cy + ny * hw * s;
      pos.push(x, hAt(x, y) + 0.004, -y);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  board.add(new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      color: 0xffb300, transparent: true, opacity: 0.4, roughness: 0.2,
      emissive: 0x664400, emissiveIntensity: 0.4, side: THREE.DoubleSide,
    })
  ));
}

// ---------- flippers ----------
const flipperMeshes = [];
{
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2ff, emissive: 0xff2d95, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.5 });
  for (const f of world.flippers) {
    const geo = new THREE.CapsuleGeometry(0.011, f.len - 0.022, 6, 16);
    geo.rotateZ(Math.PI / 2); // capsule axis Y -> X (rotation.y then orients it)
    geo.translate(f.len / 2, 0, 0); // extends from the pivot instead of centered on it
    const m = new THREE.Mesh(geo, mat);
    m.position.set(f.pivot.x, 0.012, -f.pivot.y);
    m.rotation.order = 'YXZ';
    m.castShadow = true;
    board.add(m);
    flipperMeshes.push({ mesh: m, f });
  }
}

// ---------- plunger ----------
const plunger = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12),
    new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.3, metalness: 0.8 })
  );
  body.rotation.x = Math.PI / 2;
  const spring = new THREE.Mesh(
    new THREE.TorusGeometry(0.006, 0.0016, 6, 24),
    new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.9 })
  );
  spring.rotation.x = Math.PI / 2;
  spring.position.z = 0.02;
  plunger.add(body, spring);
  plunger.position.set(0.182, 0.012, -0.035);
  board.add(plunger);
}

// ---------- balls (physics + meshes) ----------
const ballMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.22, metalness: 0.75, envMapIntensity: 0.8 });
const ballGeo = new THREE.SphereGeometry(BALL_R, 24, 16);
const balls = [];
for (let i = 0; i < 3; i++) {
  const b = new Ball();
  b.mesh = new THREE.Mesh(ballGeo, ballMat);
  b.mesh.castShadow = true;
  b.mesh.visible = false;
  board.add(b.mesh);
  balls.push(b);
}

// ---------- audio (WebAudio synth, no assets) ----------
class AudioEngine {
  constructor() { this.ctx = null; }
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  _env(node, vol, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    node.connect(g); g.connect(this.ctx.destination);
  }
  tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), this.ctx.currentTime + dur);
    this._env(o, vol, dur);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  noise(dur, vol, freq) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
    src.connect(bp);
    this._env(bp, vol, dur);
    src.start();
  }
  clack(v) { this.noise(0.035, Math.min(0.25, v * 0.2), 1400); }
  bumper() { this.tone(880, 0.09, 'square', 0.12, -300); }
  sling() { this.tone(320, 0.12, 'sawtooth', 0.12, 240); }
  flip() { this.noise(0.02, 0.08, 900); }
  launch() { this.noise(0.4, 0.14, 500); }
  drain() { this.tone(440, 0.5, 'triangle', 0.14, -320); }
}
const audio = new AudioEngine();

// ---------- game state ----------
const G = {
  mode: 'idle', // idle | playing | over
  score: 0,
  combo: 0,
  mult: 1,
  ballNo: 1,
  plungerPower: 0,
  charging: false,
  lastEventT: 0,
  loopBonusUsed: false, // multiball: one extra ball per loop pass
};

const SCORES = { wall: 10, post: 10, bumper: 150, sling: 120, orbit: 500, loop: 1000, ramp: 750, inlane: 250 };

function fmt(n) { return n.toLocaleString('de-DE'); }
function setMsg(text, ms = 1400) {
  dom.msg.textContent = text;
  clearTimeout(setMsg._t);
  if (text) setMsg._t = setTimeout(() => { dom.msg.textContent = ''; }, ms);
}
function updateHud() {
  dom.score.textContent = fmt(G.score);
  dom.mult.textContent = `x${G.mult}`;
  dom.comboFill.style.width = `${Math.min(100, (G.combo % 10) * 10)}%`;
  dom.ballNo.textContent = String(G.ballNo);
  const live = balls.filter((b) => b.active).length;
  dom.balls.textContent = '\u25CF '.repeat(live).trim() || '\u2014';
}

function onEvent(ev) {
  const now = performance.now();
  if (ev.kind === 'drain') {
    audio.drain();
    G.combo = 0; G.mult = 1;
    if (balls.filter((b) => b.active).length === 0) endBall();
    return;
  }

  let pts = SCORES[ev.kind] ?? 0;
  if (pts > 0) {
    if (now - G.lastEventT > 2500) G.combo = 0; // combo window
    G.combo++;
    G.lastEventT = now;
    G.mult = Math.min(5, 1 + Math.floor(G.combo / 5));
    G.score += pts * G.mult;
    if (ev.kind === 'bumper') audio.bumper();
    else if (ev.kind === 'sling') audio.sling();
    else if (ev.kind === 'loop' || ev.kind === 'orbit' || ev.kind === 'ramp') audio.clack(1.2);
    else audio.clack(0.6);
    if (pts >= 500) setMsg(`${ev.kind.toUpperCase()} +${pts * G.mult}`);
  }
}

// ---------- ball / ball-life cycle ----------
function startBall() {
  for (const b of balls) {
    b.active = false;
    b.mesh.visible = false;
  }
  const b = balls[0];
  b.active = true;
  b.mesh.visible = true;
  b.p.set(0.182, 0.055);
  b.v.set(0, 0);
  G.plungerPower = 0;
  G.charging = false;
  G.combo = 0; G.mult = 1;
  G.loopBonusUsed = false;
  updateHud();
  setMsg(`BALL ${G.ballNo}`);
}

function endBall() {
  if (G.ballNo >= 3) {
    G.mode = 'over';
    dom.stats.innerHTML = `FINALSCORE <b>${fmt(G.score)}</b>`;
    dom.overlay.style.display = 'flex';
    dom.startBtn.textContent = 'NOCHMAL';
  } else {
    G.ballNo++;
    startBall();
  }
}

function restart() {
  G.mode = 'playing';
  G.score = 0; G.combo = 0; G.mult = 1; G.ballNo = 1;
  dom.overlay.style.display = 'none';
  startBall();
}

dom.startBtn.addEventListener('click', () => { audio.ensure(); restart(); });

// ---------- input ----------
function pressFlipper(side, down) {
  for (const f of world.flippers) {
    if ((side === 'L' && f.side === 1) || (side === 'R' && f.side === -1)) f.active = down;
  }
  if (down) audio.flip();
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.code;
  if (k === 'KeyA' || k === 'ArrowLeft') pressFlipper('L', true);
  if (k === 'KeyL' || k === 'ArrowRight') pressFlipper('R', true);
  if (k === 'Space') { G.charging = true; e.preventDefault(); }
  if (k === 'Digit1') setCam('TV');
  if (k === 'Digit2') setCam('SIDE');
  if (k === 'Digit3') setCam('TOP');
  if (k === 'KeyR' && G.mode === 'playing') restart();
});
window.addEventListener('keyup', (e) => {
  const k = e.code;
  if (k === 'KeyA' || k === 'ArrowLeft') pressFlipper('L', false);
  if (k === 'KeyL' || k === 'ArrowRight') pressFlipper('R', false);
  if (k === 'Space') { firePlunger(); e.preventDefault(); }
});

function firePlunger() {
  if (!G.charging) return;
  G.charging = false;
  const power = Math.max(0.55, Math.min(1.85, 0.55 + G.plungerPower * 1.30));
  G.plungerPower = 0;
  audio.launch();
  for (const b of balls) {
    if (b.active && b.p.x > 0.165 && b.p.y < 0.1) b.v.set(0, power);
  }
}

// ---------- cameras ----------
const CAMS = {
  TV: { pos: new THREE.Vector3(0.02, 0.78, 0.62), look: new THREE.Vector3(0, 0.05, -0.42) },
  SIDE: { pos: new THREE.Vector3(-0.85, 0.42, -0.25), look: new THREE.Vector3(0, 0.05, -0.42) },
  TOP: { pos: new THREE.Vector3(0, 1.15, -0.4), look: new THREE.Vector3(0, 0.05, -0.42) },
};
let camName = 'TV';
const camPos = new THREE.Vector3().copy(CAMS.TV.pos);
const camLook = new THREE.Vector3().copy(CAMS.TV.look);
function setCam(name) {
  camName = name;
  dom.camMode.textContent = name;
}

// ---------- stuck-ball search (per-ball state lives on each Ball) ----------

// ---------- main loop ----------
const events = [];
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsT = 0;

function frame() {
  requestAnimationFrame(frame);
  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05;
  const now = performance.now();

  if (G.mode === 'playing') {
    // plunger charge
    if (G.charging) G.plungerPower = Math.min(1, G.plungerPower + dt * 0.9);
    else if (G.plungerPower > 0) G.plungerPower = Math.max(0, G.plungerPower - dt * 2);
    dom.powerFill.style.width = `${(G.plungerPower * 100).toFixed(0)}%`;
    plunger.position.z = -0.035 + G.plungerPower * 0.018;

    events.length = 0;
    world.step(dt, balls, events);
    for (const ev of events) onEvent(ev);

    // ball visuals + stuck search
    for (const b of balls) {
      if (!b.active) continue;
      const h = hAt(b.p.x, b.p.y) + BALL_R;
      b.mesh.position.set(b.p.x, h, -b.p.y);

      // Wait-at-plunger balls (resting on the lane floor) must not be
      // "un-stuck": they rest on purpose until the player fires. Anywhere else
      // a ball that stops moving (low speed OR no displacement) is nudged.
      const atPlunger = b.p.x > 0.165 && b.p.y < 0.08;
      const dp = b._lastP ? b.p.distanceTo(b._lastP) : 1;
      b._lastP = b.p.clone();
      if (!atPlunger && (b.speed() < 0.03 || dp < 0.0002)) {
        b._stuck = (b._stuck || 0) + dt;
        if (b._stuck > 1.2) {
          // nudge: random kick so the ball never freezes
          const a = Math.random() * Math.PI * 2;
          b.v.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45 - 0.25);
          setMsg('BALL SEARCH');
          b._stuck = 0;
        }
      } else b._stuck = 0;
    }
  }

  // flipper meshes follow the physics angle
  for (const { mesh, f } of flipperMeshes) {
    const tip = world.flipperTip(f);
    mesh.rotation.y = Math.atan2(tip.y - f.pivot.y, tip.x - f.pivot.x);
  }

  // flashers decay (bumper tops glow on hit)
  for (const c of world.circles) {
    if (c.flash > 0 && c.flashMesh) {
      c.flash = Math.max(0, c.flash - dt * 4);
      c.flashMesh.material.emissiveIntensity = 0.6 + c.flash * 2.5;
    }
  }

  // camera easing
  const cam = CAMS[camName];
  camPos.lerp(cam.pos, 1 - Math.exp(-4 * dt));
  camLook.lerp(cam.look, 1 - Math.exp(-4 * dt));
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // neon lights drift (subtle, stays at the cabinet sides)
  neonCyan.position.x = -0.55 + Math.sin(now * 0.0004) * 0.05;
  neonMag.position.x = 0.55 - Math.cos(now * 0.00035) * 0.05;

  composer.render();

  // fps readout
  fpsAcc += dt; fpsN++;
  if (now - fpsT > 500) {
    dom.fps.textContent = String(Math.round(fpsN / Math.max(1e-3, fpsAcc)));
    fpsAcc = 0; fpsN = 0; fpsT = now;
  }
}
frame();

// ---------- resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
