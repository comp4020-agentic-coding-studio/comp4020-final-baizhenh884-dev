// Which part carries the harbour's tag ("08 · Oars", on both ships): the one a
// word is at work on (being rebuilt, or chosen), else the one pointed at; none
// at rest (spec/numbering.test.ts). A phone draws no tag.
export type TagState = { selected: number | null; held: boolean; hovered: number | null; rebuilding: number | null };
export const tagged = ({ selected, hovered, rebuilding }: TagState): number | null => rebuilding ?? selected ?? hovered;
