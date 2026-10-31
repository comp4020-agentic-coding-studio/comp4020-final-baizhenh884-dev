import { describe, expect, inject, it } from "vitest";
import * as THREE from "three";
import { BEAT_2_MS, BEATS, REBUILDS, STORY_KEY, STORY_MOVE_MS } from "../src/lib/story";
import { RED_MS } from "../src/lib/ship/motion";
import { PARTS } from "../src/lib/ship/rules";
import { home, KEPT_POSE, LIVE_POSE, storyBetween, storyView } from "../src/lib/ship/stage";
import { liveIn } from "./chrome";

// The opening story (docs/decisions/0007-the-opening-story.md): on GET /, a first visit in this browser plays
// five beats over the harbour as it stands, camera moves and one or two fixed lines each. Remembered in
// localStorage only; if storage fails, once per load, never blocking the page. Skip always visible, Escape
// skips; click, tap, Enter, Space or → advance, ← goes back; focus leaving it ends it. Begin or Skip puts focus
// on the sentence strip. "The story" in GET /'s masthead replays it, nowhere else. Reduced motion: no camera
// move. No WebGL: the same five lines. No JavaScript: no story, no button. A labelled, non-modal dialog.
//
// Every other check's browser is a returning visitor (spec/chrome.ts marks the story seen); these open the page
// as a first visit (`firstVisit`), the only checks that do.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const changesTheSentence = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn, timeout);

const DESKTOP: [number, number] = [1440, 900];
const PHONE: [number, number] = [390, 844];

describe("the story's beats", () => {
  it("are the five fixed lines, in order, with Plutarch cited on the third", () => {
    expect(BEATS.map((b) => b.text)).toEqual([
      "Athens kept the ship of Theseus in its harbour for centuries.",
      "As its planks rotted, they were replaced, one by one.",
      "Until none of the first planks were left. Philosophers argued over it: was it still the same ship?",
      "Centuries later, Hobbes asked: what if someone kept every old plank, and built them into a ship? Which one is Theseus’s?",
      "Here, the ship is a sentence. Each word is a plank. Change one.",
    ]);
    expect(BEATS.map((b) => b.source ?? null)).toEqual([null, null, "Plutarch, Life of Theseus 23", null, null]);
  });

  it("go wide, in on the live ship (its parts rebuilt one by one), hold, across to the ship of old planks, and wide again with the sentence lit", () => {
    expect(BEATS.map((b) => b.shot)).toEqual(["wide", "live", "live", "kept", "wide"]);
    expect(BEATS.map((b) => !!b.flash)).toEqual([false, true, false, false, false]);
    expect(BEATS.map((b) => !!b.lit)).toEqual([false, false, false, false, true]);
  });

  it("rebuild three small parts in beat 2, one at a time: shields, oars, stern, after the camera arrives, within the beat", () => {
    expect(REBUILDS.map((r) => PARTS[r.position])).toEqual(["shields", "oars", "stern"]);
    expect(REBUILDS[0].at, "a part is rebuilt before the camera has arrived").toBeGreaterThanOrEqual(STORY_MOVE_MS);
    // each red only while it's rebuilt, and gone before the next begins: never two at once
    for (let i = 1; i < REBUILDS.length; i++) expect(REBUILDS[i].at - REBUILDS[i - 1].at, `part ${i + 1} begins while part ${i} is still red`).toBeGreaterThanOrEqual(RED_MS);
    expect(REBUILDS.at(-1)!.at + RED_MS, "the last part is still red after the beat's time").toBeLessThanOrEqual(BEAT_2_MS);
  });
});

describe("the story's camera", () => {
  const dist = (a: readonly number[], b: readonly number[]) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
  for (const layout of ["desktop", "phone"] as const) {
    it(`starts and ends on the harbour's fixed view, and goes in on each ship (${layout})`, () => {
      const h = home(layout);
      expect(storyView(layout, "wide").position).toEqual(h.position);
      expect(storyView(layout, "wide").target).toEqual(h.target);
      for (const [shot, pose] of [["live", LIVE_POSE], ["kept", KEPT_POSE]] as const) {
        const v = storyView(layout, shot);
        // it looks at that ship, from nearer than the fixed view does
        expect(Math.hypot(v.target[0] - pose.position[0], v.target[2] - pose.position[2]), `the ${shot} shot doesn't look at its ship`).toBeLessThan(2.5);
        expect(dist(v.position, pose.position), `the ${shot} shot isn't nearer its ship`).toBeLessThan(0.65 * dist(h.position, pose.position));
      }
    });
  }

  it("moves between shots smoothly, from one to the other", () => {
    const a = storyView("desktop", "wide"), b = storyView("desktop", "live");
    expect(dist(storyBetween(a, b, 0).position, a.position)).toBeLessThan(1e-9);
    expect(dist(storyBetween(a, b, 1).position, b.position)).toBeLessThan(1e-9);
    const steps = Array.from({ length: 11 }, (_, i) => dist(storyBetween(a, b, i / 10).position, b.position));
    for (let i = 1; i < steps.length; i++) expect(steps[i], "the camera turns back on its way").toBeLessThanOrEqual(steps[i - 1] + 1e-9);
  });
});

// in-page helpers: the story, whether an element is shown, waiting for a condition, the beat's line and source,
// a button of the story's by its words
const IN_PAGE = `
  const story = () => document.querySelector('#story');
  const shown = (el) => !!el && !el.closest('[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const wait = async (f, ms = 10000) => { for (let t = 0; t < ms && !f(); t += 50) await new Promise((r) => setTimeout(r, 50)); return f(); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const line = () => story().querySelector('[aria-live] p')?.textContent.trim() ?? null;
  const source = () => { const c = story().querySelector('[aria-live] cite'); return c && shown(c) ? c.textContent.trim() : null; };
  const button = (words) => [...story().querySelectorAll('button')].find((b) => b.textContent.trim() === words && shown(b)) ?? null;
  const key = (k, at = document.activeElement || document.body) => at.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
`;

describe("the story on a first visit", () => {
  it("is absent for a returning visitor: the checks' own browser has seen it", async () => {
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
      await sleep(1500);
      return { open: shown(story()), replay: shown(document.querySelector('#story-open')) };
    })()`, DESKTOP)) as { open: boolean; replay: boolean };
    expect(m.open, "the story opened for a visitor who has seen it").toBe(false);
    expect(m.replay, "the masthead has no way to replay the story").toBe(true);
  }, 60_000);

  for (const [name, size] of [["1440×900", DESKTOP], ["390×844", PHONE]] as const) {
    it(`plays its five beats in order, Skip always shown, then Begin puts focus on the sentence (${name})`, async () => {
      const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
        const opened = await wait(() => shown(story()));
        const s = story();
        const out = { opened, role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), named: (document.getElementById(s.getAttribute('aria-labelledby') || '')?.textContent || '').trim(),
          remembered: (() => { try { return localStorage.getItem(${JSON.stringify(STORY_KEY)}); } catch { return 'unreadable'; } })(), beats: [] };
        for (let i = 0; i < 5; i++) {
          // a phone scrolls the harbour (or, at the end, the sentence) into view: measured once it has
          await sleep(900);
          const card = s;
          const harbour = document.querySelector('#harbour'), strip = document.querySelector('#sentence');
          const cr = card.getBoundingClientRect(), hr = harbour.getBoundingClientRect(), sr = strip.getBoundingClientRect();
          out.beats.push({ line: line(), source: source(), skip: !!button('Skip') && inView(button('Skip')), next: button('Next') ? 'Next' : button('Begin') ? 'Begin' : null,
            harbourAboveCard: Math.max(0, Math.min(hr.bottom, cr.top, innerHeight) - Math.max(hr.top, 0)) / hr.height,
            stripInView: sr.top >= -1 && sr.top < innerHeight && sr.bottom > 0,
            cardOverStrip: !(cr.right <= sr.left || cr.left >= sr.right || cr.bottom <= sr.top || cr.top >= sr.bottom) });
          (button('Next') || button('Begin')).click();
        }
        await sleep(1200);
        out.closed = !shown(story());
        out.focus = document.activeElement === document.querySelector('#sentence');
        const sr = document.querySelector('#sentence').getBoundingClientRect();
        out.sentenceInView = sr.top >= -1 && sr.bottom <= innerHeight + 1;
        out.wordField = document.activeElement?.matches?.('input');
        return out;
      })()`, size, { firstVisit: true })) as any;
      expect(m.opened, "a first visit doesn't open the story").toBe(true);
      expect(m.role, "the story isn't a dialog").toBe("dialog");
      expect(m.modal, "the story is modal").toBe("false");
      expect(m.named, "the story isn't named").not.toBe("");
      expect(m.remembered, "the story isn't remembered once it opens").not.toBeNull();
      expect(m.beats.map((b: any) => b.line), "the beats aren't the five lines in order").toEqual(BEATS.map((b) => b.text));
      expect(m.beats.map((b: any) => b.source)).toEqual(BEATS.map((b) => b.source ?? null));
      for (const [i, b] of m.beats.entries()) expect(b.skip, `Skip isn't shown on beat ${i + 1}`).toBe(true);
      expect(m.beats.map((b: any) => b.next), "the last beat isn't Begin").toEqual(["Next", "Next", "Next", "Next", "Begin"]);
      // the fifth beat lights the sentence: it's in view, and the story doesn't cover it
      expect(m.beats[4].stripInView, "the sentence isn't in view on the last beat").toBe(true);
      expect(m.beats[4].cardOverStrip, "the story covers the sentence on the last beat").toBe(false);
      // beats 1–4 are over the harbour: on a phone it's scrolled into view, above the story's card
      if (size === PHONE) for (const i of [0, 1, 2, 3]) expect(m.beats[i].harbourAboveCard, `the harbour isn't in view above the story on beat ${i + 1}`).toBeGreaterThan(0.6);
      expect(m.closed, "Begin doesn't close the story").toBe(true);
      expect(m.focus, "Begin doesn't put focus on the sentence strip").toBe(true);
      expect(m.wordField, "Begin takes a word in hand").toBe(false);
      expect(m.sentenceInView, "the sentence isn't in view after Begin").toBe(true);
    }, 90_000);
  }

  it("skips with Skip or Escape, advances with a click, Enter, Space and →, and goes back with ←", async () => {
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
      await wait(() => shown(story()));
      const s = story(), out = {};
      const card = s.querySelector('[aria-live]');
      card.click(); await sleep(250); out.click = line();
      key('ArrowRight', s); await sleep(250); out.right = line();
      key('ArrowLeft', s); await sleep(250); out.left = line();
      key('Enter', s); await sleep(250); out.enter = line();
      key(' ', s); await sleep(250); out.space = line();
      key('Escape', s); await sleep(900);
      out.escaped = !shown(story());
      out.escapeFocus = document.activeElement === document.querySelector('#sentence');
      // replayed from the masthead: the first beat again; Skip ends it the same way
      document.querySelector('#story-open').click();
      out.replayed = await wait(() => shown(story()), 3000);
      out.replayLine = line();
      button('Skip').click(); await sleep(900);
      out.skipped = !shown(story());
      out.skipFocus = document.activeElement === document.querySelector('#sentence');
      return out;
    })()`, DESKTOP, { firstVisit: true })) as any;
    expect(m.click, "a click on the story doesn't advance it").toBe(BEATS[1].text);
    expect(m.right, "→ doesn't advance").toBe(BEATS[2].text);
    expect(m.left, "← doesn't go back").toBe(BEATS[1].text);
    expect(m.enter, "Enter doesn't advance").toBe(BEATS[2].text);
    expect(m.space, "Space doesn't advance").toBe(BEATS[3].text);
    expect(m.escaped, "Escape doesn't skip").toBe(true);
    expect(m.escapeFocus, "Escape doesn't put focus on the sentence strip").toBe(true);
    expect(m.replayed, "The story doesn't replay it").toBe(true);
    expect(m.replayLine, "a replay doesn't start at the first beat").toBe(BEATS[0].text);
    expect(m.skipped, "Skip doesn't end it").toBe(true);
    expect(m.skipFocus, "Skip doesn't put focus on the sentence strip").toBe(true);
  }, 90_000);

  it("never traps focus: moving to a word ends it, and the word keeps the focus", async () => {
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
      await wait(() => shown(story()));
      const field = document.querySelector('.sentence-strip input[name="word"]');
      field.focus(); await sleep(600);
      return { closed: !shown(story()), focus: document.activeElement === field };
    })()`, DESKTOP, { firstVisit: true })) as any;
    expect(m.closed, "focus left the story and it stayed open").toBe(true);
    expect(m.focus, "ending the story took focus from the word").toBe(true);
  }, 60_000);

  it("shows once per load when storage fails, and never blocks the page", async () => {
    const broken = `(() => { const no = () => { throw new Error('storage blocked'); }; Storage.prototype.getItem = no; Storage.prototype.setItem = no; })();`;
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
      const opened = await wait(() => shown(story()));
      const forms = document.querySelectorAll('.sentence-strip form[action="/replace"]').length;
      button('Skip').click(); await sleep(800);
      return { opened, forms, closed: !shown(story()) };
    })()`, DESKTOP, { firstVisit: true, init: broken })) as any;
    expect(m.opened, "the story didn't show with storage failing").toBe(true);
    expect(m.forms, "the page lost its words with storage failing").toBe(10);
    expect(m.closed, "the story couldn't be skipped with storage failing").toBe(true);
  }, 60_000);

  it("in beat 2, three parts turn red one after another, in different places, never together, and none stays red", async () => {
    // red as the rebuilt part draws it (motion.ts's RED through the renderer): strongly red, little green or blue.
    // The canvas sampled through the beat: where the red is (its centre), and how much of it.
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
      await wait(() => shown(story()) && document.querySelector('#harbour').hasAttribute('data-ready'));
      await sleep(1500);
      const c = document.querySelector('#harbour canvas'), o = document.createElement('canvas'); o.width = 160; o.height = 100;
      const g = o.getContext('2d');
      const red = () => { g.drawImage(c, 0, 0, 160, 100); const d = g.getImageData(0, 0, 160, 100).data; let n = 0, x = 0, y = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] > 2.2 * d[i + 1] && d[i] > 2.2 * d[i + 2]) { n++; x += (i / 4) % 160; y += Math.floor(i / 4 / 160); }
        return n ? { n, x: x / n, y: y / n } : { n: 0 }; };
      const base = red().n;
      button('Next').click();
      const t0 = performance.now(), samples = [];
      while (performance.now() - t0 < ${BEAT_2_MS + 1500}) { samples.push({ t: performance.now() - t0, ...red() }); await sleep(60); }
      return { base, samples };
    })()`, DESKTOP, { firstVisit: true })) as { base: number; samples: { t: number; n: number; x?: number; y?: number }[] };
    // a part is red when the red rises well above what the ship shows at rest
    const on = (s: { n: number }) => s.n > m.base + 12;
    const runs: { start: number; end: number; x: number; y: number }[] = [];
    for (const s of m.samples) {
      const last = runs.at(-1);
      if (on(s)) { if (last && s.t - last.end < 200) { last.end = s.t; } else runs.push({ start: s.t, end: s.t, x: s.x!, y: s.y! }); }
    }
    expect(runs.length, `beat 2 doesn't rebuild three parts one by one (red runs at ${runs.map((r) => Math.round(r.start)).join(", ")} ms)`).toBe(3);
    // in turn, after the camera arrives, each ending before the next begins and the last within the beat
    expect(runs[0].start, "a part turns red before the camera has arrived").toBeGreaterThanOrEqual(STORY_MOVE_MS - 100);
    for (let i = 1; i < 3; i++) expect(runs[i].start, `part ${i + 1} turns red while part ${i} still is`).toBeGreaterThan(runs[i - 1].end);
    expect(runs[2].end, "a part is still red after the beat's time").toBeLessThanOrEqual(BEAT_2_MS + 200);
    expect(on(m.samples.at(-1)!), "a part stays red").toBe(false);
    // three different parts: each red in its own place on the ship
    for (let i = 1; i < 3; i++) for (let j = 0; j < i; j++) expect(Math.hypot(runs[i].x - runs[j].x, runs[i].y - runs[j].y), `parts ${j + 1} and ${i + 1} are red in the same place`).toBeGreaterThan(4);
  }, 60_000);

  it("moves the camera in on the live ship, and with reduced motion doesn't move it", async () => {
    // the harbour as pixels: a small copy of the canvas, and the share of it that changed between two copies
    const SAMPLE = `
      const sample = () => { const c = document.querySelector('#harbour canvas'), o = document.createElement('canvas'); o.width = 96; o.height = 60; const g = o.getContext('2d'); g.drawImage(c, 0, 0, 96, 60); return Array.from(g.getImageData(0, 0, 96, 60).data); };
      const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++; return n / (a.length / 4); };`;
    const run = (reducedMotion: boolean) => liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE} ${SAMPLE}
      await wait(() => shown(story()) && document.querySelector('#harbour').hasAttribute('data-ready'));
      await sleep(2500);
      const a = sample(); await sleep(2200); const still = sample();
      button('Next').click(); await sleep(2600);
      const b = sample();
      return { still: changed(a, still), moved: changed(still, b) };
    })()`, DESKTOP, { firstVisit: true, reducedMotion }) as Promise<{ still: number; moved: number }>;
    const moving = await run(false);
    expect(moving.moved, "the camera didn't go in on the live ship").toBeGreaterThan(0.3);
    expect(moving.moved, "the change at beat 2 is no more than the sea's").toBeGreaterThan(3 * moving.still);
    const reduced = await run(true);
    expect(reduced.moved, "with reduced motion the camera moved").toBeLessThan(0.03);
  }, 120_000);
});

describe("the story without WebGL or JavaScript, and off GET /", () => {
  it("without WebGL, tells the same five lines", async () => {
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
      const opened = await wait(() => shown(story()));
      const lines = [];
      for (let i = 0; i < 5; i++) { lines.push(line()); key('ArrowRight', story()); await sleep(200); }
      return { opened, lines, canvas: !!document.querySelector('#harbour canvas') };
    })()`, DESKTOP, { firstVisit: true, flags: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] })) as any;
    expect(m.canvas, "a canvas was drawn without WebGL").toBe(false);
    expect(m.opened, "without WebGL the story doesn't open").toBe(true);
    expect(m.lines).toEqual(BEATS.map((b) => b.text));
  }, 60_000);

  it("without JavaScript, there is no story and no way to replay it", async () => {
    const m = (await liveIn(new URL("/", baseUrl).href, `(() => { ${IN_PAGE}
      return { story: shown(story()), replay: shown(document.querySelector('#story-open')), forms: document.querySelectorAll('.sentence-strip form[action="/replace"]').length };
    })()`, DESKTOP, { firstVisit: true, noScript: true })) as any;
    expect(m.story, "the story shows without JavaScript").toBe(false);
    expect(m.replay, "The story shows without JavaScript").toBe(false);
    expect(m.forms).toBe(10);
  }, 60_000);

  it("isn't on an earlier form, an earlier ship or the shipwright's notes", async () => {
    for (const path of ["/?at=0", "/?kept=1", "/ship/"]) {
      const res = await fetch(new URL(path, baseUrl));
      if (res.status !== 200) continue; // no completed ship yet: ?kept=1 is 404
      const m = (await liveIn(new URL(path, baseUrl).href, `(async () => { ${IN_PAGE}
        await sleep(1500);
        return { story: !!story() && shown(story()), replay: shown(document.querySelector('#story-open')) };
      })()`, DESKTOP, { firstVisit: true })) as any;
      expect(m.story, `${path} plays the story`).toBe(false);
      expect(m.replay, `${path} offers The story`).toBe(false);
    }
  }, 120_000);
});

describe("the story and the live sentence", () => {
  changesTheSentence("another visitor's change reaches the sentence while the story plays", async () => {
    let n = 0;
    const word = `storylive${Date.now().toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
    let ok = 0;
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => { ${IN_PAGE}
      await wait(() => shown(story()));
      const label = () => document.querySelector('label[for="word-5"]').textContent.trim();
      await wait(() => label() === ${JSON.stringify(word)}, 15000);
      return { label: label(), open: shown(story()) };
    })()`, DESKTOP, {
      firstVisit: true,
      then: async () => {
        await new Promise((r) => setTimeout(r, 2500));
        const r0 = await fetch(new URL("/", baseUrl));
        const cookie = r0.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
        const v = (await r0.text()).match(/name="position" value="5"><input type="hidden" name="version" value="([0-9]+)"/)![1];
        ok = (await fetch(new URL("/replace", baseUrl), { method: "POST", redirect: "manual", headers: { cookie, origin: new URL(baseUrl).origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ position: "5", version: v, word }) })).status;
        n++;
      },
    })) as any;
    expect(n).toBe(1);
    expect(ok, "the other visitor's change was refused").toBe(303);
    expect(m.label, "the change didn't reach the sentence during the story").toBe(word);
    expect(m.open, "a live change ended the story").toBe(true);
  }, 90_000);
});
