// The opening story (docs/decisions/0007-the-opening-story.md): five beats over the harbour as it stands, on a
// first visit. Fixed text only: no counts, names, words from the sentence or anything from the stream. Each beat
// names its shot (stage.ts storyView), whether one part of the live ship is rebuilt as it was (beat 2), and
// whether the sentence is lit (beat 5). Pure, so the page and spec/opening-story.test.ts read the same lines.

export type Shot = "wide" | "live" | "kept";
export type Beat = { text: string; source?: string; shot: Shot; flash?: boolean; lit?: boolean };

// set when the story opens, in this browser only; the server never knows
export const STORY_KEY = "theseus:story";

export const BEATS: readonly Beat[] = [
  { text: "Athens kept the ship of Theseus in its harbour for centuries.", shot: "wide" },
  { text: "As its planks rotted, they were replaced, one by one.", shot: "live", flash: true },
  // a citation of what Plutarch reports, not a quotation
  { text: "Until none of the first planks were left. Philosophers argued over it: was it still the same ship?", source: "Plutarch, Life of Theseus 23", shot: "live" },
  { text: "Centuries later, Hobbes asked: what if someone kept every old plank, and built them into a ship? Which one is Theseus’s?", shot: "kept" },
  { text: "Here, the ship is a sentence. Each word is a plank. Change one.", shot: "wide", lit: true },
];

// Beat 2 rebuilds three small parts in turn, each exactly as it was, so the planks go one by one (the whole hull
// read as the whole ship replaced): shields, oars, stern, once the camera has arrived (STORY_MOVE_MS), each red only
// for its own RED_MS (motion.ts) before the next begins, all done within BEAT_2_MS of the beat starting.
export const STORY_MOVE_MS = 1600;
export const BEAT_2_MS = 5200;
export const REBUILDS: readonly { position: number; at: number }[] = [
  { position: 4, at: 1700 },
  { position: 7, at: 2850 },
  { position: 3, at: 4000 },
];
