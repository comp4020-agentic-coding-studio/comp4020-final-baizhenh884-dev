// The house on the page: one renderer and the one default view over a
// LiveBody (live-body.ts), which alone decides which group stands at each
// position. This file draws: it renders only when something changes or moves,
// paints selection, picks territories, and applies each exchange's frame
// (motion.ts). It never decides anything: it shows the words it's given.

import * as THREE from "three";
import { place } from "./camera";
import { LiveBody } from "./live-body";
import type { Kind } from "./motion";
import { EDGE, EDGE_COLOUR, FIELD, INK, lights, type Look, RED } from "./theme";

export class HouseView {
  readonly canvas: HTMLCanvasElement;
  readonly rebuildMs: number[] = [];
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();
  private body: LiveBody;
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
    this.body = new LiveBody(look, (g) => this.drawing(g));
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

  // one position's word changed: the body is rebuilt and that territory exchanged
  change(position: number, words: readonly string[], kind: Kind): void {
    const t0 = performance.now();
    this.body.change(position, words, kind, performance.now());
    this.rebuildMs.push(performance.now() - t0);
    this.paint();
  }

  select(position: number | null): void { this.selected = position; this.paint(); }
  hover(position: number | null): void { this.hovered = position; this.paint(); }
  // the territory this visitor's standing word made: drawn a little firmer than the rest, nothing more
  trace(position: number | null): void { this.traced = position; this.paint(); }

  // The kept ship's gaps (docs/decisions/0003-settle-and-kept-ships.md): a
  // waiting territory reads as a faint outline, never a solid, from the very
  // first load. Static only — this view is read-only and never selected or
  // hovered, so it never needs paint()'s own selection logic.
  ghost(positions: readonly number[]): void {
    const gaps = new Set(positions);
    this.body.groups.forEach((g, i) => {
      if (!gaps.has(i)) return;
      for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
      }
      for (const l of (g.userData.edges as THREE.LineSegments[]) ?? []) (l.material as THREE.LineBasicMaterial).opacity = 0.35;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
    });
    this.requestFrame();
  }

  // where a territory sits on the page (client pixels): the centre of what is standing there now
  anchor(position: number): { x: number; y: number } | null {
    const g = this.body.groups[position];
    if (!g) return null;
    g.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(g, true).getCenter(new THREE.Vector3()).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
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

  // selection is ink, never red: the chosen territory drawn firmly, the rest receding toward the field
  private paint(): void {
    const field = new THREE.Color(FIELD), focus = this.selected ?? this.hovered;
    this.body.groups.forEach((g, i) => {
      const other = focus !== null && i !== focus;
      for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) m.color.copy(m.userData.base as THREE.Color).lerp(field, other ? 0.62 : 0);
      const base = EDGE[this.look] + (i === this.traced ? 0.12 : 0);
      this.edges(g, EDGE_COLOUR[this.look], i === this.selected ? 0.9 : i === this.hovered ? 0.6 : other ? 0.05 : base);
    });
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.queued = false;
    const now = performance.now(), wasAnimating = this.body.animating;
    for (const { exchange: x, frame: f } of this.body.step(now, this.reduced)) {
      x.outgoing.position.copy(x.away).multiplyScalar(f.lift);
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
    // a territory whose exchange has just ended stands at full strength, in the present's ink
    if (wasAnimating) this.body.groups.forEach((g) => { if (!this.body.exchanges.some((x) => x.incoming === g) && !this.body.follows.some((f) => f.incoming === g)) this.fade(g, 1); });
    if (wasAnimating && !this.body.animating) this.paint();
    this.renderer.render(this.scene, this.camera);
    if (this.body.animating) this.requestFrame();
  }
}
