// The house on the page: one renderer and the one default view over a
// LiveBody (live-body.ts), which alone decides which group stands at each
// position. This file draws: it renders only when something changes or moves,
// paints selection, picks territories, and applies each exchange's frame
// (motion.ts). It never decides anything: it shows the words it's given.

import * as THREE from "three";
import { place } from "./camera";
import type { KeptShip, Moment } from "../kept-moment";
import { KeptStage } from "./kept-stage";
import { LiveBody } from "./live-body";
import type { Kind } from "./motion";
import { EDGE, FIELD, INK, lights, type Look, partTone, RED } from "./theme";
import { anchorOf } from "./thread";

export class HouseView {
  readonly canvas: HTMLCanvasElement;
  readonly rebuildMs: number[] = [];
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();
  private body: LiveBody;
  // the kept house's live logic (kept-stage.ts): which ship, which gaps, its moments
  private stage: KeptStage | null = null;
  // the territories drawn as gaps: a faint outline, never a solid
  private ghosted = new Set<number>();
  private selected: number | null = null;
  private hovered: number | null = null;
  private traced: number | null = null;
  private queued = false;
  private observer: ResizeObserver;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private host: HTMLElement, private look: Look = "present") {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(FIELD, 0);
    this.canvas = this.renderer.domElement;
    host.append(this.canvas);
    lights(this.scene);
    if (look === "kept") {
      this.stage = new KeptStage((g) => this.drawing(g));
      this.body = this.stage.body;
    } else this.body = new LiveBody(look, (g) => this.drawing(g));
    this.scene.add(this.body.root);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  // the body of a whole sentence, at once
  show(words: readonly string[]): void {
    const t0 = performance.now();
    this.body.show(words);
    this.rebuildMs.push(performance.now() - t0);
    this.paint();
  }

  // one position's word changed: the body is rebuilt and that territory exchanged.
  // A crossing's old part travels out of this canvas toward `toward` (the kept house).
  change(position: number, words: readonly string[], kind: Kind, toward: DOMRect | null = null): void {
    const t0 = performance.now();
    const across = kind === "cross" && toward ? this.wayOut(position, toward) : new THREE.Vector3();
    this.body.change(position, words, kind, performance.now(), across);
    this.rebuildMs.push(performance.now() - t0);
    this.paint();
  }

  select(position: number | null): void { this.selected = position; this.paint(); }
  hover(position: number | null): void { this.hovered = position; this.paint(); }
  // the territory this visitor's standing word made: drawn a little firmer than the rest, nothing more
  trace(position: number | null): void { this.traced = position; this.paint(); }

  // The kept house (docs/decisions/0003-settle-and-kept-ships.md): a kept
  // ship as a fresh load shows it, its gaps a faint outline from the first
  // load; and a kept ship from a change event, with that change's moment, a
  // crossing part arriving from `from` (the standing house's side).
  keptShow(kept: KeptShip): void {
    if (!this.stage) return;
    this.stage.show(kept);
    this.paint();
  }

  keptApply(kept: KeptShip, moment: Moment | null, from: DOMRect | null): void {
    if (!this.stage) return;
    this.stage.finishAll();
    // where the part comes in from is measured on the body it arrives in (the next ship's, after a hold)
    const fromAt = (p: number) => (from ? this.wayIn(p, from) : new THREE.Vector3());
    this.stage.apply(kept, moment, performance.now(), moment ? fromAt(moment.position) : undefined);
    this.paint();
  }

  // where a territory sits on the page (client pixels): the centre of what is standing there now
  anchor(position: number): { x: number; y: number } | null {
    return anchorOf(this.body, position, this.camera, this.canvas.getBoundingClientRect());
  }

  // the territory under a point of the canvas, if any
  pick(clientX: number, clientY: number): number | null {
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const meshes: THREE.Object3D[] = [];
    this.body.groups.forEach((g) => g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); }));
    let o: THREE.Object3D | null = ray.intersectObjects(meshes, false)[0]?.object ?? null;
    while (o && o.userData.position === undefined) o = o.parent;
    return o ? (o.userData.position as number) : null;
  }

  // counts for the performance checks
  info() {
    let meshes = 0, lines = 0;
    const materials = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { meshes++; materials.add((o as THREE.Mesh).material as THREE.Material); }
      if ((o as THREE.LineSegments).isLineSegments) { lines++; materials.add((o as THREE.LineSegments).material as THREE.Material); }
    });
    const i = this.renderer.info;
    return { meshes, lines, materials: materials.size, drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, animating: this.body.animating };
  }

  destroy(): void {
    this.observer.disconnect();
    this.body.dispose();
    this.scene.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.(); });
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---------------------------------------------------------------------------

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    place(this.camera, w / h);
    this.requestFrame();
  }

  // an architectural drawing of a territory: its edges only, in its own red material
  private drawing(g: THREE.Group): THREE.Group {
    const out = new THREE.Group(), m = new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false });
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.role === "opening") return;
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), m);
      l.applyMatrix4(mesh.matrixWorld);
      out.add(l);
    });
    out.userData.material = m;
    return out;
  }

  // a pixel offset on the page, at a territory's depth, as a world vector
  private offsetAt(position: number, dx: number, dy: number): THREE.Vector3 {
    const g = this.body.groups[position];
    if (!g) return new THREE.Vector3();
    g.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(g, true).getCenter(new THREE.Vector3());
    const r = this.canvas.getBoundingClientRect(), p = c.clone().project(this.camera);
    if (!r.width || !r.height) return new THREE.Vector3();
    p.x += (dx / r.width) * 2;
    p.y -= (dy / r.height) * 2;
    return p.unproject(this.camera).sub(c);
  }

  // the screen direction from this canvas's centre toward another box's (or back from it)
  private towards(other: DOMRect): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const x = other.left + other.width / 2 - (r.left + r.width / 2), y = other.top + other.height / 2 - (r.top + r.height / 2), l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }

  // how far, in pixels, from a point along a direction until it is clear of this canvas
  private clearOf(at: { x: number; y: number }, d: { x: number; y: number }): number {
    const r = this.canvas.getBoundingClientRect();
    const tx = d.x > 1e-6 ? (r.right - at.x) / d.x : d.x < -1e-6 ? (r.left - at.x) / d.x : Infinity;
    const ty = d.y > 1e-6 ? (r.bottom - at.y) / d.y : d.y < -1e-6 ? (r.top - at.y) / d.y : Infinity;
    return Math.max(0, Math.min(tx, ty)) + Math.min(r.width, r.height) * 0.3; // and its own size beyond
  }

  // a crossing part's whole way out of this canvas, toward the kept house
  private wayOut(position: number, toward: DOMRect): THREE.Vector3 {
    const a = this.anchor(position);
    if (!a) return new THREE.Vector3();
    const d = this.towards(toward), dist = this.clearOf(a, d);
    return this.offsetAt(position, d.x * dist, d.y * dist);
  }

  // where a crossing part comes into this canvas from, coming from the standing house's side
  private wayIn(position: number, from: DOMRect): THREE.Vector3 {
    const b = this.anchor(position);
    if (!b) return new THREE.Vector3();
    const t = this.towards(from), dist = this.clearOf(b, t);
    return this.offsetAt(position, t.x * dist, t.y * dist);
  }

  // the gaps: materials gone, edges a faint outline
  private applyGhost(): void {
    this.body.groups.forEach((g, i) => {
      if (!this.ghosted.has(i)) return;
      for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
      }
      for (const l of (g.userData.edges as THREE.LineSegments[]) ?? []) (l.material as THREE.LineBasicMaterial).opacity = 0.35;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
    });
  }

  private fade(g: THREE.Group, a: number): void {
    for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) {
      m.transparent = a < 0.999;
      m.opacity = a;
      m.depthWrite = a >= 0.999;
    }
    for (const l of (g.userData.edges as THREE.LineSegments[]) ?? []) (l.material as THREE.LineBasicMaterial).opacity = EDGE[this.look] * a;
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = a > 0.5 && o.userData.role !== "opening"; });
  }

  private edges(g: THREE.Group, color: number, opacity: number): void {
    for (const l of (g.userData.edges as THREE.LineSegments[]) ?? []) {
      const m = l.material as THREE.LineBasicMaterial;
      m.color.set(color);
      m.opacity = opacity;
    }
  }

  // selection is ink, never red: the chosen territory drawn firmly, the rest receding toward the field (theme.ts partTone)
  private paint(): void {
    const field = new THREE.Color(FIELD), focus = this.selected ?? this.hovered;
    this.body.groups.forEach((g, i) => {
      const t = partTone(this.look, { selected: i === this.selected, hovered: i === this.hovered && i !== this.selected, traced: i === this.traced, other: focus !== null && i !== focus });
      const lift = new THREE.Color(t.edgeColour);
      for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) m.color.copy(m.userData.base as THREE.Color).lerp(field, t.recede).lerp(lift, m.userData.role === "opening" ? 0 : t.lift);
      this.edges(g, t.edgeColour, t.edge);
    });
    if (this.stage) {
      // a territory arriving is solid as it comes in, never a gap
      const arriving = new Set(this.body.arrivals.map((a) => a.position));
      this.ghosted = new Set(this.stage.gaps.flatMap((gap, i) => (gap && !arriving.has(i) ? [i] : [])));
      this.body.groups.forEach((g, i) => { if (!this.ghosted.has(i) && !arriving.has(i)) this.fade(g, 1); });
      this.applyGhost();
    }
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.queued = false;
    const now = performance.now(), wasAnimating = this.body.animating, gapsBefore = this.stage?.gaps.join();
    const frames = this.stage ? (this.stage.step(now, this.reduced), []) : this.body.step(now, this.reduced);
    for (const { exchange: x, frame: f } of frames) {
      x.outgoing.position.copy(x.away).multiplyScalar(f.lift).addScaledVector(x.across, f.travel);
      x.trace.position.copy(x.away).multiplyScalar(f.lift);
      this.fade(x.outgoing, f.outgoing);
      x.outgoing.visible = f.outgoing > 0;
      const tm = x.trace.userData.material as THREE.LineBasicMaterial;
      tm.opacity = 0.9 * f.trace;
      tm.color.set(RED).lerp(new THREE.Color(INK), 1 - f.traceRed);
      x.incoming.position.y = x.inY * f.drop;
      this.fade(x.incoming, f.incoming);
      if (f.incomingRed > 0) this.edges(x.incoming, RED, Math.max(0.2, 0.9 * f.incomingRed));
    }
    for (const fl of this.body.follows) {
      const k = Math.min(1, (now - fl.start) / 450);
      this.fade(fl.outgoing, 1 - k);
      this.fade(fl.incoming, k);
    }
    // a crossing part arriving in the kept house, from the standing house's side, red while it sets down
    for (const { arrival: a, frame: f } of this.body.arriving(now, this.reduced)) {
      a.group.position.copy(a.from).multiplyScalar(f.travel);
      this.fade(a.group, f.opacity);
      if (f.red > 0) this.edges(a.group, RED, Math.max(EDGE[this.look], 0.9 * f.red));
    }
    // a territory whose exchange has just ended stands at full strength, in the present's ink (a gap stays a gap)
    if (wasAnimating) this.body.groups.forEach((g, i) => { if (!this.ghosted.has(i) && !this.body.exchanges.some((x) => x.incoming === g) && !this.body.follows.some((f) => f.incoming === g) && !this.body.arrivals.some((a) => a.group === g)) this.fade(g, 1); });
    // the end of a motion, or of a later ship's beat (the next ship takes its place)
    if ((wasAnimating && !this.body.animating) || (this.stage && this.stage.gaps.join() !== gapsBefore)) this.paint();
    this.renderer.render(this.scene, this.camera);
    if (this.body.animating || this.stage?.animating) this.requestFrame();
  }
}
