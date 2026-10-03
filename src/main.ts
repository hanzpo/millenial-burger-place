import './style.css';
import { loadModels } from './game/assets';
import { Game } from './game/Game';
import { loadGame, saveGame } from './save';
import { createInitialState } from './sim/state';
import { Hud } from './ui/hud';

async function boot() {
  const bar = document.querySelector<HTMLElement>('#loading-bar')!;
  await loadModels((done, total) => (bar.style.width = `${(done / total) * 100}%`));
  const loaded = await loadGame().catch((err) => {
    console.error('Save could not be loaded, starting fresh', err);
    return null;
  });
  const state = loaded?.state ?? createInitialState();

  const game = new Game(document.querySelector('#game')!, state);
  const hud = new Hud(game);
  document.querySelector('#loading')!.remove();
  (window as unknown as { game: Game }).game = game; // handy in devtools

  if (!loaded) {
    hud.modal(
      `<h2>Welcome to the concept.</h2>
       <p>You and your buddy have a crazy idea: <b>burgers</b>. But on a wooden board. With a toothpick. For $17.95.</p>
       <p class="hint">Buy decor to raise your <b>vibe</b> (customers pay more). Set prices in <b>Menu</b>. Hire bearded chefs in <b>Staff</b>. Rent is due every night.</p>`,
      "Let's smash",
    );
    void saveGame(state);
  } else if (loaded.offlineEarnings > 0) {
    hud.modal(
      `<h2>Welcome back</h2>
       <p>While you were gone ${loaded.hoursAway.toFixed(1)}h, your sous chef kept the flat-top hot.</p>
       <p class="big-money">+$${loaded.offlineEarnings.toLocaleString()}</p>`,
      'Nice',
    );
  }
}

void boot();
