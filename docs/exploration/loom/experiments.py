import numpy as np, sys
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sim import *

SEEDS = 40
strategies = ["random", "continue", "disrupt", "default"]

def summarise(k, strat, lookahead=False, seeds=SEEDS):
    dead_runs = 0; dead_at = []; F = []; FR = []; B = []; L = []; pats = []; traps = []
    for s in range(seeds):
        cloth, st = run(k, strat, 100, s, lookahead)
        if st[-1]["dead"]:
            dead_runs += 1; dead_at.append(st[-1]["row"])
        live = [x for x in st if not x["dead"] and x["row"] >= k]  # after the first k rows, when inheritance exists
        F += [x["forced"] for x in live]; FR += [x["free"] for x in live]
        B += [x["bits"] for x in live]; L += [x["legal"] for x in live]
        if lookahead: traps += [x["traps"] for x in live]
        if len(cloth) >= 30: pats.append(pattern(cloth))
    q = lambda a: (int(np.min(a)), float(np.median(a)), int(np.max(a))) if len(a) else None
    P = {key: float(np.mean([p[key] for p in pats])) for key in pats[0]} if pats else {}
    return dict(k=k, strategy=strat, lookahead=lookahead, dead_runs=dead_runs, dead_at=dead_at[:8],
                forced=q(F), free=q(FR), legal_min=int(np.min(L)) if L else None,
                legal_median=float(np.median(L)) if L else None,
                near_paralysis_rows=float(np.mean(np.array(FR) <= 4)) if FR else None,
                traps=q(traps) if traps else None, pattern=P)

# baseline: a random binary cloth with no rule, for comparison
rng = np.random.default_rng(99)
noise = rng.integers(0, 2, (100, 16)).astype(np.uint8)
print("NO RULE (pure noise):", {k: round(v, 3) for k, v in pattern(noise).items()})

for k in (2, 3, 4):
    for strat in strategies:
        r = summarise(k, strat)
        P = r["pattern"]
        print(f"k={k} {strat:8s} dead_runs={r['dead_runs']}/{SEEDS} dead_at={r['dead_at']} "
              f"forced(min,med,max)={r['forced']} free={r['free']} legal_min={r['legal_min']} legal_med={r['legal_median']} "
              f"near_paralysis(free<=4)={r['near_paralysis_rows']:.3f} | "
              + " ".join(f"{a}={P[a]:.2f}" for a in ('vert','horiz','diag','comp','longest_diag','distinct_rows')))
