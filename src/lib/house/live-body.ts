// The body on show and the exchanges under way, without a renderer (so it
// runs and is tested in node). One rule for ownership: `groups[i]` is always
// the territory now standing at position i. A changed territory hands over to
// its incoming group the moment the change begins; the outgoing group belongs
// only to its exchange, which releases it when it ends. Nothing reachable from
// `groups` is ever released.

import * as THREE from "three";
import { buildBody, type BuiltBody } from "./build";
import { arrivalAt, duration, frameAt, type Arrival as ArrivalFrame, type Frame, type Kind } from "./motion";
import { dress, type Look, undress } from "./theme";

export type Exchange = { start: number; kind: Kind; position: number; outgoing: THREE.Group; incoming: THREE.Group; trace: THREE.Group; away: THREE.Vector3; across: THREE.Vector3; inY: number };
// a crossing part arriving in the kept house: the standing group at `position`, set down from `from` (its offset at the start)
export type Arrival = { start: number; position: number; group: THREE.Group; from: THREE.Vector3 };
export type Follow = { start: number; outgoing: THREE.Group; incoming: THREE.Group };
export const FOLLOW_MS = 450;

// a territory's whole form, for "did this neighbour change?": every solid's role and its
// vertices relative to the territory, in build order (the builder is deterministic). An
// outline and a count weren't enough: a solid can move inside an unchanged outline, and
// a neighbour kept on that basis stood stale until the page was reloaded.
const signature = (g: THREE.Group) => {
  g.updateMatrixWorld(true);
  const toGroup = g.matrixWorld.clone().invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), out: string[] = [];
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    m.multiplyMatrices(toGroup, mesh.matrixWorld);
    const p = mesh.geometry.getAttribute("position");
    let s = `${mesh.userData.role ?? ""}:`;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); s += `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)};`; }
    out.push(s);
  });
  return out.join("|");
};

export class LiveBody {
  readonly root = new THREE.Group();
  private current: THREE.Group[] = [];
  private plan: BuiltBody["plan"] | null = null;
  readonly exchanges: Exchange[] = [];
  readonly follows: Follow[] = [];
  readonly arrivals: Arrival[] = [];

  constructor(private look: Look, private drawing: (g: THREE.Group) => THREE.Group) {}

  // the territories standing now, by position (read-only to callers)
  get groups(): readonly THREE.Group[] { return this.current; }
  get animating(): boolean { return this.exchanges.length + this.follows.length + this.arrivals.length > 0; }

  // the whole body of a sentence, at once
  show(words: readonly string[]): void {
    this.finishAll();
    for (const g of this.current) this.release(g, true, true);
    const next = buildBody(words);
    this.current = next.groups.map((g, i) => this.adopt(g, i));
    this.plan = next.plan;
  }

  // One position's word changed. The body is rebuilt from the whole new
  // sentence: that territory is exchanged; a neighbour whose form followed from
  // it (a roof's overhang, a threshold's spread) follows quietly; every other
  // territory keeps its standing group and the rebuilt copy is released. A
  // crossing's old part travels `across` (its whole way out of the house, in
  // world units, which the view measures) as well.
  change(position: number, words: readonly string[], kind: Kind, now: number, across = new THREE.Vector3()): void {
    if (!this.current.length) return this.show(words);
    this.finishAll();
    const next = buildBody(words);
    next.groups.forEach((incoming, i) => {
      const standing = this.current[i];
      if (i !== position && signature(standing) === signature(incoming)) {
        this.release(incoming, false); // never shown: geometry only
        return;
      }
      this.current[i] = this.adopt(incoming, i); // the handoff: from now on, i is the incoming group
      if (i === position) {
        const trace = this.drawing(standing);
        this.root.add(trace);
        const c = new THREE.Box3().setFromObject(standing, true).getCenter(new THREE.Vector3()).setY(0);
        const away = c.lengthSq() > 1e-6 ? c.normalize().multiplyScalar(0.55) : new THREE.Vector3(0, 0, 0.55);
        away.y = 1.15;
        this.exchanges.push({ start: now, kind, position, outgoing: standing, incoming: this.current[i], trace, away, across: kind === "cross" ? across.clone() : new THREE.Vector3(), inY: kind === "own" ? 1.1 : 0.8 });
      } else this.follows.push({ start: now, outgoing: standing, incoming: this.current[i] });
    });
    this.plan = next.plan;
  }

  // A crossing part arrives in this (kept) body: the territory standing at
  // `position` sets down into its place from `from`. Whatever was under way
  // finishes first, so arrivals never stack up.
  arrive(position: number, now: number, from: THREE.Vector3): void {
    this.finishAll();
    const group = this.current[position];
    if (group) this.arrivals.push({ start: now, position, group, from: from.clone() });
  }

  // advance every exchange to `now`; returns the frames to draw (an ended one is released and dropped)
  step(now: number, reduced: boolean): { exchange: Exchange; frame: Frame }[] {
    const out: { exchange: Exchange; frame: Frame }[] = [];
    for (const x of [...this.exchanges]) {
      if (now - x.start >= duration(x.kind, reduced)) this.end(x);
      else out.push({ exchange: x, frame: frameAt(x.kind, now - x.start, reduced) });
    }
    for (const f of [...this.follows]) if (reduced || now - f.start >= FOLLOW_MS) this.endFollow(f);
    for (const a of [...this.arrivals]) if (now - a.start >= duration("cross", reduced)) this.endArrival(a);
    return out;
  }

  // the arrivals still under way at `now` (after step), with their frames
  arriving(now: number, reduced: boolean): { arrival: Arrival; frame: ArrivalFrame }[] {
    return this.arrivals.map((arrival) => ({ arrival, frame: arrivalAt(now - arrival.start, reduced) }));
  }

  // finish whatever is under way, at once (a newer change, a reset, leaving)
  finishAll(): void {
    for (const x of [...this.exchanges]) this.end(x);
    for (const f of [...this.follows]) this.endFollow(f);
    for (const a of [...this.arrivals]) this.endArrival(a);
  }

  dispose(): void {
    this.finishAll();
    for (const g of this.current) this.release(g, true, true);
    this.current = [];
  }

  // ---------------------------------------------------------------------------

  private adopt(g: THREE.Group, i: number): THREE.Group {
    dress(g, i, this.look);
    g.userData.position = i;
    this.root.add(g);
    return g;
  }

  private end(x: Exchange): void {
    this.exchanges.splice(this.exchanges.indexOf(x), 1);
    x.incoming.position.set(0, 0, 0);
    this.release(x.outgoing);
    this.release(x.trace, false);
    (x.trace.userData.material as THREE.Material | undefined)?.dispose();
  }

  private endArrival(a: Arrival): void {
    this.arrivals.splice(this.arrivals.indexOf(a), 1);
    a.group.position.set(0, 0, 0);
  }

  private endFollow(f: Follow): void {
    this.follows.splice(this.follows.indexOf(f), 1);
    this.release(f.outgoing);
  }

  // detach and release a group that is no longer standing (refusing one that is)
  private release(g: THREE.Group, dressed = true, standing = false): void {
    if (!standing && this.current.includes(g)) throw new Error("a standing territory can't be released");
    g.removeFromParent();
    g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    if (dressed) undress(g);
  }
}
