// Player actions. Each returns an error message, or null on success.
import {
  CATALOG, CHEF_NAMES, CHEF_SIGNING, ENTRANCE, GRID_H, GRID_W, MAX_CHEFS, QUEUE, TOGO, isKitchen, isCounter, isReserved,
} from '../config';
import { blockedSet, findPath } from './path';
import type { GameState, WallPlaced } from './state';

const SELL_REFUND = 0.5;

export function canPlace(s: GameState, type: string, x: number, y: number): string | null {
  const item = CATALOG[type];
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 'Out of bounds';
  if (item.layer === 'ceiling') {
    if (isKitchen(x, y) || isCounter(x, y)) return 'Not over the kitchen';
    if (s.ceiling.some((p) => p.x === x && p.y === y)) return 'Already a light there';
    return null;
  }
  if (isReserved(x, y)) return 'Keep the line and door clear';
  if (s.floor.some((p) => p.x === x && p.y === y)) return 'Something is already there';
  if (s.customers.some((c) => Math.floor(c.x) === x && Math.floor(c.y) === y)) return 'Someone is standing there';
  if (item.blocks) {
    const blocked = blockedSet(s);
    blocked.add(`${x},${y}`);
    const reach = [QUEUE[0], QUEUE[QUEUE.length - 1], TOGO];
    if (reach.some((t) => !findPath(blocked, ENTRANCE, t))) return 'That would block the path to the counter';
  }
  return null;
}

export function place(s: GameState, type: string, x: number, y: number): string | null {
  const item = CATALOG[type];
  if (s.money < item.cost) return 'Not enough money';
  const err = canPlace(s, type, x, y);
  if (err) return err;
  s.money -= item.cost;
  (item.layer === 'ceiling' ? s.ceiling : s.floor).push({ id: s.nextId++, type, x, y });
  return null;
}

function wallCapacity(side: 'n' | 'w') {
  return side === 'n' ? GRID_W : GRID_H;
}

function wallTaken(s: GameState): Set<string> {
  const taken = new Set<string>();
  for (const w of s.wall) for (let i = 0; i < (CATALOG[w.type].width ?? 1); i++) taken.add(`${w.side}:${w.slot + i}`);
  return taken;
}

export function buyWall(s: GameState, type: string): string | null {
  const item = CATALOG[type];
  if (s.money < item.cost) return 'Not enough money';
  if (item.unlocks && s.wall.some((w) => w.type === type)) return 'You already have one';
  const width = item.width ?? 1;
  const taken = wallTaken(s);
  for (const side of ['n', 'w'] as const) {
    // Leave a one-slot gap between pieces so the wall breathes.
    for (let slot = 1; slot + width <= wallCapacity(side); slot++) {
      let free = true;
      for (let i = -1; i <= width; i++) if (taken.has(`${side}:${slot + i}`)) free = false;
      if (!free) continue;
      const w: WallPlaced = { id: s.nextId++, type, side, slot };
      s.wall.push(w);
      s.money -= item.cost;
      return null;
    }
  }
  return 'No wall space left';
}

export function sell(s: GameState, id: number): string | null {
  for (const list of [s.floor, s.ceiling, s.wall] as { id: number; type: string; x?: number; y?: number }[][]) {
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) continue;
    const p = list[idx];
    if (p.x !== undefined && s.customers.some((c) => c.seat && c.seat[0] === p.x && c.seat[1] === p.y)) {
      return 'Someone is sitting there';
    }
    list.splice(idx, 1);
    s.money += Math.round(CATALOG[p.type].cost * SELL_REFUND);
    return null;
  }
  return 'Nothing to sell';
}

export function hireChef(s: GameState): string | null {
  if (s.chefs.length >= MAX_CHEFS) return 'The kitchen only fits so many beards';
  if (s.money < CHEF_SIGNING) return 'Not enough money';
  s.money -= CHEF_SIGNING;
  s.chefs.push(CHEF_NAMES.find((n) => !s.chefs.includes(n)) ?? `Chef ${s.chefs.length + 1}`);
  return null;
}

export function fireChef(s: GameState): string | null {
  if (s.chefs.length <= 1) return 'Someone has to make the burgers';
  s.chefs.pop();
  return null;
}

export function setPrice(s: GameState, item: string, price: number) {
  s.prices[item] = Math.max(1, Math.round(price * 100) / 100);
}
