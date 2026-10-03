import { GRID_H, GRID_W, isCounter, isKitchen, type Tile } from '../config';
import type { GameState } from './state';

export function blockedSet(s: GameState): Set<string> {
  const set = new Set<string>();
  for (const p of s.floor) set.add(`${p.x},${p.y}`);
  return set;
}

export function isWalkable(blocked: Set<string>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  if (isKitchen(x, y) || isCounter(x, y)) return false;
  return !blocked.has(`${x},${y}`);
}

/** BFS over the tile grid. The goal tile may itself be blocked (e.g. a stool you sit on). */
export function findPath(blocked: Set<string>, from: Tile, to: Tile): Tile[] | null {
  const key = (x: number, y: number) => y * GRID_W + x;
  const goal = key(to[0], to[1]);
  const start = key(from[0], from[1]);
  if (start === goal) return [];
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === goal) break;
    const cx = cur % GRID_W;
    const cy = Math.floor(cur / GRID_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      if (k !== goal && !isWalkable(blocked, nx, ny)) continue;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      prev.set(k, cur);
      queue.push(k);
    }
  }
  if (!prev.has(goal)) return null;
  const path: Tile[] = [];
  for (let k = goal; k !== start; k = prev.get(k)!) path.push([k % GRID_W, Math.floor(k / GRID_W)]);
  return path.reverse();
}
