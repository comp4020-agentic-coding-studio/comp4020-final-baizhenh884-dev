import { readFileSync } from "node:fs";

// The sentences the ship is checked over: 500 drawn (seed 4020) from the ship
// fixture's word pool, and a few extremes. Shared so every geometric check
// builds the same ships.

const POOL = (JSON.parse(readFileSync(new URL("./fixtures/ship-counts.json", import.meta.url), "utf8")) as { rows: [string, ...unknown[]][] }).rows.map((r) => r[0]);
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = rng(4020);
export const SENTENCES = Array.from({ length: 500 }, () => Array.from({ length: 10 }, () => POOL[Math.floor(next() * POOL.length)]));
export const BASE = "Make a website that people would miss if it disappeared".split(" ");
export const EXTREMES = [
  BASE,
  Array(10).fill("a"),
  Array(10).fill("123"),
  Array(10).fill("incomprehensibilities"),
  Array(10).fill("w".repeat(24)),
  Array(10).fill("rhythm"),
  Array(10).fill("aeiou"),
  Array(10).fill("jigglypuppy"),
  Array(10).fill("bdfhktl"),
];
