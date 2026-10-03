import {
  CATALOG, CHEF_WAGE, CLOSE_MIN, CUSTOMER_KINDS, DAILY_RENT, ENTRANCE, MENU, MINUTES_PER_TICK,
  OPEN_MIN, QUEUE, TOGO, WALK_SPEED, type CustomerKind, type Tile,
} from '../config';
import { blockedSet, findPath } from './path';
import { emptyDay, type Customer, type GameState, type Review } from './state';
import { reviewText, walkoutText } from './reviews';

export interface DaySummary {
  day: number;
  revenue: number;
  ingredients: number;
  rent: number;
  wages: number;
  profit: number;
  served: number;
  walkouts: number;
}

export type SimEvent =
  | { type: 'cash'; amount: number }
  | { type: 'review'; review: Review }
  | { type: 'dayEnd'; summary: DaySummary };

export function vibeScore(s: GameState): number {
  let v = 5;
  for (const p of [...s.floor, ...s.ceiling, ...s.wall]) v += CATALOG[p.type]?.vibe ?? 0;
  return v;
}

/** How much more than base price customers tolerate, with diminishing returns on decor. */
export function vibeFactor(s: GameState): number {
  return 0.8 + 0.9 * (1 - Math.exp(-vibeScore(s) / 60));
}

export function hasUnlock(s: GameState, catalogType: string): boolean {
  return s.wall.some((w) => w.type === catalogType);
}

export function menuAvailable(s: GameState, item: string): boolean {
  const req = MENU[item].requires;
  return !req || hasUnlock(s, req);
}

function hourlyDemand(minute: number): number {
  const h = minute / 60;
  if (h >= 12 && h < 14) return 1.6; // lunch rush
  if (h >= 18 && h < 20.5) return 1.8; // dinner rush
  return 0.6;
}

function pickKind(): CustomerKind {
  const entries = Object.entries(CUSTOMER_KINDS) as [CustomerKind, { weight: number }][];
  let r = Math.random() * entries.reduce((a, [, k]) => a + k.weight, 0);
  for (const [kind, k] of entries) if ((r -= k.weight) < 0) return kind;
  return 'hipster';
}

const tileOf = (c: Customer): Tile => [Math.floor(c.x), Math.floor(c.y)];
const sameTile = (a: Tile | null, b: Tile) => !!a && a[0] === b[0] && a[1] === b[1];

function setTarget(s: GameState, c: Customer, t: Tile) {
  if (sameTile(c.target, t)) return;
  c.target = t;
  c.path = findPath(blockedSet(s), tileOf(c), t) ?? [t];
}

/** Moves along the path; returns true once standing on the target tile. */
function walk(c: Customer, dt: number): boolean {
  let step = WALK_SPEED * dt;
  while (step > 0 && c.path.length) {
    const [tx, ty] = c.path[0];
    const dx = tx + 0.5 - c.x;
    const dy = ty + 0.5 - c.y;
    const d = Math.hypot(dx, dy);
    if (d <= step) {
      c.x = tx + 0.5;
      c.y = ty + 0.5;
      c.path.shift();
      step -= d;
    } else {
      c.x += (dx / d) * step;
      c.y += (dy / d) * step;
      step = 0;
    }
  }
  return c.path.length === 0;
}

function freeSeat(s: GameState): Tile | null {
  const taken = new Set(s.customers.filter((c) => c.seat).map((c) => `${c.seat![0]},${c.seat![1]}`));
  const blocked = blockedSet(s);
  const seats = s.floor.filter((p) => CATALOG[p.type].seat && !taken.has(`${p.x},${p.y}`));
  seats.sort(() => Math.random() - 0.5);
  for (const seat of seats) if (findPath(blocked, QUEUE[0], [seat.x, seat.y])) return [seat.x, seat.y];
  return null;
}

function spawn(s: GameState, events: SimEvent[]) {
  const kind = pickKind();
  if (s.queue.length >= QUEUE.length) {
    s.today.walkouts++;
    s.reputation = Math.max(0, s.reputation - 0.3);
    if (Math.random() < 0.3) addReview(s, events, { day: s.day, stars: 1, kind, text: walkoutText('line') });
    return;
  }
  const c: Customer = {
    id: s.nextId++, kind, look: Math.floor(Math.random() * 1e6),
    x: ENTRANCE[0] + 0.5, y: ENTRANCE[1] + 0.5, path: [], target: null,
    state: 'queue', timer: 0, seat: null, foodReady: false, waited: 0, priceRatio: 1, paid: 0,
  };
  s.customers.push(c);
  s.queue.push(c.id);
}

function addReview(s: GameState, events: SimEvent[], review: Review) {
  s.reviews.unshift(review);
  s.reviews.length = Math.min(s.reviews.length, 50);
  events.push({ type: 'review', review });
}

function placeOrder(s: GameState, c: Customer, events: SimEvent[]) {
  const k = CUSTOMER_KINDS[c.kind];
  const factor = 1 + (vibeFactor(s) - 1) * k.vibeCare;
  const budget = k.budget * (0.85 + Math.random() * 0.35) * factor;
  const willing = (item: string) => MENU[item].basePrice * budget;
  const affordable = (item: string) => menuAvailable(s, item) && s.prices[item] <= willing(item);

  const burgers = Math.random() < 0.55 ? ['smash', 'egg'] : ['egg', 'smash'];
  const burger = burgers.find(affordable);
  s.queue.shift();
  if (!burger) {
    s.today.walkouts++;
    s.reputation = Math.max(0, s.reputation - 0.5);
    const cheapest = Math.min(s.prices.smash, s.prices.egg);
    if (Math.random() < 0.5) addReview(s, events, { day: s.day, stars: 1, kind: c.kind, text: walkoutText('price', cheapest) });
    c.state = 'leaving';
    return;
  }
  const items = [burger];
  if (Math.random() < 0.7 && affordable('fries')) items.push('fries');
  if (Math.random() < 0.5 && affordable('ipa')) items.push('ipa');

  const total = items.reduce((a, i) => a + s.prices[i], 0);
  const ingredients = items.reduce((a, i) => a + MENU[i].cost, 0);
  c.paid = total;
  c.priceRatio = total / items.reduce((a, i) => a + willing(i), 0);
  s.money += total - ingredients;
  s.today.revenue += total;
  s.today.ingredients += ingredients;
  events.push({ type: 'cash', amount: total });
  s.orders.push({ customerId: c.id, items, remaining: items.reduce((a, i) => a + MENU[i].cookMin, 0) });

  c.seat = freeSeat(s);
  c.state = c.seat ? 'toSeat' : 'toGo';
}

function finishVisit(s: GameState, c: Customer, events: SimEvent[]) {
  const k = CUSTOMER_KINDS[c.kind];
  let h = 0.5;
  h += (vibeFactor(s) - 1) * k.vibeCare * 0.6;
  h += (1 - c.priceRatio) * 1.2;
  h -= Math.max(0, c.waited - 15) / 40;
  h += c.seat ? 0.1 : -0.1;
  if (c.kind === 'dad' && c.paid > 20) h -= 0.15;
  h = Math.min(1, Math.max(0, h));
  const stars = Math.min(5, Math.max(1, Math.round(1 + h * 4)));

  s.reputation += (stars * 20 - s.reputation) * 0.02 * k.repWeight;
  s.reputation = Math.min(100, Math.max(0, s.reputation));
  s.today.served++;
  s.totalServed++;
  if (c.kind === 'influencer' || Math.random() < 0.35) {
    addReview(s, events, { day: s.day, stars, kind: c.kind, text: reviewText(stars, c) });
  }
  c.seat = null;
  c.state = 'leaving';
}

function updateCustomer(s: GameState, c: Customer, dt: number, events: SimEvent[]): boolean {
  if (c.state !== 'queue' && c.state !== 'ordering' && c.state !== 'leaving' && !c.foodReady) c.waited += dt;

  switch (c.state) {
    case 'queue': {
      const idx = s.queue.indexOf(c.id);
      setTarget(s, c, QUEUE[idx]);
      if (walk(c, dt) && idx === 0) {
        c.state = 'ordering';
        c.timer = hasUnlock(s, 'chalk') ? 3 : 1.5; // squinting at the chalkboard
      }
      break;
    }
    case 'ordering':
      if ((c.timer -= dt) <= 0) placeOrder(s, c, events);
      break;
    case 'toSeat':
    case 'toGo':
      setTarget(s, c, c.seat ?? TOGO);
      if (walk(c, dt)) c.state = 'waiting';
      break;
    case 'waiting':
      if (c.foodReady) {
        if (c.seat) {
          c.state = 'eating';
          c.timer = 15 + Math.random() * 10;
        } else finishVisit(s, c, events);
      }
      break;
    case 'eating':
      if ((c.timer -= dt) <= 0) finishVisit(s, c, events);
      break;
    case 'leaving':
      setTarget(s, c, ENTRANCE);
      if (walk(c, dt)) return false;
      break;
  }
  return true;
}

function endDay(s: GameState, events: SimEvent[]) {
  const wages = s.chefs.length * CHEF_WAGE;
  const summary: DaySummary = {
    day: s.day,
    revenue: s.today.revenue,
    ingredients: s.today.ingredients,
    rent: DAILY_RENT,
    wages,
    profit: s.today.revenue - s.today.ingredients - DAILY_RENT - wages,
    served: s.today.served,
    walkouts: s.today.walkouts,
  };
  s.money -= DAILY_RENT + wages;
  s.lastDayProfit = summary.profit;
  s.today = emptyDay();
  s.day++;
  s.minute = OPEN_MIN;
  events.push({ type: 'dayEnd', summary });
}

/** Advances the simulation by one fixed tick. */
export function tick(s: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  const dt = MINUTES_PER_TICK;
  const open = s.minute < CLOSE_MIN;

  if (open) {
    const rate = 0.06 * hourlyDemand(s.minute) * (0.5 + s.reputation / 100) * (0.6 + vibeFactor(s) * 0.4);
    if (Math.random() < rate * dt) spawn(s, events);
  }

  // Each chef works on one order at a time, first come first served.
  const working = s.orders.slice(0, s.chefs.length);
  for (const o of working) o.remaining -= dt;
  for (const o of working.filter((o) => o.remaining <= 0)) {
    const c = s.customers.find((c) => c.id === o.customerId);
    if (c) c.foodReady = true;
  }
  s.orders = s.orders.filter((o) => o.remaining > 0);

  s.customers = s.customers.filter((c) => updateCustomer(s, c, dt, events));

  if (open) s.minute = Math.min(CLOSE_MIN, s.minute + dt);
  else if (s.customers.length === 0) endDay(s, events);
  return events;
}
