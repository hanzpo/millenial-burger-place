// The room shell: floors and walls with canvas-generated textures (brick, black shiplap, planks).
import * as THREE from 'three';
import { COUNTER_Y, ENTRANCE, GRID_H, GRID_W, KITCHEN_MAX_X, QUEUE } from '../config';

export const WALL_HEIGHT = 3;
const WALL_T = 0.15;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function jitter(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  const f = 1 + (rand() - 0.5) * amount;
  return `#${c.multiplyScalar(f).getHexString()}`;
}

/** 2m × 2m of brick. */
function brickTexture() {
  seed = 42;
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#4a2a1f';
    ctx.fillRect(0, 0, 512, 512);
    const rows = 32;
    const rh = 512 / rows;
    const bw = 512 / 8;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let x = -off; x < 512; x += bw) {
        ctx.fillStyle = jitter(rand() < 0.08 ? '#6e3020' : '#8e3f28', 0.5);
        ctx.fillRect(x + 2, r * rh + 2, bw - 4, rh - 3);
        // A few scuffs of old paint and soot.
        if (rand() < 0.1) {
          ctx.fillStyle = 'rgba(230,220,200,0.12)';
          ctx.fillRect(x + 2 + rand() * 20, r * rh + 3, 10 + rand() * 20, rh - 5);
        }
      }
    }
  }, [GRID_W / 2, WALL_HEIGHT / 2]);
}

function shiplapTexture() {
  seed = 7;
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = jitter('#202023', 0.2);
      ctx.fillRect(0, y + 2, 256, 29);
      ctx.fillStyle = '#0c0c0d';
      ctx.fillRect(0, y, 256, 2);
    }
  }, [GRID_H / 2, WALL_HEIGHT / 2]);
}

/** One tile = 128px; four planks per tile with staggered joints. */
function plankTexture() {
  seed = 3;
  const px = 128;
  return canvasTexture(GRID_W * px, GRID_H * px, (ctx) => {
    const pw = px / 4;
    for (let row = 0; row < GRID_H * 4; row++) {
      let x = -rand() * px * 2;
      while (x < GRID_W * px) {
        const len = px * (1.5 + rand() * 2.5);
        ctx.fillStyle = jitter('#7a5232', 0.35);
        ctx.fillRect(x, row * pw, len, pw);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, row * pw, 2, pw);
        // Grain.
        ctx.strokeStyle = 'rgba(40,20,10,0.15)';
        for (let g = 0; g < 3; g++) {
          ctx.beginPath();
          const gy = row * pw + 4 + rand() * (pw - 8);
          ctx.moveTo(x, gy);
          ctx.lineTo(x + len, gy + (rand() - 0.5) * 4);
          ctx.stroke();
        }
        x += len;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, row * pw, GRID_W * px, 1.5);
    }
    // Footprint decals marking the queue.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const [qx, qy] of QUEUE) {
      for (const off of [-0.12, 0.12]) {
        ctx.beginPath();
        ctx.ellipse((qx + 0.5 + off) * px, (qy + 0.5) * px, 9, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [1, 1]);
}

function kitchenTileTexture() {
  return canvasTexture(256, 256, (ctx) => {
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#2c2c2c' : '#d8d4c8';
        ctx.fillRect(x * 64, y * 64, 64, 64);
      }
    }
  }, [KITCHEN_MAX_X + 1, COUNTER_Y]);
}

export function buildRoom(scene: THREE.Scene) {
  const walls: { n: THREE.Object3D; w: THREE.Object3D } = { n: new THREE.Group(), w: new THREE.Group() };

  // Street outside.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(GRID_W / 2, -0.02, GRID_H / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W, GRID_H), new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(GRID_W / 2, 0, GRID_H / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const kw = KITCHEN_MAX_X + 1;
  const kitchenFloor = new THREE.Mesh(new THREE.PlaneGeometry(kw, COUNTER_Y), new THREE.MeshStandardMaterial({ map: kitchenTileTexture(), roughness: 0.5 }));
  kitchenFloor.rotation.x = -Math.PI / 2;
  kitchenFloor.position.set(kw / 2, 0.003, COUNTER_Y / 2);
  kitchenFloor.receiveShadow = true;
  scene.add(kitchenFloor);

  const mat = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...opts });
  const edge = mat({ color: 0x2b211c });

  // North wall: exposed brick. Box face order: +x, -x, +y, -y, +z, -z.
  const north = new THREE.Mesh(new THREE.BoxGeometry(GRID_W + WALL_T, WALL_HEIGHT, WALL_T), [edge, edge, edge, edge, mat({ map: brickTexture() }), edge]);
  north.position.set((GRID_W - WALL_T) / 2, WALL_HEIGHT / 2, -WALL_T / 2);
  walls.n.add(north);

  const west = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, WALL_HEIGHT, GRID_H), [mat({ map: shiplapTexture(), roughness: 0.95 }), edge, edge, edge, edge, edge]);
  west.position.set(-WALL_T / 2, WALL_HEIGHT / 2, GRID_H / 2);
  walls.w.add(west);

  const base = mat({ color: 0x111111 });
  const nb = new THREE.Mesh(new THREE.BoxGeometry(GRID_W, 0.12, 0.03), base);
  nb.position.set(GRID_W / 2, 0.06, 0.015);
  walls.n.add(nb);
  const wb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, GRID_H), base);
  wb.position.set(0.015, 0.06, GRID_H / 2);
  walls.w.add(wb);

  for (const g of [walls.n, walls.w]) {
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(g);
  }

  // Doormat.
  const mat2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.6), mat({ color: 0x2a2420 }));
  mat2.position.set(ENTRANCE[0] + 0.5, 0.01, ENTRANCE[1] + 0.6);
  mat2.receiveShadow = true;
  scene.add(mat2);

  return walls;
}

const plaidCache = new Map<number, THREE.Texture>();

/** Flannel pattern tinted from a base colour, for shirts. */
export function plaidTexture(base: number) {
  let t = plaidCache.get(base);
  if (t) return t;
  const c = new THREE.Color(base);
  const dark = `#${c.clone().multiplyScalar(0.45).getHexString()}`;
  t = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = dark;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 10, 64, 12);
    ctx.fillRect(10, 0, 12, 64);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(0, 42, 64, 5);
    ctx.fillRect(42, 0, 5, 64);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#e9e2cf';
    ctx.fillRect(0, 31, 64, 2);
    ctx.fillRect(31, 0, 2, 64);
  }, [2, 2]);
  plaidCache.set(base, t);
  return t;
}
