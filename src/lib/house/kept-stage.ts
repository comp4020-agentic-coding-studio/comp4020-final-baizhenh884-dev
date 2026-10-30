// The kept house, live (docs/decisions/0003-settle-and-kept-ships.md, Slice
// 5), without a renderer, so it runs and is tested in node
// (spec/house-kept-stage.test.ts). It takes each kept ship a change event
// brings, with that change's moment (kept-moment.ts), and moves the kept
// body: a crossing part sets down into its gap; a later ship's completion is
// a quiet beat (the completed ship whole for a moment, then the next one,
// with no line and no hold). A newer change finishes whatever is still under
// way at once, so nothing stacks up or lags behind the truth: `target` is
// always the newest kept ship, and once nothing is under way the body and
// its gaps are exactly a fresh load's.

import * as THREE from "three";
import type { KeptShip, Moment } from "../kept-moment";
import { LiveBody } from "../ship/live-body";
import { duration } from "../ship/motion";

// how long a later ship stands whole once its last part has arrived
export const BEAT_MS = 1400;

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((w, i) => w === b[i]);

export class KeptStage {
  readonly body: LiveBody;
  // which positions the kept body shows as gaps (a faint outline) right now
  gaps: boolean[] = [];
  // the newest kept ship told: what the body settles on
  target: KeptShip | null = null;
  private words: string[] = [];
  private beat: { start: number; next: KeptShip } | null = null;

  constructor(drawing: (g: THREE.Group) => THREE.Group) {
    this.body = new LiveBody("kept", drawing);
  }

  get animating(): boolean { return this.body.animating || this.beat !== null; }

  // a kept ship as a fresh load shows it: at once, no moment
  show(kept: KeptShip): void {
    this.beat = null;
    this.target = kept;
    this.put(kept);
  }

  // a kept ship from a change event, and that change's moment
  apply(kept: KeptShip, moment: Moment | null, now: number, from = new THREE.Vector3()): void {
    this.finishAll();
    this.target = kept;
    if (moment?.kind === "later") {
      // the completed ship whole (the word arriving is the one standing at its gap: the same body), for a beat
      this.put({ words: this.words, gaps: this.gaps.map(() => false), next: kept.next });
      this.body.arrive(moment.position, now, from);
      this.beat = { start: now, next: kept };
      return;
    }
    this.put(kept);
    // a word waiting for the next house isn't in this ship: nothing arrives in the kept house
    if (moment && moment.kind !== "wait") this.body.arrive(moment.position, now, from);
  }

  step(now: number, reduced: boolean): void {
    this.body.step(now, reduced);
    if (this.beat && now - this.beat.start >= (reduced ? 0 : duration("cross", false)) + BEAT_MS) {
      const next = this.beat.next;
      this.beat = null;
      this.put(next);
    }
  }

  // finish whatever is under way, at once, landing on the newest kept ship
  finishAll(): void {
    this.body.finishAll();
    if (this.beat) {
      const next = this.beat.next;
      this.beat = null;
      this.put(next);
    }
  }

  private put(kept: KeptShip): void {
    // the same words are the same body: only which territories are gaps changes
    if (!this.body.groups.length || !same(this.words, kept.words)) this.body.show(kept.words);
    this.words = [...kept.words];
    this.gaps = [...kept.gaps];
  }
}
