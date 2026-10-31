// The opening story (docs/decisions/0007-the-opening-story.md): not built yet.

export type Shot = "wide" | "live" | "kept";
export type Beat = { text: string; source?: string; shot: Shot; flash?: boolean; lit?: boolean };

export const STORY_KEY = "theseus:story";
export const BEATS: readonly Beat[] = [];
export const STORY_MOVE_MS = 0;
export const BEAT_2_MS = 0;
export const REBUILDS: readonly { position: number; at: number }[] = [];
