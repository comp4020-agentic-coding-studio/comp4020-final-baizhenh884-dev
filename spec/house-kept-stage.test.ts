import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LiveBody } from "../src/lib/house/live-body";
import { BEAT_MS, KeptStage } from "../src/lib/house/kept-stage";
import { TERRITORIES } from "../src/lib/house/territories";
import { classifyMoment } from "../src/lib/kept-moment";
import { deriveKeptShip, type KeptChange } from "../src/lib/kept-ship";

// The kept house live (docs/decisions/0003, Slice 5), without a renderer:
// KeptStage takes each kept ship a change event brings, with its moment, and
// moves the kept body (a crossing part arriving in its gap, a later ship's
// quiet beat). In a busy room several changes land within a second or two,
// so (as the standing house already does) a new change finishes whatever is
// still in flight at once: nothing stacks up, nothing lags behind the truth,
// and after any burst the kept house is exactly what a fresh load shows.
// The kept states come from deriveKeptShip over a simulated history, so they
// pass through ship 1's completion and hold, and ship 2's completion.

const drawing = (g: THREE.Group) => {
  const out = new THREE.Group();
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.add(new THREE.LineSegments(new THREE.EdgesGeometry((o as THREE.Mesh).geometry))); });
  return out;
};

function form(g: THREE.Group): string {
  g.updateMatrixWorld(true);
  const solids: string[] = [], v = new THREE.Vector3();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute("position"), pts: string[] = [];
    for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray().map((x) => x.toFixed(4)).join(","));
    solids.push(`${m.userData.role ?? ""}:${pts.join(";")}`);
  });
  return solids.sort().join("|");
}

const POOL = (JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")) as { rows: [number, string][] }).rows
  .filter((r) => r[0] === 0).map((r) => r[1]).slice(0, 325);
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

// a history of replacements and the kept ship after each, exactly as the server derives it
function history(seed: number, length: number) {
  const next = rng(seed), word = () => POOL[Math.floor(next() * POOL.length)];
  const words = Array.from({ length: 10 }, word), versions = Array(10).fill(1), changes: KeptChange[] = [];
  const steps = [{ position: -1, kept: deriveKeptShip(changes, words.map((w, i) => ({ word: w, version: versions[i] }))) }];
  // mostly the oldest positions first, so ships complete within the run
  for (let k = 0; k < length; k++) {
    const oldest = Math.min(...versions), candidates = versions.flatMap((v, i) => (v === oldest || next() < 0.25 ? [i] : []));
    const position = candidates[Math.floor(next() * candidates.length)];
    let w = word();
    while (w === words[position]) w = word();
    changes.push({ position, fromVersion: versions[position], fromWord: words[position] });
    words[position] = w;
    versions[position]++;
    steps.push({ position, kept: deriveKeptShip(changes, words.map((x, i) => ({ word: x, version: versions[i] }))) });
  }
  return steps;
}

function freshMismatches(stage: KeptStage, kept: { words: string[]; gaps: boolean[] }): string[] {
  const fresh = new LiveBody("kept", drawing);
  fresh.show(kept.words);
  const out = TERRITORIES.filter((_, i) => form(stage.body.groups[i]) !== form(fresh.groups[i])).map((t) => t.id);
  if (JSON.stringify(stage.gaps) !== JSON.stringify(kept.gaps)) out.push("gaps");
  if (stage.animating) out.push("not settled");
  fresh.dispose();
  return out;
}

describe("The kept house, live", () => {
  it("passes through ship 1's completion and ship 2's in the simulated history", () => {
    const ships = history(1, 40).map((s) => s.kept.ship);
    expect(Math.max(...ships), "the history never reached ship 3").toBeGreaterThanOrEqual(3);
  });

  for (const [name, gap] of [["one at a time", 10_000], ["in a burst, 150 ms apart", 150], ["all at once", 0]] as const) {
    it(`settles on exactly what a fresh load shows, after changes ${name}`, () => {
      for (const seed of [1, 2, 3]) {
        const steps = history(seed, 40), stage = new KeptStage(drawing);
        stage.show(steps[0].kept);
        let now = 0, prev = steps[0].kept;
        for (const { position, kept } of steps.slice(1)) {
          now += gap;
          stage.step(now, false);
          stage.apply(kept, classifyMoment(prev, kept, position), now);
          prev = kept;
          // nothing stacks up: at most one thing in flight
          expect(stage.body.exchanges.length + stage.body.arrivals.length, `more than one motion in flight (seed ${seed})`).toBeLessThanOrEqual(1);
          // and the truth it's heading for is always the newest
          expect(stage.target, `the stage lags behind the newest kept ship (seed ${seed})`).toEqual(kept);
        }
        stage.finishAll();
        expect(freshMismatches(stage, prev), `seed ${seed}`).toEqual([]);
        stage.body.dispose();
      }
    });
  }

  it("settles on the fresh body by time alone, once nothing else arrives", () => {
    const steps = history(5, 40), stage = new KeptStage(drawing);
    stage.show(steps[0].kept);
    let prev = steps[0].kept, now = 0;
    for (const { position, kept } of steps.slice(1)) { stage.apply(kept, classifyMoment(prev, kept, position), (now += 100)); prev = kept; }
    stage.step(now + 60_000, false);
    expect(freshMismatches(stage, prev)).toEqual([]);
    stage.body.dispose();
  });

  it("gives a later ship a quiet beat: the completed ship stands whole, then gives way to the next", () => {
    const steps = history(1, 40);
    const i = steps.findIndex((s, k) => k > 0 && s.kept.ship >= 3 && steps[k - 1].kept.ship === 2);
    expect(i, "no ship-2 completion in the history").toBeGreaterThan(0);
    const before = steps[i - 1].kept, after = steps[i].kept, position = steps[i].position;
    expect(classifyMoment(before, after, position)?.kind).toBe("later");
    const stage = new KeptStage(drawing);
    stage.show(before);
    stage.apply(after, classifyMoment(before, after, position), 0);
    expect(stage.gaps.every((g) => !g), "the completed ship isn't shown whole during its beat").toBe(true);
    stage.step(BEAT_MS + 1, false);
    stage.step(BEAT_MS + 60_000, false);
    expect(freshMismatches(stage, after)).toEqual([]);
    stage.body.dispose();
  });

  it("ends a later ship's beat at once when another change arrives during it", () => {
    const steps = history(1, 40);
    const i = steps.findIndex((s, k) => k > 0 && s.kept.ship >= 3 && steps[k - 1].kept.ship === 2);
    const stage = new KeptStage(drawing);
    stage.show(steps[i - 1].kept);
    stage.apply(steps[i].kept, classifyMoment(steps[i - 1].kept, steps[i].kept, steps[i].position), 0);
    stage.apply(steps[i + 1].kept, classifyMoment(steps[i].kept, steps[i + 1].kept, steps[i + 1].position), 50);
    expect(stage.gaps, "the beat outlived a newer change").toEqual(steps[i + 1].kept.gaps);
    stage.finishAll();
    expect(freshMismatches(stage, steps[i + 1].kept)).toEqual([]);
    stage.body.dispose();
  });

  it("with reduced motion, settles on the fresh body too", () => {
    const steps = history(2, 30), stage = new KeptStage(drawing);
    stage.show(steps[0].kept);
    let prev = steps[0].kept;
    for (const { position, kept } of steps.slice(1)) {
      stage.apply(kept, classifyMoment(prev, kept, position), 0);
      stage.step(0, true);
      prev = kept;
    }
    stage.step(BEAT_MS + 1, true);
    expect(freshMismatches(stage, prev)).toEqual([]);
    stage.body.dispose();
  });
});
