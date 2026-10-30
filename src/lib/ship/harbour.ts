// The harbour on the page (docs/decisions/0005-the-ship.md): one renderer,
// one canvas, the scene (scene.ts), the live ship on the water and the kept
// ship on its slipway (each a LiveBody over buildShip), the next ship's
// planks on the pallet, and the plank that flies between them once the server
// has accepted a change. It draws what it is told and decides nothing: which
// words stand, what the kept ship is and what moment a change brought all come
// from the page (index.astro), which reads them from the server.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { KeptShip, Moment } from "../kept-moment";
import { buildShip } from "./build";
import { KeptStage } from "./kept-stage";
import { LiveBody } from "./live-body";
import { arrivalAt, carryAt, carryEnd, landsAt, newPartRed, plankColour, type Kind } from "./motion";
import { Crew, type Figure } from "./crew";
import { buildHarbour, swell } from "./scene";
import { carriedScale, carryPath, catchPoint, flightTarget, followView, home, PALLET_PLANK, KEPT_POSE, LIVE_POSE, ORBIT, palletSlot, place, posed, tossAt, type Layout } from "./stage";

const RED = 0xc3331c;
const GLOW = 0x6b3a08;
const DRIFT = new THREE.Color(0xcbb894);

// an old plank: bleached, like driftwood (the kept ship, the pallet, an earlier ship)
function weather(g: THREE.Group): void {
  for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) {
    if (m.userData.weathered) continue;
    m.color.lerp(DRIFT, 0.5);
    m.userData.weathered = true;
  }
}
// every material a group's meshes use keeps its own colour to come back to
function based(g: THREE.Group): void {
  for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) m.userData.base ??= m.color.clone();
}

// A plank on its way: the old part, taken off the live ship whole, tossed to the quay's edge, caught by a
// shipwright and carried to where it's kept (motion.ts carryAt, stage.ts tossAt and carryPath). It's set down at
// `lands` (its waiting word lands then), and released at `end`, when the kept part it becomes has faded in under it.
type Flight = { start: number; lands: number; end: number; group: THREE.Group; from: THREE.Vector3; caught: THREE.Vector3; to: THREE.Vector3; s1: number; carried: number; spin: number; landed: boolean; yours: boolean; figure: Figure; stood: THREE.Vector3; done(): void };

export type Scene = "now" | "earlier" | "kept";

export class HarbourView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private harbour = buildHarbour();
  private camera = new THREE.PerspectiveCamera();
  private controls: OrbitControls | null = null;
  private live: LiveBody | null = null;
  private stage: KeptStage | null = null;
  private lone: LiveBody | null = null;
  private pallet = new THREE.Group();
  private crew = new Crew();
  private flights: Flight[] = [];
  private lit: number | null = null;
  private traced: number | null = null;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private queued = false;
  private observer: ResizeObserver;
  private clock = performance.now();
  private moved = false;
  private following = false;
  private next: (string | null)[] = Array(10).fill(null);
  // a waiting plank still in flight to the pallet isn't drawn there yet
  private landing = new Set<number>();
  onMoved: (moved: boolean) => void = () => {};

  constructor(private host: HTMLElement, private scene: Scene, private layout: () => Layout) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    host.append(this.canvas);
    const s = this.harbour.scene;
    if (scene === "now") {
      this.live = new LiveBody("live", (g) => this.drawing(g), buildShip, (g) => based(g));
      posed(this.live.root, LIVE_POSE);
      s.add(this.live.root);
      this.stage = new KeptStage((g) => this.drawing(g), (g) => { weather(g); based(g); });
      posed(this.stage.body.root, KEPT_POSE);
      s.add(this.stage.body.root, this.pallet, this.crew.root);
    } else {
      // an earlier form's ship on the water, or an earlier kept ship on its slipway: alone, never live
      this.lone = new LiveBody(scene === "kept" ? "kept" : "earlier", (g) => this.drawing(g), buildShip, (g) => { if (scene === "kept") weather(g); based(g); });
      posed(this.lone.root, scene === "kept" ? KEPT_POSE : LIVE_POSE);
      s.add(this.lone.root);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.loop();
  }

  // ---- what the page tells it ----

  // the live ship's whole sentence, at once
  show(words: readonly string[]): void {
    (this.live ?? this.lone)?.show(words);
    this.paint();
  }

  // One position's word changed on the live ship. Its old plank leaves the ship, whole, is tossed to the quay's
  // edge, and a shipwright (yours, for your own change) carries it to where it's kept (`to`: the kept ship's gap,
  // or a slot on the pallet), then `landed` runs. A carry still under way is finished at once first: its plank set
  // down, its word landed. With reduced motion nothing is tossed or carried: the parts swap, outlined in red for a
  // moment.
  change(position: number, words: readonly string[], kind: Kind, to: THREE.Vector3 | null, landed: () => void = () => {}, yours = false, own = false): void {
    if (!this.live) return;
    this.finishCarries();
    const old = this.live.groups[position];
    // a copy of the old plank to carry: the body's own exchange keeps the old group to release when it ends
    const plank = old && to && !this.reduced ? this.copy(old) : null;
    this.live.change(position, words, kind, performance.now());
    if (plank) {
      this.harbour.scene.add(plank.group);
      this.host.setAttribute("data-flying", String(position + 1));
      this.flights.push({ start: performance.now(), lands: landsAt(false), end: carryEnd(false), group: plank.group, from: plank.from, caught: catchPoint(position), to: to!, s1: plank.s1, carried: plank.carried, spin: (position % 2 ? 1 : -1) * 0.5, landed: false, yours, ...this.carrier(own), done: landed });
    } else landed();
    this.paint();
  }

  // the shipwright who carries a plank, and where it stood when it was called
  private carrier(own: boolean): { figure: Figure; stood: THREE.Vector3 } {
    const figure = this.crew.take(own);
    return { figure, stood: figure.root.position.clone() };
  }

  // the shipwrights: one per open view (the stream's anonymous total), at most CREW_MAX drawn
  crewSet(total: number): void {
    // drawn only: the total is never written on the page (spec/present-only.test.ts)
    this.crew.set(total);
    this.requestFrame();
  }
  // whether one of them is this visitor's (marked only on this page)
  crewMine(on: boolean): void { this.crew.mine(on); this.requestFrame(); }

  // the kept ship as a fresh load shows it, its pallet included
  keptShow(kept: KeptShip): void {
    this.stage?.show(kept);
    this.next = [...kept.next];
    this.landing.clear();
    this.drawPallet();
    this.paint();
  }

  // a kept ship from a change event, with its moment: a crossing plank is set down in its gap once it has
  // landed; a waiting one lands on the pallet
  keptApply(kept: KeptShip, moment: Moment | null): void {
    if (!this.stage) return;
    this.next = [...kept.next];
    if (moment?.kind === "wait" && !this.reduced) this.landing.add(moment.position);
    this.stage.apply(kept, moment, performance.now(), new THREE.Vector3());
    this.drawPallet();
    this.paint();
  }

  // a plank for the next ship has landed: it's drawn on the pallet from now on
  landed(position: number): void {
    if (this.landing.delete(position)) this.drawPallet();
    this.paint();
  }

  // where a plank flies for this moment
  target(moment: Moment, kept: KeptShip): THREE.Vector3 { return flightTarget(moment, kept); }

  // a part lit on both ships (pointed at, chosen, or being rebuilt)
  light(position: number | null): void { this.lit = position; this.paint(); }
  // this visitor's own kept plank, a little firmer
  trace(position: number | null): void { this.traced = position; this.paint(); }

  // where a part stands on the page (client pixels), on the live ship or the kept one: its top
  anchor(position: number, ship: "live" | "kept"): { x: number; y: number } | null {
    const body = ship === "live" ? this.live : this.stage?.body;
    const g = body?.groups[position];
    if (!g) return null;
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g, true);
    if (b.isEmpty()) return null;
    const p = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2).project(this.camera);
    if (p.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  // the part under a point of the canvas, on either ship
  pick(clientX: number, clientY: number): number | null {
    const r = this.canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const roots = [this.live?.root, this.stage?.body.root].filter((x): x is THREE.Group => !!x);
    let o: THREE.Object3D | null = ray.intersectObjects(roots, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible)?.object ?? null;
    while (o && o.userData.position === undefined) o = o.parent;
    return o ? (o.userData.position as number) : null;
  }

  // On a desktop a drag orbits the fixed view, within limits; `home` brings it back.
  orbit(on: boolean): void {
    if (on && !this.controls) {
      const c = (this.controls = new OrbitControls(this.camera, this.canvas));
      c.enablePan = false;
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.minDistance = ORBIT.minDistance;
      c.maxDistance = ORBIT.maxDistance;
      c.minPolarAngle = ORBIT.minPolar;
      c.maxPolarAngle = ORBIT.maxPolar;
      c.enableZoom = true;
      c.zoomToCursor = false;
      c.target.copy(this.homeTarget());
      c.addEventListener("change", () => this.requestFrame());
      c.addEventListener("start", () => { if (!this.moved) { this.moved = true; this.onMoved(true); } });
      c.update();
    } else if (!on && this.controls) {
      this.controls.dispose();
      this.controls = null;
      this.home();
    }
  }

  home(): void {
    this.resize();
    if (this.controls) { this.controls.target.copy(this.homeTarget()); this.controls.update(); }
    if (this.moved) { this.moved = false; this.onMoved(false); }
    this.requestFrame();
  }

  destroy(): void {
    this.observer.disconnect();
    this.controls?.dispose();
    for (const f of this.flights) this.release(f.group);
    this.live?.dispose();
    this.stage?.body.dispose();
    this.lone?.dispose();
    this.clearPallet();
    this.crew.dispose();
    this.harbour.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---------------------------------------------------------------------------

  // every carry still under way, set down at once: its word landed, its figure free (the kept ship has already
  // finished setting its part down: keptApply, told first, finishes whatever it had under way)
  private finishCarries(): void {
    for (const fl of [...this.flights]) this.endFlight(fl);
  }

  private endFlight(fl: Flight): void {
    if (!fl.landed) { fl.landed = true; fl.done(); }
    this.flights.splice(this.flights.indexOf(fl), 1);
    this.release(fl.group);
    this.crew.give(fl.figure);
    if (!this.flights.length) this.host.removeAttribute("data-flying");
  }

  private homeTarget(): THREE.Vector3 { return new THREE.Vector3(...home(this.layout()).target); }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    if (!this.moved) place(this.camera, this.layout(), w / h);
    else { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.requestFrame();
  }

  // a ship's part as a drawing: its edges, in red, for an exchange
  private drawing(g: THREE.Group): THREE.Group {
    const out = new THREE.Group(), m = new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false });
    g.updateMatrixWorld(true);
    const inv = (g.parent ? g.parent.matrixWorld.clone().invert() : new THREE.Matrix4());
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), m);
      l.applyMatrix4(inv.clone().multiply(mesh.matrixWorld));
      out.add(l);
    });
    out.userData.material = m;
    return out;
  }

  // a copy of a standing part to fly, in world space; it owns its geometry and materials
  private copy(g: THREE.Group): { group: THREE.Group; from: THREE.Vector3; s1: number; carried: number } {
    g.updateMatrixWorld(true);
    const out = new THREE.Group(), mats = new Map<THREE.Material, THREE.Material>();
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!mats.has(src)) { const c = src.clone(); c.emissive?.setHex(0); c.userData.flightBase = src.color.clone(); mats.set(src, c); }
      const m = new THREE.Mesh(mesh.geometry.clone(), mats.get(src)!);
      m.applyMatrix4(mesh.matrixWorld);
      m.castShadow = true;
      out.add(m);
    });
    // fly about its own centre
    const c = new THREE.Box3().setFromObject(out).getCenter(new THREE.Vector3());
    for (const k of out.children) k.position.sub(c);
    const size = new THREE.Box3().setFromObject(out).getSize(new THREE.Vector3());
    out.position.copy(c);
    out.userData.materials = [...mats.values()];
    // toward the pallet it shrinks to exactly the pallet plank it becomes
    // carried, it's about half its size and never too small to see (stage.ts carriedScale)
    const largest = Math.max(size.x, size.y, size.z, 0.01);
    return { group: out, from: c.clone(), s1: Math.min(1, PALLET_PLANK / largest), carried: carriedScale(largest) };
  }

  private release(g: THREE.Group): void {
    g.removeFromParent();
    g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of (g.userData.materials as THREE.Material[]) ?? []) m.dispose();
  }

  // the next ship's planks, small, on the pallet, in place order
  private drawPallet(): void {
    this.clearPallet();
    if (!this.stage) return;
    this.next.forEach((w, i) => {
      if (w === null || this.landing.has(i)) return;
      const built = buildShip(Array.from({ length: 10 }, (_, k) => (k === i ? w : "")));
      const g = built.groups[i];
      g.removeFromParent();
      g.userData.materials = (g.userData.materials as THREE.Material[]) ?? [];
      weather(g);
      for (const k of built.groups) if (k !== g) k.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const wrap = new THREE.Group();
      g.position.sub(c);
      wrap.add(g);
      wrap.scale.setScalar(PALLET_PLANK / Math.max(size.x, size.y, size.z, 0.01));
      wrap.position.copy(palletSlot(i, this.next));
      wrap.userData.position = i;
      wrap.userData.materials = g.userData.materials;
      this.pallet.add(wrap);
    });
    this.requestFrame();
  }

  private clearPallet(): void {
    for (const w of [...this.pallet.children]) this.release(w as THREE.Group);
  }

  // what's lit: the part pointed at, chosen or rebuilt, on both ships; the rest at rest
  private paint(): void {
    const tone = (body: LiveBody | null, kept: boolean) =>
      body?.groups.forEach((g, i) => {
        const on = i === this.lit;
        for (const m of (g.userData.materials as THREE.MeshStandardMaterial[]) ?? []) m.emissive?.setHex(on ? GLOW : i === this.traced && kept ? 0x2a1a06 : 0x000000);
      });
    tone(this.live, false);
    tone(this.stage?.body ?? null, true);
    tone(this.lone, this.scene === "kept");
    this.ghost();
    this.requestFrame();
  }

  // the kept ship's gaps: a part still standing in the harbour, drawn only as a faint outline; a plank on its
  // way there stays an outline until it arrives
  private ghost(now = performance.now()): void {
    if (!this.stage) return;
    const coming = new Map(this.stage.body.arrivals.map((a) => [a.position, a.start]));
    this.stage.body.groups.forEach((g, i) => {
      const start = coming.get(i);
      const gap = start !== undefined ? arrivalAt(now - start, this.reduced).opacity === 0 : this.stage!.gaps[i];
      if (gap && !g.userData.outlineLines) {
        const m = new THREE.LineBasicMaterial({ color: 0xe9f3fb, transparent: true, opacity: 0.55, depthWrite: false });
        const meshes: THREE.Mesh[] = [];
        g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
        // beside each solid, in its own frame; added after the walk, so the walk never meets them
        g.userData.outlineLines = meshes.map((mesh) => {
          const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 35), m);
          l.position.copy(mesh.position); l.quaternion.copy(mesh.quaternion); l.scale.copy(mesh.scale);
          (mesh.parent ?? g).add(l);
          return l;
        });
        (g.userData.materials as THREE.Material[]).push(m);
      }
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.visible = !gap; });
      for (const l of (g.userData.outlineLines as THREE.LineSegments[]) ?? []) l.visible = gap;
    });
  }

  private requestFrame(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => this.frame());
  }

  // the sea moves and the live ship rides it, unless motion is reduced; a frame is drawn only when needed
  private loop(): void {
    if (!this.reduced && this.scene !== "kept") {
      const tick = () => { if (!this.canvas.isConnected) return; this.requestFrame(); setTimeout(tick, 1000 / 30); };
      setTimeout(tick, 1000 / 30);
    }
  }

  private frame(): void {
    this.queued = false;
    const now = performance.now(), t = (now - this.clock) / 1000;
    if (!this.reduced) {
      this.harbour.waves(t);
      const r = this.live?.root ?? (this.scene === "earlier" ? this.lone?.root : null);
      if (r) {
        r.position.y = LIVE_POSE.position[1] + swell(LIVE_POSE.position[0], LIVE_POSE.position[2], t) * 0.9 - 0.02;
        r.rotation.x = 0.025 * Math.sin(t * 1.1);
        r.rotation.z = 0.018 * Math.sin(t * 0.8 + 1);
      }
    }
    const animating = (this.live?.animating ?? false) || (this.stage?.animating ?? false) || this.flights.length > 0;
    // the live ship's exchange: the new part set down red, then neutral; the old one's drawing fades
    if (this.live) for (const { exchange: x, frame: f } of this.live.step(now, this.reduced)) {
      x.outgoing.visible = false; // the plank itself flies (a copy); with reduced motion it's simply gone
      // the old part's drawing isn't shown: the plank itself flies, in its own colours
      (x.trace.userData.material as THREE.LineBasicMaterial).opacity = 0;
      x.incoming.position.y = 1.1 * f.drop;
      // the new part, red for about a second as it's set down (motion.ts), then as the rest
      const red = newPartRed(now - x.start, this.reduced);
      for (const m of (x.incoming.userData.materials as THREE.MeshStandardMaterial[]) ?? []) {
        if (red > 0.02) m.emissive?.setHex(RED).multiplyScalar(red);
        else m.emissive?.setHex(x.position === this.lit ? GLOW : 0);
      }
    }
    if (this.stage) {
      const gaps = this.stage.gaps.join();
      this.stage.step(now, this.reduced);
      // the kept part arriving is the old plank itself: never red
      if (gaps !== this.stage.gaps.join() || this.stage.body.arrivals.length) this.ghost(now);
    }
    for (const fl of [...this.flights]) {
      const t = now - fl.start, c = carryAt(t), toPallet = fl.to.y < 1.8;
      // tossed out of the live ship to the quay's edge, caught, then carried: plank and shipwright together
      const carry = carryPath(fl.caught, fl.to, c.carry), waiting = carryPath(fl.caught, fl.to, 0);
      const at = c.phase === "toss" ? tossAt(fl.from, fl.caught, c.toss) : c.phase === "catch" ? fl.caught.clone().lerp(waiting.plank, (t - 700) / 200) : carry.plank;
      fl.group.position.copy(at);
      // caught, it's held at its carried size above the head; set in place it grows to what it becomes there (its own size on the
      // kept ship, the pallet's plank on the rack); tossed, it keeps the size it stood
      const kept = toPallet ? fl.s1 : 1, set = c.phase === "set" || c.phase === "done" ? c.set : c.carry > 0.82 ? (c.carry - 0.82) / 0.18 : 0;
      const gather = c.phase === "toss" ? 0 : c.phase === "catch" ? (t - 700) / 200 : 1;
      fl.group.scale.setScalar(set > 0 ? fl.carried + (kept - fl.carried) * set : 1 + (fl.carried - 1) * gather);
      fl.group.rotation.y = fl.spin * Math.sin(Math.PI * Math.min(1, t / fl.end));
      // the shipwright walks to the catch as the plank is tossed, takes it, then walks it over
      const toss = c.phase === "toss" ? Math.min(1, c.toss * 1.25) : 1;
      const fig = c.phase === "toss" ? fl.stood.clone().lerp(waiting.figure, toss * toss * (3 - 2 * toss)) : c.phase === "catch" ? waiting.figure : carry.figure;
      const ahead = c.phase === "toss" ? waiting.figure.clone().sub(fl.stood) : carryPath(fl.caught, fl.to, Math.min(1, c.carry + 0.02)).figure.sub(carry.figure);
      const facing = ahead.lengthSq() > 1e-6 ? Math.atan2(ahead.x, ahead.z) : -Math.PI / 2;
      const walking = (c.phase === "toss" && toss < 1) || (c.phase === "carry" && c.carry < 0.82);
      this.crew.pose(fl.figure, fig, facing, walking ? t / 90 : 0, c.phase !== "toss" || c.toss > 0.75);
      // the old part as it stood, bleaching to driftwood as it's carried in; yours glows (on your page only)
      for (const m of (fl.group.userData.materials as THREE.MeshStandardMaterial[]) ?? []) {
        m.color.copy(plankColour(m.userData.flightBase as THREE.Color, 0.6 + 0.4 * c.bleach));
        m.emissive?.setHex(fl.yours ? GLOW : 0);
      }
      // set down: the waiting word, the pallet's plank
      if (t >= fl.lands && !fl.landed) { fl.landed = true; fl.done(); }
      if (t >= fl.end) this.endFlight(fl);
    }
    // on a phone the camera follows the plank there and back (a desktop keeps its view, or the visitor's orbit)
    const followed = this.layout() === "phone" && !this.reduced ? this.flights[0] : undefined;
    if (followed) {
      const w = this.host.clientWidth, h = this.host.clientHeight;
      const v = followView("phone", followed.from, followed.to, Math.min(1, (now - followed.start) / followed.end));
      place(this.camera, "phone", w / h);
      this.camera.position.set(...v.position);
      this.camera.lookAt(...v.target);
      this.camera.updateMatrixWorld(true);
      this.following = true;
    } else if (this.following) { this.following = false; this.resize(); }
    // the end of a motion: everything back to neutral
    if (animating && !((this.live?.animating ?? false) || (this.stage?.animating ?? false) || this.flights.length)) this.paint();
    this.controls?.update();
    this.renderer.render(this.harbour.scene, this.camera);
    if (animating) this.requestFrame();
  }
}

