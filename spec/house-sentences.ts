import { readFileSync } from "node:fs";

// The sentences the house is checked over: the Prototype 6 set (seed 4020
// over the grammar fixture's word pool, its first 325 words, in order) and a
// few extremes. Shared so every geometric check builds the same bodies.

const fixture = JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")) as {
  rows: [number, string, ...unknown[]][];
};
const POOL = fixture.rows.filter((r) => r[0] === 0).map((r) => r[1]).slice(0, 325);
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
export const BASE = "Keep many website that people would miss whether it disappeared".split(" ");
export const EXTREMES = [
  BASE,
  Array(10).fill("a"),
  Array(10).fill("incomprehensibilities"),
  Array(10).fill("bookkeeper"),
  Array(10).fill("rhythm"),
  Array(10).fill("tallbuildthat"), // 3+ tall letters everywhere: the tower
  BASE.map((w, i) => (i === 2 ? "incomprehensibilities" : w)),
];
