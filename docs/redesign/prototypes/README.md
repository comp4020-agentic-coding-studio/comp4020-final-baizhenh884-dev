# Visual direction sketches

**Isolated sketches, not wired into the app.** Nothing under `docs/` is built,
typechecked or served (`tsconfig.json` excludes `docs/`). Every word in them is
staged sketch data, never a visitor's change.

Open any file straight from disk in a browser (no server, no dependencies):

| file | direction |
|---|---|
| `a-monograph-sharpened.html` | A: evolutionary. The Crit 9 field, plus a kept second plate and a stronger, slower exchange |
| `b-two-ships.html` | B: substantial departure. A split spread: what stands (night) and what was kept (paper), both full-weight |
| `c-breakers-yard.html` | C: bold/risky. Full-bleed dark yard, saturated parts, the shed parts piled at the house's feet |

Each shows a static frame on load. **Play one replacement** (or press R)
plays one exchange from a short scripted sequence. Append `#after` to the
URL to jump, without motion, to the end of the script (B and C then show the
all-originals-gone moment); `#play` plays the first exchange on load.
`prefers-reduced-motion` makes every exchange instant.

`iso.js` is a crude shared stand-in for the house (boxes and one roof whose
heights follow word length) so the three can be compared by looking. It is
**not** the frozen grammar in `src/lib/house`, and its geometry proves nothing
about the real house.

Screenshots taken while building these (desktop 1280×800, phone 390×844) were
kept outside the repo and are not evidence.
