import { CATALOG, CHEF_SIGNING, CHEF_WAGE, CLOSE_MIN, DAILY_RENT, MAX_CHEFS, MENU, type CustomerKind } from '../config';
import { saveGame, wipeSave } from '../save';
import { buyWall, fireChef, hireChef, sell, setPrice } from '../sim/actions';
import { menuAvailable, vibeFactor, vibeScore, type DaySummary, type SimEvent } from '../sim/sim';
import type { Game } from '../game/Game';

type Tab = 'build' | 'menu' | 'staff' | 'reviews';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function clock(minute: number) {
  const h = Math.floor(minute / 60);
  const m = Math.floor(minute % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const KIND_LABEL: Record<CustomerKind, string> = { hipster: 'Hipster', influencer: 'Influencer', techbro: 'Tech bro', dad: 'Dad' };

export class Hud {
  private tab: Tab = 'build';

  constructor(private scene: Game) {
    scene.onChange = () => this.renderPanel();
    scene.onToast = (m) => this.toast(m);
    scene.onEvents = (e) => this.handleEvents(e);

    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.renderPanel();
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        scene.speed = Number(b.dataset.speed);
        this.renderTop();
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-rotate]').forEach((b) =>
      b.addEventListener('click', () => scene.rotate(Number(b.dataset.rotate) as 1 | -1)),
    );
    $('#panel').addEventListener('click', (e) => this.onPanelClick(e));
    $('#reset').addEventListener('click', async () => {
      if (!confirm('Wipe your save and start over? The beards will be shaved.')) return;
      await wipeSave();
      location.reload();
    });
    $('#name').addEventListener('change', (e) => {
      scene.state.name = (e.target as HTMLInputElement).value.trim() || 'Untitled Burger Concept';
      void saveGame(scene.state);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void saveGame(scene.state);
    });
    window.addEventListener('beforeunload', () => void saveGame(scene.state));

    ($('#name') as HTMLInputElement).value = scene.state.name;
    this.renderPanel();
    setInterval(() => this.renderTop(), 200);
  }

  private renderTop() {
    const s = this.scene.state;
    $('#day').textContent = `Day ${s.day}`;
    $('#clock').textContent = s.minute >= CLOSE_MIN ? 'Closing up…' : clock(s.minute);
    const m = $('#money');
    m.textContent = money(s.money);
    m.classList.toggle('neg', s.money < 0);
    $('#rep').textContent = `${(s.reputation / 20).toFixed(1)}★`;
    $('#vibe').textContent = `${vibeScore(s)}`;
    $('#price-tol').textContent = `${Math.round((vibeFactor(s) - 1) * 100)}%`;
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === this.scene.speed));
    // Keep affordability fresh without rebuilding the panel under the cursor.
    document.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach((b) => {
      b.disabled = s.money < Number(b.dataset.cost);
    });
  }

  private renderPanel() {
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const s = this.scene.state;
    const mode = this.scene.mode;
    let html = '';

    if (this.tab === 'build') {
      const section = (title: string, layer: string) => {
        html += `<h3>${title}</h3>`;
        for (const [id, item] of Object.entries(CATALOG)) {
          if (item.layer !== layer) continue;
          const owned = item.unlocks && s.wall.some((w) => w.type === id);
          const active = mode.kind === 'place' && mode.type === id;
          html += `<button class="card ${active ? 'active' : ''}" data-buy="${id}" ${owned ? 'disabled' : `data-cost="${item.cost}"`}>
            <span class="row"><b>${item.name}</b><span class="price">${owned ? 'Owned' : money(item.cost)}</span></span>
            <span class="blurb">${item.blurb}</span>
            <span class="tag">+${item.vibe} vibe${item.layer === 'wall' ? ' · auto-hangs on a wall' : ''}</span>
          </button>`;
        }
      };
      html += `<p class="hint">${mode.kind === 'place' ? `Placing <b>${CATALOG[mode.type].name}</b>. Click tiles to place, right-click or Esc to stop.` : mode.kind === 'sell' ? 'Click furniture or lights to sell for 50%.' : 'Pick something, then click a floor tile. Drag to pan, scroll to zoom, Q/E to rotate.'}</p>`;
      html += `<button class="ghost-btn ${mode.kind === 'sell' ? 'active' : ''}" data-action="sell-mode">${mode.kind === 'sell' ? 'Done selling' : 'Sell mode'}</button>`;
      section('Seating', 'floor');
      section('Lighting', 'ceiling');
      section('Walls', 'wall');
      if (s.wall.length) {
        html += `<h3>On your walls</h3>`;
        for (const w of s.wall) html += `<div class="owned"><span>${CATALOG[w.type].name}</span><button data-sell="${w.id}">Sell</button></div>`;
      }
    } else if (this.tab === 'menu') {
      html += `<p class="hint">Customers tolerate ~<b>${Math.round((vibeFactor(s) - 1) * 100)}%</b> over base price thanks to your vibe. Push it and they'll walk out.</p>`;
      for (const [id, item] of Object.entries(MENU)) {
        const available = menuAvailable(s, id);
        html += `<div class="card menu ${available ? '' : 'locked'}">
          <span class="row"><b>${item.name}</b><span class="price big">${money(s.prices[id])}</span></span>
          <span class="blurb">${item.blurb}</span>
          ${available
            ? `<span class="row"><span class="tag">Base ${money(item.basePrice)} · costs ${money(item.cost)} · ${item.cookMin} min</span>
               <span class="steppers"><button data-price="${id}" data-delta="-0.5">−</button><button data-price="${id}" data-delta="0.5">+</button></span></span>`
            : `<span class="tag">Requires ${CATALOG[item.requires!].name}</span>`}
        </div>`;
      }
    } else if (this.tab === 'staff') {
      html += `<p class="hint">Each chef cooks one order at a time. Wage ${money(CHEF_WAGE)}/day. Rent is ${money(DAILY_RENT)}/day.</p>`;
      for (const name of s.chefs) html += `<div class="owned"><span>🧔 ${name}</span><span class="tag">Flannel · man bun · vision</span></div>`;
      html += `<div class="actions">
        <button class="primary" data-action="hire" ${s.chefs.length >= MAX_CHEFS ? 'disabled' : `data-cost="${CHEF_SIGNING}"`}>Hire a chef (${money(CHEF_SIGNING)})</button>
        <button data-action="fire" ${s.chefs.length <= 1 ? 'disabled' : ''}>Let one go</button>
      </div>`;
      html += `<p class="hint">Queue: ${s.orders.length} order${s.orders.length === 1 ? '' : 's'} in the kitchen.</p>`;
    } else {
      if (!s.reviews.length) html += `<p class="hint">No reviews yet. Give it time. Or an Edison bulb.</p>`;
      for (const r of s.reviews) {
        html += `<div class="review"><div class="row"><span class="stars s${r.stars}">${stars(r.stars)}</span><span class="tag">${KIND_LABEL[r.kind]} · Day ${r.day}</span></div><p>${esc(r.text)}</p></div>`;
      }
    }
    $('#panel').innerHTML = html;
    this.renderTop();
  }

  private onPanelClick(e: Event) {
    const el = (e.target as HTMLElement).closest('button');
    if (!el || el.disabled) return;
    const s = this.scene.state;
    let err: string | null = null;
    let changed = true;

    if (el.dataset.buy) {
      const type = el.dataset.buy;
      if (CATALOG[type].layer === 'wall') err = buyWall(s, type);
      else {
        const m = this.scene.mode;
        this.scene.setMode(m.kind === 'place' && m.type === type ? { kind: 'none' } : { kind: 'place', type });
        return;
      }
    } else if (el.dataset.sell) {
      err = sell(s, Number(el.dataset.sell));
    } else if (el.dataset.price) {
      setPrice(s, el.dataset.price, s.prices[el.dataset.price] + Number(el.dataset.delta));
    } else if (el.dataset.action === 'sell-mode') {
      this.scene.setMode(this.scene.mode.kind === 'sell' ? { kind: 'none' } : { kind: 'sell' });
      return;
    } else if (el.dataset.action === 'hire') err = hireChef(s);
    else if (el.dataset.action === 'fire') err = fireChef(s);
    else changed = false;

    if (err) this.toast(err);
    else if (changed) {
      this.scene.markLayoutDirty();
      void saveGame(s);
    }
    this.renderPanel();
  }

  private handleEvents(events: SimEvent[]) {
    let reviews = false;
    for (const e of events) {
      if (e.type === 'review') {
        reviews = true;
        if (e.review.kind === 'influencer') this.toast(`📸 Influencer posted: “${e.review.text}”`);
      } else if (e.type === 'dayEnd') this.showDayEnd(e.summary);
    }
    if (reviews && this.tab === 'reviews') this.renderPanel();
  }

  private showDayEnd(d: DaySummary) {
    void saveGame(this.scene.state);
    const line = (label: string, v: number) => `<div class="row"><span>${label}</span><span class="${v < 0 ? 'neg' : ''}">${money(v)}</span></div>`;
    this.modal(`
      <h2>Day ${d.day} wrap-up</h2>
      <p class="hint">${d.served} served · ${d.walkouts} walked out</p>
      ${line('Sales', d.revenue)}
      ${line('Ingredients', -d.ingredients)}
      ${line('Rent', -d.rent)}
      ${line('Wages', -d.wages)}
      <div class="row total"><span>Profit</span><span class="${d.profit < 0 ? 'neg' : ''}">${money(d.profit)}</span></div>
      <p class="quip">${d.profit > 800 ? 'Time to open a second location in a converted warehouse.' : d.profit > 0 ? 'Profitable! Barely. Very on brand.' : 'The concept is ahead of its time. Or the prices are.'}</p>
    `, 'Open tomorrow');
  }

  modal(html: string, cta: string, onClose?: () => void) {
    const root = $('#modal');
    root.innerHTML = `<div class="sheet">${html}<button class="primary" id="modal-ok">${cta}</button></div>`;
    root.hidden = false;
    const prevSpeed = this.scene.speed;
    this.scene.speed = 0;
    $('#modal-ok').addEventListener('click', () => {
      root.hidden = true;
      this.scene.speed = prevSpeed || 1;
      onClose?.();
    });
  }

  toast(msg: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }
}
