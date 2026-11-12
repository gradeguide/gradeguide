// Rng is a seeded random number generator (mulberry32). The same seed gives
// the same numbers on every JavaScript engine, so a worksheet's items are
// reproducible from its record alone.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // next returns a number in [0, 1).
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // int returns an integer from min to max, both included.
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) {
      throw new Error('pick from an empty list');
    }
    return xs[Math.floor(this.next() * xs.length)];
  }
}

// hashSeed mixes a seed with a string, so each placement on a worksheet gets
// its own stream of numbers (FNV-1a over the string, then the seed).
export function hashSeed(seed: number, s: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
