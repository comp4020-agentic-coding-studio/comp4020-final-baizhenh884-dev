// The shipwrights (docs/decisions/0005-the-ship.md, "Co-presence"): one small
// figure per open view of the current sentence, at most CREW_MAX drawn, all
// alike: no name, no colour of its own. They wait on the quay, and one
// catches each tossed plank and carries it to its place (stage.ts holds where
// they stand and walk). On this visitor's page one of them is theirs, marked
// by a soft glow at its feet; the server never says which. Draws what it's
// told and decides nothing.

import * as THREE from "three";
import { crewSpots, PASSER } from "./stage";

const TUNIC = 0xe9dfc8, SKIN = 0xb98a62, BELT = 0x6b4a2e, MINE = 0xf2c46b;

export type Figure = { root: THREE.Group; legs: [THREE.Object3D, THREE.Object3D]; arms: [THREE.Object3D, THREE.Object3D]; busy: boolean; passer: boolean };

export class Crew {
  readonly root = new THREE.Group();
  private figures: Figure[] = [];
  private mark: THREE.Mesh;
  private owned: { dispose(): void }[] = [];
  private mats: Record<string, THREE.MeshStandardMaterial>;
  private geo: Record<string, THREE.BufferGeometry>;

  constructor() {
    const own = <T extends { dispose(): void }>(x: T) => (this.owned.push(x), x);
    const M = (color: number) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
    this.mats = { tunic: M(TUNIC), skin: M(SKIN), belt: M(BELT) };
    this.geo = {
      body: own(new THREE.CylinderGeometry(0.2, 0.28, 0.75, 7)),
      head: own(new THREE.SphereGeometry(0.17, 8, 6)),
      limb: own(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 5)),
      belt: own(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 7)),
    };
    // your figure's mark: a soft glow on the deck at its feet, your page only
    this.mark = new THREE.Mesh(own(new THREE.CircleGeometry(0.5, 20)), own(new THREE.MeshBasicMaterial({ color: MINE, transparent: true, opacity: 0.55, depthWrite: false })));
    this.mark.rotation.x = -Math.PI / 2;
    this.mark.visible = false;
    this.root.add(this.mark);
  }

  get count(): number { return this.figures.filter((f) => !f.passer).length; }

  // as many figures waiting as there are views open (capped); figures carrying a plank keep carrying it
  set(total: number): void {
    const spots = crewSpots(total);
    while (this.count < spots.length) this.figures.push(this.make(false));
    while (this.count > spots.length) {
      const idle = this.figures.findLastIndex((f) => !f.passer && !f.busy);
      if (idle < 0) break;
      this.drop(this.figures[idle]);
    }
    this.place();
  }

  // the figure that carries a plank: yours for your own change; otherwise another, or one passing by when no
  // other is free (so every plank is carried the same way). Null only with reduced motion (nothing is carried).
  take(yours: boolean): Figure {
    const free = this.figures.filter((f) => !f.passer && !f.busy);
    let f = yours ? free[0] : free.find((x) => x !== this.figures[0]);
    if (!f) { f = this.make(true); this.figures.push(f); this.pose(f, PASSER, 1, 0, false); }
    f.busy = true;
    return f;
  }

  // a carry is over: the figure goes back to its place, or a passer-by leaves
  give(f: Figure): void {
    f.busy = false;
    if (f.passer) this.drop(f);
    this.place();
  }

  // a figure where it walks, its stride `phase` (radians), and whether it holds a plank up
  pose(f: Figure, at: THREE.Vector3, facing: number, phase: number, holding: boolean): void {
    f.root.position.copy(at);
    f.root.rotation.y = facing;
    const swing = Math.sin(phase) * 0.55;
    f.legs[0].rotation.x = swing;
    f.legs[1].rotation.x = -swing;
    f.arms[0].rotation.x = holding ? -2.6 : -swing * 0.7;
    f.arms[1].rotation.x = holding ? -2.6 : swing * 0.7;
    if (f === this.figures[0] && this.mark.visible) this.mark.position.set(at.x, at.y + 0.02, at.z);
  }

  // your figure is the first: marked only on your page
  mine(on: boolean): void { this.mark.visible = on && this.figures.length > 0; this.place(); }
  isMine(f: Figure): boolean { return this.mark.visible && f === this.figures[0]; }

  dispose(): void {
    for (const f of [...this.figures]) this.drop(f);
    for (const x of this.owned) x.dispose();
  }

  // ---------------------------------------------------------------------------

  // the waiting figures at their places, facing the water
  private place(): void {
    const spots = crewSpots(this.count);
    let k = 0;
    for (const f of this.figures) {
      if (f.passer || f.busy) continue;
      this.pose(f, spots[k++], -0.5, 0, false);
    }
  }

  private make(passer: boolean): Figure {
    const root = new THREE.Group();
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    const limb = (x: number, y: number, m: THREE.Material) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      mesh(this.geo.limb, m, 0, -0.27, 0, pivot);
      root.add(pivot);
      return pivot;
    };
    mesh(this.geo.body, this.mats.tunic, 0, 0.95, 0);
    mesh(this.geo.belt, this.mats.belt, 0, 0.85, 0);
    mesh(this.geo.head, this.mats.skin, 0, 1.5, 0);
    const legs: [THREE.Object3D, THREE.Object3D] = [limb(-0.1, 0.58, this.mats.skin), limb(0.1, 0.58, this.mats.skin)];
    const arms: [THREE.Object3D, THREE.Object3D] = [limb(-0.27, 1.25, this.mats.skin), limb(0.27, 1.25, this.mats.skin)];
    this.root.add(root);
    return { root, legs, arms, busy: false, passer };
  }

  private drop(f: Figure): void {
    this.figures.splice(this.figures.indexOf(f), 1);
    f.root.removeFromParent();
    if (!this.figures.length) this.mark.visible = false;
  }
}
