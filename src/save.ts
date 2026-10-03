import { del, get, set } from 'idb-keyval';
import { SAVE_VERSION, createInitialState, type GameState } from './sim/state';

const KEY = 'mbp-save';
const MAX_OFFLINE_HOURS = 8;
const OFFLINE_RATE = 0.1; // fraction of last day's profit earned per real hour away

type Persisted = Omit<GameState, 'customers' | 'queue' | 'orders'>;

// Migrations run in order: MIGRATIONS[n] upgrades a save from version n to n + 1.
const MIGRATIONS: Record<number, (raw: any) => any> = {};

function migrate(raw: any): GameState {
  let data = raw;
  for (let v = data.version ?? 0; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from save version ${v}`);
    data = { ...step(data), version: v + 1 };
  }
  // Merge over defaults so new fields get sane values.
  return { ...createInitialState(), ...data, customers: [], queue: [], orders: [] };
}

export async function saveGame(s: GameState): Promise<void> {
  s.lastSavedAt = Date.now();
  const { customers: _c, queue: _q, orders: _o, ...persisted } = s;
  await set(KEY, structuredClone(persisted satisfies Persisted));
}

export interface Loaded {
  state: GameState;
  offlineEarnings: number;
  hoursAway: number;
}

export async function loadGame(): Promise<Loaded | null> {
  const raw = await get(KEY);
  if (!raw) return null;
  const state = migrate(raw);
  const hoursAway = Math.min(MAX_OFFLINE_HOURS, (Date.now() - state.lastSavedAt) / 3_600_000);
  const offlineEarnings = hoursAway > 0.05 ? Math.max(0, Math.round(state.lastDayProfit * OFFLINE_RATE * hoursAway)) : 0;
  state.money += offlineEarnings;
  return { state, offlineEarnings, hoursAway };
}

export async function wipeSave(): Promise<void> {
  await del(KEY);
}
