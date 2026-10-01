import sys, numpy as np
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sim import *
from PIL import Image, ImageDraw

PAL = [(178, 58, 52), (214, 150, 48), (60, 110, 160), (70, 130, 90), (120, 70, 130), (30, 30, 40), (200, 200, 190), (160, 90, 60)]

def mixed_run(k, n=100, seed=0, mix=(("default", .4), ("continue", .2), ("random", .3), ("disrupt", .1))):
    rng = np.random.default_rng(seed); H = h_legal(k); hist = []
    names = [m[0] for m in mix]; p = [m[1] for m in mix]
    for i in range(n):
        rows, _ = legal_rows(hist, k, H)
        hist.append(bits_of(choose(rng.choice(names, p=p), rows, hist, rng)))
    return np.array(hist, dtype=np.uint8)

def colour_render(cloth, seed=0, px=7):
    rng = np.random.default_rng(seed + 1000)
    R, C = cloth.shape
    img = Image.new("RGB", (C * px, R * px), (225, 215, 190)); d = ImageDraw.Draw(img)
    for r in range(R):
        col = PAL[rng.integers(len(PAL))]
        for c in range(C):
            x, y = c * px, r * px
            if cloth[r, c]:   # weft over: the weaver's colour, a horizontal bar
                d.rectangle([x, y + 1, x + px - 1, y + px - 2], fill=col)
            else:             # warp over: undyed warp, a vertical bar
                d.rectangle([x + 1, y, x + px - 2, y + px - 1], fill=(222, 210, 180))
                d.line([x + 1, y, x + 1, y + px - 1], fill=(190, 176, 146))
    return img

def sheet(panels, labels, path, pad=14, top=16):
    w = sum(p.width for p in panels) + pad * (len(panels) + 1)
    h = max(p.height for p in panels) + pad + top
    out = Image.new("RGB", (w, h), (255, 255, 255)); d = ImageDraw.Draw(out); x = pad
    for p, lab in zip(panels, labels):
        out.paste(p, (x, top)); d.text((x, 2), lab, fill=(0, 0, 0)); x += p.width + pad
    out.save(path)

# sheet 1: structure only (black/white), 3 rules x 4 behaviours, first 100 rows, seed 0
panels, labels = [], []
for k in (2, 3, 4):
    for s in ("random", "continue", "disrupt", "default"):
        cloth, _ = run(k, s, 100, 0)
        panels.append(render(cloth, 6)); labels.append(f"k{k} {s[:4]}")
rng = np.random.default_rng(99)
panels.append(render(rng.integers(0, 2, (100, 16)).astype(np.uint8), 6)); labels.append("noise")
sheet(panels, labels, os.path.join(HERE, "structure.png"))

# sheet 2: what the page would look like: coloured cloth at 5/20/50/100 rows, k=3 random and k=3 mixed population
cr, _ = run(3, "random", 100, 3)
cm = mixed_run(3, 100, 3)
c2 = mixed_run(2, 100, 3)
panels = [colour_render(cr[:n], 3) for n in (5, 20, 50, 100)] + [colour_render(cm, 3), colour_render(c2, 3)]
labels = ["k3 rand 5", "k3 rand 20", "k3 rand 50", "k3 rand 100", "k3 mixed 100", "k2 mixed 100"]
sheet(panels, labels, os.path.join(HERE, "colour.png"))

# mixed-population statistics, 40 seeds
for k in (2, 3):
    P = [pattern(mixed_run(k, 100, s)) for s in range(40)]
    print(f"mixed k={k}", {key: round(float(np.mean([p[key] for p in P])), 2) for key in P[0]})
print("saved")
