import type { Customer } from './state';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const BY_STARS: Record<number, string[]> = {
  5: [
    'The Edison bulbs made my burger taste like 2014. 10/10.',
    'My server had a man bun AND a vision.',
    'Fries came in a tiny wire basket. I wept.',
    'They put a toothpick in it so you know it is serious.',
    'Exposed brick. Exposed beard. Exposed soul.',
  ],
  4: [
    "Doesn't even taste that good but the lighting? Chef's kiss.",
    'Sat on a metal stool for an hour. Worth it for the vibes.',
    'The egg one is the move. It is always the egg one.',
    'Very brick. Very good. Very expensive.',
  ],
  3: [
    'Could not read the chalkboard. Pointed at something. It was fine.',
    'A burger. In a building. With bulbs.',
    'Guy making the burger gave me a thumbs up. Burger was a 6.',
  ],
  2: [
    'Waited so long my oat milk expired.',
    'Saw more of the chef’s beard than my food.',
    'The happy hour on the sign ended in 2019.',
  ],
  1: [
    'Just two guys with a crazy idea, and the idea was charging this much.',
    'I asked for a regular burger and they laughed at me.',
    'My burger had a fried egg I did not ask for. Somehow it was still bad.',
  ],
};

const INFLUENCER = [
  'Posted it to my 40k followers. Lighting carried. #smashburger',
  'Shot 212 photos of this burger. Ate it cold. Iconic.',
  'Not sponsored (they would not sponsor me).',
];

const TECHBRO = [
  'Took a call at the table. Burger scaled well.',
  'Basically the Notion of burgers.',
];

const DAD = [
  'Why is it on a board. Where is the plate.',
  'Paid what I used to pay for a tank of gas.',
];

export function reviewText(stars: number, c: Customer): string {
  if (c.kind === 'influencer' && stars >= 3 && Math.random() < 0.6) return pick(INFLUENCER);
  if (c.kind === 'techbro' && stars >= 3 && Math.random() < 0.4) return pick(TECHBRO);
  if (c.kind === 'dad' && stars <= 3 && Math.random() < 0.6) return pick(DAD);
  if (c.waited > 30 && stars <= 3) return pick(BY_STARS[2]);
  return pick(BY_STARS[stars]);
}

export function walkoutText(reason: 'line' | 'price', price = 0): string {
  if (reason === 'line') return pick(['Line was out the door. Went to Five Guys.', 'Too many beanies in line. Left.']);
  return pick([
    `Bro. $${price.toFixed(2)} for a burger?`,
    `Read the chalkboard. Saw $${price.toFixed(2)}. Turned around.`,
  ]);
}
