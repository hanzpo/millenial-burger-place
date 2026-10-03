import { CHEF_NAMES, MENU, OPEN_MIN, STARTING_MONEY, type CustomerKind, type Tile } from '../config';

export const SAVE_VERSION = 1;

export interface Placed {
  id: number;
  type: string;
  x: number;
  y: number;
}

export interface WallPlaced {
  id: number;
  type: string;
  side: 'n' | 'w';
  slot: number;
}

export type CustomerState = 'queue' | 'ordering' | 'toSeat' | 'toGo' | 'waiting' | 'eating' | 'leaving';

export interface Customer {
  id: number;
  kind: CustomerKind;
  look: number; // seed for appearance
  x: number;
  y: number;
  path: Tile[];
  target: Tile | null;
  state: CustomerState;
  timer: number;
  seat: Tile | null;
  foodReady: boolean;
  waited: number;
  priceRatio: number;
  paid: number;
}

export interface Order {
  customerId: number;
  items: string[];
  remaining: number;
}

export interface Review {
  day: number;
  stars: number;
  kind: CustomerKind;
  text: string;
}

export interface DayStats {
  revenue: number;
  ingredients: number;
  served: number;
  walkouts: number;
}

/** Everything here is plain data so it can be saved as-is. */
export interface GameState {
  version: number;
  name: string;
  money: number;
  day: number;
  minute: number;
  reputation: number; // 0-100
  floor: Placed[];
  ceiling: Placed[];
  wall: WallPlaced[];
  prices: Record<string, number>;
  chefs: string[];
  reviews: Review[];
  today: DayStats;
  lastDayProfit: number;
  totalServed: number;
  nextId: number;
  lastSavedAt: number;
  // Transient: not persisted (customers are cleared on load).
  customers: Customer[];
  queue: number[];
  orders: Order[];
}

export const emptyDay = (): DayStats => ({ revenue: 0, ingredients: 0, served: 0, walkouts: 0 });

export function createInitialState(): GameState {
  let id = 1;
  const f = (type: string, x: number, y: number): Placed => ({ id: id++, type, x, y });
  const floor = [
    f('table', 9, 4), f('stool', 8, 4), f('stool', 10, 4),
    f('table', 9, 7), f('stool', 8, 7), f('stool', 10, 7),
  ];
  const ceiling = [f('edison', 9, 4), f('strings', 9, 7)];
  const wall: WallPlaced[] = [
    { id: id++, type: 'eat', side: 'n', slot: 8 },
    { id: id++, type: 'chalk', side: 'w', slot: 4 },
  ];
  return {
    version: SAVE_VERSION,
    name: 'Two Guys With A Crazy Idea',
    money: STARTING_MONEY,
    day: 1,
    minute: OPEN_MIN,
    reputation: 50,
    floor,
    ceiling,
    wall,
    prices: Object.fromEntries(Object.entries(MENU).map(([k, m]) => [k, m.basePrice])),
    chefs: [CHEF_NAMES[0]],
    reviews: [],
    today: emptyDay(),
    lastDayProfit: 0,
    totalServed: 0,
    nextId: id,
    lastSavedAt: Date.now(),
    customers: [],
    queue: [],
    orders: [],
  };
}
