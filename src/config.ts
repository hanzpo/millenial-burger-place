// Static game data: room layout, the shop catalog, the menu, and customer types.

export const GRID_W = 12;
export const GRID_H = 10;

export const TICK_MS = 100;
export const MINUTES_PER_TICK = 0.25;
export const OPEN_MIN = 11 * 60;
export const CLOSE_MIN = 23 * 60;

export const DAILY_RENT = 450;
export const CHEF_WAGE = 120;
export const CHEF_SIGNING = 200;
export const MAX_CHEFS = 4;
export const STARTING_MONEY = 2000;
export const WALK_SPEED = 0.4; // tiles per game minute

export type Tile = [number, number];

// Kitchen + counter occupy the back-left of the room.
export const KITCHEN_MAX_X = 6;
export const COUNTER_Y = 2;
export const QUEUE: Tile[] = [
  [3, 3],
  [3, 4],
  [3, 5],
  [3, 6],
  [3, 7],
];
export const TOGO: Tile = [5, 3];
export const ENTRANCE: Tile = [GRID_W - 2, GRID_H - 1];

export const isKitchen = (x: number, y: number) => x <= KITCHEN_MAX_X && y < COUNTER_Y;
export const isCounter = (x: number, y: number) => x <= KITCHEN_MAX_X && y === COUNTER_Y;
export const isReserved = (x: number, y: number) =>
  isKitchen(x, y) ||
  isCounter(x, y) ||
  QUEUE.some(([qx, qy]) => qx === x && qy === y) ||
  (TOGO[0] === x && TOGO[1] === y) ||
  (ENTRANCE[0] === x && ENTRANCE[1] === y);

export type Layer = 'floor' | 'ceiling' | 'wall';

export interface CatalogItem {
  name: string;
  blurb: string;
  cost: number;
  vibe: number;
  layer: Layer;
  blocks?: boolean;
  seat?: boolean;
  /** Wall items span this many wall slots. */
  width?: number;
  unlocks?: string;
}

export const CATALOG: Record<string, CatalogItem> = {
  table: { name: 'Reclaimed Wood Table', blurb: 'Salvaged from a barn. Allegedly.', cost: 120, vibe: 2, layer: 'floor', blocks: true },
  stool: { name: 'Tolix Stool', blurb: 'Industrial. Uncomfortable. Iconic.', cost: 60, vibe: 1, layer: 'floor', blocks: true, seat: true },
  edison: { name: 'Edison Bulb Beam', blurb: 'Eight bulbs, forty lumens total.', cost: 180, vibe: 5, layer: 'ceiling' },
  strings: { name: 'String Lights', blurb: 'Patio energy, indoors.', cost: 90, vibe: 3, layer: 'ceiling' },
  chalk: { name: 'Confusing Chalkboard', blurb: 'Nobody can read it. Prices feel justified.', cost: 150, vibe: 4, layer: 'wall', width: 1 },
  eat: { name: 'Marquee EAT Sign', blurb: 'In case they forgot why they came.', cost: 400, vibe: 12, layer: 'wall', width: 2 },
  taps: { name: 'Craft Beer Taps', blurb: 'Unlocks the Hazy Double IPA.', cost: 900, vibe: 8, layer: 'wall', width: 2, unlocks: 'ipa' },
  garage: { name: 'Roll-up Garage Door', blurb: 'Patio vibes, even in November.', cost: 1500, vibe: 15, layer: 'wall', width: 2 },
};

export interface MenuItem {
  name: string;
  blurb: string;
  basePrice: number;
  cost: number;
  cookMin: number;
  kind: 'burger' | 'side' | 'drink';
  requires?: string;
}

export const MENU: Record<string, MenuItem> = {
  smash: { name: 'Smash Me Daddy', blurb: 'Two smashed patties, pickles, "lotchup".', basePrice: 14, cost: 3.5, cookMin: 6, kind: 'burger' },
  egg: { name: 'The Eggxistential', blurb: 'There is always one with a fried egg on top.', basePrice: 18, cost: 4.5, cookMin: 9, kind: 'burger' },
  fries: { name: 'Fries in a Little Basket', blurb: 'Wire basket. Ramekin. You know.', basePrice: 9, cost: 1.2, cookMin: 4, kind: 'side' },
  ipa: { name: 'Hazy Double IPA', blurb: 'Notes of grapefruit and debt.', basePrice: 11, cost: 2, cookMin: 1, kind: 'drink', requires: 'taps' },
};

export type CustomerKind = 'hipster' | 'influencer' | 'techbro' | 'dad';

export const CUSTOMER_KINDS: Record<CustomerKind, { weight: number; budget: number; vibeCare: number; repWeight: number }> = {
  hipster: { weight: 4, budget: 1.0, vibeCare: 1, repWeight: 1 },
  influencer: { weight: 2, budget: 1.15, vibeCare: 2, repWeight: 3 },
  techbro: { weight: 2, budget: 1.35, vibeCare: 0.5, repWeight: 1 },
  dad: { weight: 1, budget: 0.85, vibeCare: 0.3, repWeight: 1 },
};

export const CHEF_NAMES = ['Jaxon', 'Bodhi', 'Ezra', 'Rhett', 'Silas', 'Atlas', 'Fitz', 'Zeke'];
