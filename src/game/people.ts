import * as THREE from 'three';
import type { CustomerKind } from '../config';
import { spawn } from './assets';
import { plaidTexture } from './room';

export interface Look {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  hands?: number;
  flannel?: boolean;
  apron?: boolean;
  vest?: boolean;
  beard?: number; // length multiplier
  bun?: boolean;
  beanie?: number;
  cap?: number;
  longHair?: boolean;
  phone?: boolean;
  glasses?: boolean;
}

const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4226];
const HAIRS = [0x2b1b10, 0x4a2c17, 0x6b3e1f, 0xa0522d, 0x1a1a1a, 0xc9a66b];
const PLAIDS = [0xa8322a, 0x2f6b3a, 0x2d4a7a, 0x7a5a2d];

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function lookFor(kind: CustomerKind | 'chef', seed: number): Look {
  const r = rng(seed + 11);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const base = { skin: pick(SKINS), hair: pick(HAIRS) };
  switch (kind) {
    case 'chef':
      return { ...base, shirt: pick(PLAIDS), pants: 0x2a2a35, hands: 0x151515, flannel: true, apron: true, beard: 1.1 + r() * 0.5, bun: true };
    case 'hipster':
      return {
        ...base, shirt: pick(PLAIDS), pants: 0x2a2a35, flannel: true,
        beard: r() < 0.55 ? 0.6 + r() * 0.8 : undefined,
        beanie: r() < 0.5 ? pick([0x8a6d3b, 0x3b5a3b, 0x7a2e2e, 0xd9cbb0]) : undefined,
        glasses: r() < 0.4,
      };
    case 'influencer':
      return { ...base, shirt: pick([0xe8d5c4, 0xd9b8a7, 0xf2e6d8, 0xb7c4b0]), pants: 0x1c1c1c, longHair: true, phone: true };
    case 'techbro':
      return { ...base, shirt: 0x8fb3d9, pants: 0x3d4a5c, vest: true, glasses: r() < 0.3 };
    case 'dad':
      return { ...base, shirt: pick([0x23395d, 0x7d8c5e, 0x9e2a2b]), pants: 0xc8b48a, cap: pick([0x1d3557, 0x9e2a2b]) };
  }
}

const ACCESSORIES = ['beard', 'bun', 'longhair', 'beanie', 'cap', 'glasses', 'apron', 'vest', 'phone'];

export class Person {
  readonly root: THREE.Object3D;
  private legs: THREE.Object3D[];
  private arms: THREE.Object3D[];
  private phase = Math.random() * 10;

  constructor(look: Look) {
    this.root = spawn('person', true);
    const get = (n: string) => this.root.getObjectByName(n)!;
    this.legs = [get('legL'), get('legR')];
    this.arms = [get('armL'), get('armR')];

    const show: Record<string, boolean> = {
      beard: !!look.beard, bun: !!look.bun && !look.beanie && !look.cap, longhair: !!look.longHair,
      beanie: look.beanie !== undefined, cap: look.cap !== undefined, glasses: !!look.glasses,
      apron: !!look.apron, vest: !!look.vest, phone: !!look.phone,
    };
    for (const name of ACCESSORIES) get(name).visible = show[name];
    if (look.beard) get('beard').scale.y = look.beard;
    if (look.beanie !== undefined || look.cap !== undefined) get('hair_top').visible = false;

    const colors: Record<string, number | undefined> = {
      shirt: look.shirt, pants: look.pants, skin: look.skin, hands: look.hands ?? look.skin, hair: look.hair,
      beanie: look.beanie, cap: look.cap,
    };
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      const c = colors[m.name];
      if (c === undefined) return;
      if (m.name === 'shirt' && look.flannel) {
        m.map = plaidTexture(c);
        m.color.set(0xffffff);
      } else m.color.set(c);
    });
  }

  /** dt in seconds; `speed` 0 means standing still. */
  animate(dt: number, opts: { walking: boolean; seated: boolean; working?: boolean }) {
    this.phase += dt * (opts.walking ? 9 : opts.working ? 7 : 2);
    const p = this.phase;
    if (opts.seated) {
      for (const l of this.legs) l.rotation.x = -1.25;
      this.arms[0].rotation.x = -0.5 + Math.sin(p) * 0.05;
      this.arms[1].rotation.x = -0.6 + Math.sin(p * 0.7) * 0.15;
      return;
    }
    if (opts.walking) {
      this.legs[0].rotation.x = Math.sin(p) * 0.55;
      this.legs[1].rotation.x = -Math.sin(p) * 0.55;
      this.arms[0].rotation.x = -Math.sin(p) * 0.45;
      this.arms[1].rotation.x = Math.sin(p) * 0.45;
    } else {
      for (const l of this.legs) l.rotation.x *= 0.8;
      this.arms[0].rotation.x = opts.working ? -0.9 + Math.sin(p) * 0.3 : Math.sin(p) * 0.03;
      this.arms[1].rotation.x = opts.working ? -0.9 - Math.sin(p) * 0.3 : -Math.sin(p) * 0.03;
    }
  }
}
