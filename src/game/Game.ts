import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CATALOG, GRID_H, GRID_W, TICK_MS } from '../config';
import { saveGame } from '../save';
import { canPlace, place, sell } from '../sim/actions';
import { tick, type SimEvent } from '../sim/sim';
import type { Customer, GameState } from '../sim/state';
import { spawn, type ModelName } from './assets';
import { Person, lookFor } from './people';
import { buildRoom } from './room';

export type Mode = { kind: 'none' } | { kind: 'place'; type: string } | { kind: 'sell' };

const AUTOSAVE_MS = 30_000;
const CENTER = new THREE.Vector3(GRID_W / 2, 0.6, GRID_H / 2);
const CAM_DIST = 30;
const CAM_ELEVATION = Math.atan(1 / Math.SQRT2) + 0.06; // a touch above true isometric

interface CustomerView {
  person: Person;
  meal: THREE.Object3D;
  bubble: THREE.Sprite;
  x: number;
  z: number;
  heading: number;
}

interface PlacedView {
  obj: THREE.Object3D;
  light?: THREE.PointLight;
}

export class Game {
  speed = 1;
  mode: Mode = { kind: 'none' };
  onEvents: (events: SimEvent[]) => void = () => {};
  onChange: () => void = () => {};
  onToast: (msg: string) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera();
  private viewSize = 12;
  private zoom = 1;
  private target = CENTER.clone();
  private yaw = Math.PI / 4;
  private yawGoal = Math.PI / 4;
  private walls: { n: THREE.Object3D; w: THREE.Object3D };
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;

  private acc = 0;
  private sinceSave = 0;
  private last = performance.now();
  private layoutDirty = true;
  private placed = new Map<number, PlacedView>();
  private people = new Map<number, CustomerView>();
  private chefs: Person[] = [];
  private hover: [number, number] | null = null;
  private ghost: { type: string; obj: THREE.Object3D } | null = null;
  private tileMarker: THREE.LineLoop;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private drag: { x: number; y: number; target: THREE.Vector3; moved: boolean } | null = null;
  private bubbleTex: THREE.Texture;

  constructor(private container: HTMLElement, public state: GameState) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x14110f);
    this.scene.fog = new THREE.Fog(0x14110f, 40, 70);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.hemi = new THREE.HemisphereLight(0xfff0dd, 0x5a4030, 2.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe8cc, 2.2);
    this.sun.position.set(GRID_W + 6, 14, GRID_H + 10);
    this.sun.target.position.copy(CENTER);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.far = 60;
    this.scene.add(this.sun, this.sun.target);

    this.walls = buildRoom(this.scene);
    this.addStatic('kitchen', 0, 0);
    this.addStatic('counter', 0, 0);
    const hoodLight = new THREE.PointLight(0xfff2dd, 1.5, 4, 1.5);
    hoodLight.position.set(1.8, 2, 0.8);
    this.scene.add(hoodLight);

    this.tileMarker = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 1), new THREE.Vector3(0, 0, 1)]),
      new THREE.LineBasicMaterial({ color: 0x7dff9a }),
    );
    this.tileMarker.visible = false;
    this.scene.add(this.tileMarker);
    this.bubbleTex = makeBubbleTexture();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupInput();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ public API used by the HUD

  setMode(mode: Mode) {
    this.mode = mode;
    if (this.ghost && (mode.kind !== 'place' || mode.type !== this.ghost.type)) {
      this.scene.remove(this.ghost.obj);
      this.ghost = null;
    }
    this.onChange();
  }

  markLayoutDirty() {
    this.layoutDirty = true;
  }

  /** World position → CSS pixels, for HTML overlays. */
  project(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  // ------------------------------------------------------------------ camera

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    // Fit the room, leaving room for the side panel on wide screens.
    const panel = w > 900 ? 340 : 0;
    const aspect = (w - panel) / h;
    this.viewSize = Math.max(11.5, 17 / aspect);
    this.updateCamera();
  }

  private updateCamera() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const panel = w > 900 ? 340 : 0;
    const halfH = this.viewSize / 2 / this.zoom;
    const halfW = halfH * (w / h);
    const shift = (panel / 2) * ((halfH * 2) / h);
    const cam = this.camera;
    cam.left = -halfW + shift;
    cam.right = halfW + shift;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = 0.1;
    cam.far = 100;
    const flat = Math.cos(CAM_ELEVATION) * CAM_DIST;
    cam.position.set(this.target.x + Math.cos(this.yaw) * flat, this.target.y + Math.sin(CAM_ELEVATION) * CAM_DIST, this.target.z + Math.sin(this.yaw) * flat);
    cam.lookAt(this.target);
    cam.updateProjectionMatrix();

    // Cutaway: hide a wall when the camera is behind it.
    const dx = Math.cos(this.yaw);
    const dz = Math.sin(this.yaw);
    this.walls.n.visible = dz > 0.05;
    this.walls.w.visible = dx > 0.05;
    for (const w of this.state.wall) {
      const v = this.placed.get(w.id);
      if (v) v.obj.visible = w.side === 'n' ? this.walls.n.visible : this.walls.w.visible;
    }
  }

  // ------------------------------------------------------------------ input

  private setupInput() {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointermove', (e) => {
      this.hover = this.pickTile(e);
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
        if (this.drag.moved) {
          const unit = (this.viewSize / this.zoom) / this.container.clientHeight;
          const right = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
          const fwd = new THREE.Vector3(-Math.cos(this.yaw), 0, -Math.sin(this.yaw));
          this.target.copy(this.drag.target)
            .addScaledVector(right, -dx * unit)
            .addScaledVector(fwd, (dy * unit) / Math.sin(CAM_ELEVATION));
          this.updateCamera();
        }
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return this.setMode({ kind: 'none' });
      this.drag = { x: e.clientX, y: e.clientY, target: this.target.clone(), moved: false };
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved && e.target === el) {
        const t = this.pickTile(e);
        if (t) this.click(t);
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 3.5);
      this.updateCamera();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') this.setMode({ kind: 'none' });
      if (e.key === 'q' || e.key === 'Q') this.yawGoal -= Math.PI / 2;
      if (e.key === 'e' || e.key === 'E') this.yawGoal += Math.PI / 2;
    });
  }

  rotate(dir: 1 | -1) {
    this.yawGoal += (dir * Math.PI) / 2;
  }

  private pickTile(e: PointerEvent): [number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return [Math.floor(hit.x), Math.floor(hit.z)];
  }

  private click([x, y]: [number, number]) {
    const s = this.state;
    if (this.mode.kind === 'place') {
      const err = place(s, this.mode.type, x, y);
      if (err) return this.onToast(err);
      this.layoutDirty = true;
      if (s.money < CATALOG[this.mode.type].cost) this.setMode({ kind: 'none' });
      this.onChange();
      void saveGame(s);
    } else if (this.mode.kind === 'sell') {
      const target = s.floor.find((p) => p.x === x && p.y === y) ?? s.ceiling.find((p) => p.x === x && p.y === y);
      if (!target) return;
      const err = sell(s, target.id);
      if (err) return this.onToast(err);
      this.layoutDirty = true;
      this.onChange();
      void saveGame(s);
    }
  }

  // ------------------------------------------------------------------ layout

  private addStatic(name: ModelName, x: number, z: number) {
    const obj = spawn(name);
    obj.position.set(x, 0, z);
    this.scene.add(obj);
    return obj;
  }

  private syncLayout() {
    const s = this.state;
    const want = new Set<number>();
    for (const p of [...s.floor, ...s.ceiling]) {
      want.add(p.id);
      if (this.placed.has(p.id)) continue;
      const view: PlacedView = { obj: this.addStatic(p.type as ModelName, p.x + 0.5, p.y + 0.5) };
      if (p.type === 'edison' || p.type === 'strings') {
        const light = new THREE.PointLight(0xffa64d, p.type === 'edison' ? 14 : 7, 6, 1.4);
        light.position.set(p.x + 0.5, 2.1, p.y + 0.5);
        this.scene.add(light);
        view.light = light;
      }
      this.placed.set(p.id, view);
    }
    for (const w of s.wall) {
      want.add(w.id);
      if (this.placed.has(w.id)) continue;
      const mid = w.slot + (CATALOG[w.type].width ?? 1) / 2;
      const obj = spawn(w.type as ModelName);
      if (w.side === 'n') obj.position.set(mid, 0, 0);
      else {
        obj.position.set(0, 0, mid);
        obj.rotation.y = Math.PI / 2;
      }
      this.scene.add(obj);
      const view: PlacedView = { obj };
      if (w.type === 'eat') {
        view.light = new THREE.PointLight(0xffb060, 8, 4.5, 1.4);
        view.light.position.set(w.side === 'n' ? mid : 0.6, 2, w.side === 'n' ? 0.6 : mid);
        this.scene.add(view.light);
      }
      this.placed.set(w.id, view);
    }
    for (const [id, v] of this.placed) {
      if (want.has(id)) continue;
      this.scene.remove(v.obj);
      if (v.light) this.scene.remove(v.light);
      this.placed.delete(id);
    }
    this.layoutDirty = false;
    this.updateCamera();
  }

  private syncChefs() {
    const s = this.state;
    while (this.chefs.length < s.chefs.length) {
      const i = this.chefs.length;
      const chef = new Person(lookFor('chef', s.chefs[i].length * 977 + i * 31));
      chef.root.position.set(1 + i * 1.5, 0, 1.45);
      this.scene.add(chef.root);
      this.chefs.push(chef);
    }
    while (this.chefs.length > s.chefs.length) this.scene.remove(this.chefs.pop()!.root);
  }

  // ------------------------------------------------------------------ frame

  private frame() {
    const now = performance.now();
    const delta = Math.min(now - this.last, 250);
    this.last = now;
    const s = this.state;

    this.acc += delta * this.speed;
    const events: SimEvent[] = [];
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      events.push(...tick(s));
    }
    if (events.length) {
      for (const e of events) if (e.type === 'cash') this.floatCash(e.amount);
      this.onEvents(events);
    }
    this.sinceSave += delta;
    if (this.sinceSave > AUTOSAVE_MS) {
      this.sinceSave = 0;
      void saveGame(s);
    }

    if (this.layoutDirty) this.syncLayout();
    this.syncChefs();
    if (Math.abs(this.yawGoal - this.yaw) > 0.001) {
      this.yaw += (this.yawGoal - this.yaw) * Math.min(1, delta / 120);
      this.updateCamera();
    }

    const dt = delta / 1000;
    const t = now / 1000;
    this.updateLighting(t);
    const busy = s.orders.length > 0;
    this.chefs.forEach((c, i) => c.animate(dt, { walking: false, seated: false, working: busy && i < s.orders.length }));
    this.updateCustomers(dt);
    this.updateGhost();
    this.composer.render();
  }

  private updateLighting(t: number) {
    // Daylight fades after 5pm; the Edison bulbs take over.
    const hour = this.state.minute / 60;
    const day = THREE.MathUtils.clamp(1 - (hour - 17) / 3.5, 0.18, 1);
    this.sun.intensity = 2.6 * day;
    this.hemi.intensity = 0.9 + 1.3 * day;
    this.bloom.strength = 0.45 + (1 - day) * 0.4;
    for (const v of this.placed.values()) {
      if (v.light) v.light.intensity = (v.light.userData.base ??= v.light.intensity) * (0.92 + 0.08 * Math.sin(t * 13 + v.obj.id) * Math.sin(t * 7.3));
    }
  }

  private updateCustomers(dt: number) {
    const alive = new Set<number>();
    const k = Math.min(1, dt * 12 * Math.max(1, this.speed));
    for (const c of this.state.customers) {
      alive.add(c.id);
      let v = this.people.get(c.id);
      if (!v) {
        const person = new Person(lookFor(c.kind, c.look));
        const meal = spawn('meal');
        meal.visible = false;
        const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, depthTest: false }));
        bubble.scale.set(0.45, 0.28, 1);
        bubble.renderOrder = 10;
        this.scene.add(person.root, meal, bubble);
        v = { person, meal, bubble, x: c.x, z: c.y, heading: 0 };
        this.people.set(c.id, v);
      }
      this.updateCustomer(v, c, dt, k);
    }
    for (const [id, v] of this.people) {
      if (alive.has(id)) continue;
      this.scene.remove(v.person.root, v.meal, v.bubble);
      this.people.delete(id);
    }
  }

  private updateCustomer(v: CustomerView, c: Customer, dt: number, k: number) {
    const px = v.x;
    const pz = v.z;
    v.x += (c.x - v.x) * k;
    v.z += (c.y - v.z) * k;
    const vx = v.x - px;
    const vz = v.z - pz;
    const walking = c.path.length > 0 && Math.hypot(vx, vz) > 0.0005;
    const seated = !!c.seat && (c.state === 'waiting' || c.state === 'eating');

    let heading = v.heading;
    if (walking) heading = Math.atan2(vx, vz);
    else if (seated) heading = this.faceTable(c.seat![0], c.seat![1]) ?? heading;
    else if (c.state === 'queue' || c.state === 'ordering' || c.state === 'waiting') heading = Math.PI; // face the counter
    let diff = heading - v.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    v.heading += diff * Math.min(1, dt * 10);

    const root = v.person.root;
    root.position.set(v.x, seated ? -0.12 : 0, v.z);
    root.rotation.y = v.heading;
    v.person.animate(dt * Math.max(1, this.speed), { walking, seated });

    v.meal.visible = c.state === 'eating';
    if (v.meal.visible) {
      const reach = seated ? 0.55 : 0.3;
      v.meal.position.set(v.x + Math.sin(v.heading) * reach, 0.78, v.z + Math.cos(v.heading) * reach);
      v.meal.rotation.y = v.heading;
    }
    v.bubble.visible = c.state === 'waiting' || c.state === 'ordering';
    v.bubble.position.set(v.x, seated ? 2.1 : 2.25, v.z);
  }

  private faceTable(x: number, y: number): number | null {
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      if (this.state.floor.some((p) => p.type === 'table' && p.x === x + dx && p.y === y + dy)) return Math.atan2(dx, dy);
    }
    return null;
  }

  private updateGhost() {
    const m = this.tileMarker;
    const mode = this.mode;
    if (!this.hover || mode.kind === 'none') {
      m.visible = false;
      if (this.ghost) this.ghost.obj.visible = false;
      return;
    }
    const [x, y] = this.hover;
    const inside = x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
    m.visible = inside;
    m.position.set(x, 0.02, y);
    const mat = m.material as THREE.LineBasicMaterial;

    if (mode.kind === 'sell') {
      const has = this.state.floor.some((p) => p.x === x && p.y === y) || this.state.ceiling.some((p) => p.x === x && p.y === y);
      mat.color.set(has ? 0xff6b4a : 0x777777);
      return;
    }
    const ok = inside && !canPlace(this.state, mode.type, x, y);
    mat.color.set(ok ? 0x7dff9a : 0xff4a4a);
    if (!this.ghost) {
      const obj = spawn(mode.type as ModelName, true);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mm = mesh.material as THREE.MeshStandardMaterial;
        mm.transparent = true;
        mm.opacity = 0.55;
        mm.depthWrite = false;
        mesh.castShadow = false;
      });
      this.scene.add(obj);
      this.ghost = { type: mode.type, obj };
    }
    this.ghost.obj.visible = inside;
    this.ghost.obj.position.set(x + 0.5, 0, y + 0.5);
    this.ghost.obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).emissive.set(ok ? 0x0a3a12 : 0x4a0a0a);
    });
  }

  private floatCash(amount: number) {
    const p = this.project(new THREE.Vector3(3.5, 1.7, 2.5));
    const el = document.createElement('div');
    el.className = 'cash-pop';
    el.textContent = `+$${amount.toFixed(2)}`;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
}

function makeBubbleTexture() {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 60;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 88, 40, 14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(40, 43);
  ctx.lineTo(48, 56);
  ctx.lineTo(56, 43);
  ctx.fill();
  ctx.fillStyle = '#333';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(30 + i * 18, 24, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
