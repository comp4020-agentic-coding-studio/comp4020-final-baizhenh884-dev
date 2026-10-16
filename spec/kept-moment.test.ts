import { describe, expect, it } from "vitest";
import { classifyMoment, type KeptShip } from "../src/lib/kept-moment";

// The moment of a replacement (docs/decisions/0003-settle-and-kept-ships.md,
// Slice 5), from the kept ship a page last showed and the one a change event
// brings. Pure, so it runs the same against any APP_URL:
//   cross  the replaced word fills a gap of the ship being assembled, so its
//          part travels from the standing house into the kept one
//   first  it closes ship 1's last gap: the loud line, once, live
//   later  it closes a later ship's last gap: a quiet beat, no line, no hold
//   null   nothing crosses (the word was not part of the ship being shown)

const STARTING = ["Make", "a", "website", "that", "people", "would", "miss", "if", "it", "disappeared"];
const ship = (filled: number[], words = STARTING): KeptShip => ({ words: [...words], gaps: words.map((_, i) => !filled.includes(i)) });
const all = [...Array(10).keys()];

describe("the moment of a replacement", () => {
  it("is a crossing when the replaced word fills a gap of the ship being assembled", () => {
    expect(classifyMoment(ship([]), ship([3]), 3)).toEqual({ position: 3, kind: "cross" });
    expect(classifyMoment(ship([0, 1]), ship([0, 1, 7]), 7)).toEqual({ position: 7, kind: "cross" });
  });

  it("is nothing when the replaced position was already kept in the ship being shown", () => {
    expect(classifyMoment(ship([3]), ship([3]), 3)).toBeNull();
  });

  it("is the first ship's completion when it closes ship 1's last gap (the ship is then held whole)", () => {
    const before = ship(all.filter((i) => i !== 5));
    expect(classifyMoment(before, ship(all), 5)).toEqual({ position: 5, kind: "first" });
  });

  it("is a later ship's completion when it closes a later ship's last gap (no hold: the next ship follows at once)", () => {
    const ship2 = STARTING.map((w) => `${w}2`);
    const before = ship(all.filter((i) => i !== 5), ship2);
    const ship3 = ship([], STARTING.map((w) => `${w}3`));
    expect(classifyMoment(before, ship3, 5)).toEqual({ position: 5, kind: "later" });
  });

  it("is a crossing into ship 2 for the first change after ship 1's hold", () => {
    const ship2 = ship([4], STARTING.map((w) => `${w}2`));
    expect(classifyMoment(ship(all), ship2, 4)).toEqual({ position: 4, kind: "cross" });
  });

  it("is nothing without a kept ship shown before it (a fresh load or a reconnect never replays one)", () => {
    expect(classifyMoment(undefined, ship(all), 5)).toBeNull();
  });
});
