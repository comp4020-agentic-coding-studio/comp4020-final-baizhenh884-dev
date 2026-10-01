import numpy as np, zlib, json, sys
from PIL import Image, ImageDraw

W = 16
ALL = np.arange(1 << W, dtype=np.uint32)
BITS = ((ALL[:, None] >> np.arange(W, dtype=np.uint32)) & 1).astype(np.uint8)  # [65536,16]

def max_run(bits):
    best = np.ones(bits.shape[0], dtype=np.int32); cur = np.ones_like(best)
    for c in range(1, bits.shape[1]):
        same = bits[:, c] == bits[:, c - 1]
        cur = np.where(same, cur + 1, 1); best = np.maximum(best, cur)
    return best

RUN = max_run(BITS)

def h_legal(k):
    return ALL[RUN <= k]

def forced(history, k):
    """columns whose last k cells are all equal must take the opposite value"""
    if len(history) < k:
        return 0, 0
    last = np.array(history[-k:])  # [k,16] of bits
    mask = 0; val = 0
    for c in range(W):
        col = last[:, c]
        if (col == col[0]).all():
            mask |= 1 << c
            if col[0] == 0:
                val |= 1 << c
    return mask, val

def legal_rows(history, k, H):
    m, v = forced(history, k)
    return H[(H & m) == v], m

def bits_of(r):
    return [(int(r) >> c) & 1 for c in range(W)]

def free_cells(rows):
    if len(rows) == 0:
        return 0
    b = BITS[rows]
    return int(((b.min(0) == 0) & (b.max(0) == 1)).sum())

def has_successor(history, row, k, H):
    rows, _ = legal_rows(history + [bits_of(row)], k, H)
    return len(rows) > 0

def choose(strategy, rows, history, rng):
    if strategy == "random" or (not history and strategy != "default"):
        return rows[rng.integers(len(rows))]
    prev = np.array(history[-1] if history else [0] * W, dtype=np.uint8)
    b = BITS[rows]
    if strategy == "continue":      # extend the diagonal: match previous row shifted one step
        target = np.roll(prev, 1)
        score = (b == target).sum(1)
    elif strategy == "disrupt":     # differ from previous row as much as possible
        score = (b != prev).sum(1)
    elif strategy == "default":     # lazy: change as few squares from the all-under default as possible
        score = -b.sum(1)
    top = rows[score == score.max()]
    return top[rng.integers(len(top))]

def run(k, strategy, n=100, seed=0, lookahead=False):
    rng = np.random.default_rng(seed)
    H = h_legal(k)
    hist, stats = [], []
    for i in range(n):
        rows, m = legal_rows(hist, k, H)
        if lookahead and len(rows):
            ok = np.array([has_successor(hist, r, k, H) for r in rows])
            traps = int((~ok).sum()); rows = rows[ok]
        else:
            traps = None
        if len(rows) == 0:
            stats.append(dict(row=i, dead=True)); break
        stats.append(dict(row=i, dead=False, forced=bin(m).count("1"), legal=int(len(rows)),
                          free=free_cells(rows), bits=float(np.log2(len(rows))), traps=traps))
        hist.append(bits_of(choose(strategy, rows, hist, rng)))
    return np.array(hist, dtype=np.uint8), stats

def pattern(cloth):
    a = cloth
    def eq(x, y): return float((x == y).mean())
    vert = eq(a[1:], a[:-1]); horiz = eq(a[:, 1:], a[:, :-1])
    dr = eq(a[1:, 1:], a[:-1, :-1]); dl = eq(a[1:, :-1], a[:-1, 1:])
    raw = np.packbits(a).tobytes()
    comp = len(zlib.compress(raw, 9)) / max(1, len(raw))
    # longest same-value diagonal (twill line) in either direction
    best = 0
    R, C = a.shape
    for d in (1, -1):
        for r0 in range(R):
            for c0 in range(C):
                L = 1; r, c = r0, c0
                while 0 <= r + 1 < R and 0 <= c + d < C and a[r + 1, c + d] == a[r0, c0]:
                    r += 1; c += d; L += 1
                best = max(best, L)
    distinct_rows = len({tuple(x) for x in a.tolist()})
    return dict(vert=vert, horiz=horiz, diag=max(dr, dl), comp=comp, longest_diag=best, distinct_rows=distinct_rows)

def render(cloth, px=6):
    R, C = cloth.shape
    img = Image.new("RGB", (C * px, R * px), (235, 228, 210))
    d = ImageDraw.Draw(img)
    for r in range(R):
        for c in range(C):
            if cloth[r, c]:
                d.rectangle([c * px, r * px, c * px + px - 2, r * px + px - 1], fill=(40, 40, 60))
            else:
                d.rectangle([c * px, r * px, c * px + px - 1, r * px + px - 2], fill=(200, 188, 160))
    return img
