#!/usr/bin/env python3
"""Eligibility-rule simulation for the Theseus redesign.

Evidence type: agent-generated simulation, not user evidence. It tests how a
rule shapes behaviour that *simulated* visitors with stated, simple habits
would produce. It cannot show that a rule is fun, fair-feeling, or legible to
people. Every behavioural assumption is a parameter below and in README.md.

Standard library only. Deterministic for a given seed.

    python3 -I docs/redesign/simulation/sim.py > docs/redesign/simulation/results.md
"""

import math
import random
import statistics
import sys

N_POS = 10
MAKER = "maker"
SETTLED = "settled"  # a settled word: still in the sentence, nobody's eligibility hangs on it

# --- rules -----------------------------------------------------------------
# once      : current product. One successful replacement per visitor, ever.
# standing  : candidate. Eligible iff none of your words stands.
# moveon    : standing + your next word must go somewhere other than your last.
# settle    : moveon + a word that has stood SETTLE_AGE (5 min) settles: it stays in
#             the sentence but stops counting as yours, so you are eligible
#             again. Derivable from history (the change's time), no button.
#             Modelled as: an eligible visitor's next act settles their old word.
# cooldown  : reference (r/Place-like). One replacement per COOLDOWN, no
#             standing condition.
RULES = ["once", "standing", "moveon", "settle", "cooldown"]
SETTLE_AGE = 5 * 60
COOLDOWN = 5 * 60


class Visitor:
    def __init__(self, i, policy, visits, delib, appetite):
        self.id = i
        self.policy = policy
        self.visits = visits  # [(start, end)] seconds
        self.delib = delib  # mean seconds before deciding to act, when able
        self.appetite = appetite  # multiplier on the urge to act again
        self.actions = 0
        self.standing = {}  # position -> time placed
        self.last_pos = None
        self.last_action = None
        self.last_displacer = None
        self.retaliated = True
        self.draft = None  # (position, seen_version, submit_time)
        self.present_ticks = 0
        self.blocked_ticks = 0
        self.was_eligible = True
        self.locked_at = None
        self.lock_durations = []  # completed lock episodes (seconds)
        self.open_lock = None  # censored episode at session end
        self.releases = 0
        self.return_visits = 0
        self.return_visits_able = 0

    def present(self, t):
        return any(a <= t < b for a, b in self.visits)


def eligible(rule, v, t, settle_age=SETTLE_AGE):
    if rule == "once":
        return v.actions == 0
    if rule == "cooldown":
        return v.last_action is None or t - v.last_action >= COOLDOWN
    if not v.standing:
        return True
    if rule == "settle":
        return any(t - placed >= settle_age for placed in v.standing.values())
    return False


def allowed_targets(rule, v):
    ps = [p for p in range(N_POS) if p not in v.standing]
    if rule in ("moveon", "settle") and v.last_pos is not None:
        ps = [p for p in ps if p != v.last_pos]
    return ps


# --- visitor habits --------------------------------------------------------
def choose(rule, v, allowed, owner, visitors, clique, t, rng, p_retaliate, p_unlock):
    if v.policy == "retaliate" and not v.retaliated and v.last_displacer is not None:
        v.retaliated = True
        targets = [p for p in allowed if owner[p] == v.last_displacer]
        if targets and rng.random() < p_retaliate:
            return rng.choice(targets)
    if v.policy == "friend":
        friends = [f for f in clique if f != v.id]
        if rule in ("standing", "moveon", "settle"):
            # unlock the friend who has been stuck longest
            stuck = [
                (visitors[owner[p]].standing.get(p, t), p)
                for p in allowed
                if owner[p] in friends and not eligible(rule, visitors[owner[p]], t)
            ]
            if stuck and rng.random() < p_unlock:
                return min(stuck)[1]
            spare = [p for p in allowed if owner[p] not in friends]
            return rng.choice(spare or allowed)
        # nothing to unlock: just leave friends' words alone
        spare = [p for p in allowed if owner[p] not in friends]
        return rng.choice(spare or allowed)
    return rng.choice(allowed)


# --- populations -----------------------------------------------------------
def room_visits(rng, length):
    """A crit room: everyone arrives in the first 3 minutes; some leave and
    some of those come back."""
    start = rng.uniform(0, 180)
    if rng.random() < 0.6:
        return [(start, length)]
    leave = min(length, start + rng.uniform(240, 720))
    visits = [(start, leave)]
    if rng.random() < 0.4 and leave < length:
        back = leave + rng.uniform(120, 360)
        if back < length:
            visits.append((back, min(length, back + rng.uniform(120, 300))))
    return visits


def sparse_visits(rng, length):
    """Drop-ins across the whole window, short stays, little overlap."""
    visits = []
    for _ in range(rng.choice([1, 1, 2])):
        s = rng.uniform(0, length - 60)
        visits.append((s, min(length, s + rng.uniform(120, 360))))
    return sorted(visits)


def trickle_visits(rng, length):
    """After the crit: one to three short visits across a day."""
    visits = []
    for _ in range(rng.choice([1, 2, 2, 3])):
        s = rng.uniform(0, length - 600)
        visits.append((s, s + rng.uniform(120, 360)))
    return sorted(visits)


MIXES = {
    # name: (length s, tick s, visit model, policies for 12 visitors)
    "random": (1200, 5, room_visits, ["random"] * 12),
    "retaliatory": (1200, 5, room_visits, ["retaliate"] * 6 + ["random"] * 6),
    "friends": (1200, 5, room_visits, ["friend"] * 4 + ["random"] * 8),
    "sparse": (1200, 5, sparse_visits, ["random"] * 12),
    "trickle-24h": (86400, 30, trickle_visits, ["random"] * 12),
    # a crit pod or the proposed playtest: four people, all present throughout
    "pod-4": (1200, 5, lambda rng, length: [(rng.uniform(0, 60), length)], ["random"] * 4),
}


def run(rule, mix, seed, delib_mean=40.0, p_retaliate=0.8, p_unlock=0.8, settle_age=SETTLE_AGE):
    rng = random.Random(f"{rule}|{mix}|{seed}|{delib_mean}|{p_retaliate}|{p_unlock}|{settle_age}")
    el = lambda v, t: eligible(rule, v, t, settle_age)
    length, dt, visit_model, policies = MIXES[mix]
    policies = list(policies)
    rng.shuffle(policies)
    visitors = []
    for i, pol in enumerate(policies):
        delib = delib_mean * math.exp(rng.gauss(0, 0.6))
        visitors.append(Visitor(i, pol, visit_model(rng, length), delib, rng.uniform(0.3, 1.0)))
    clique = [v.id for v in visitors if v.policy == "friend"]

    owner = [MAKER] * N_POS
    version = [1] * N_POS
    log = []  # (t, actor, position, displaced owner)
    stale = 0
    first_all_gone = None

    frozen_ticks = 0
    occupied_ticks = 0
    t = 0.0
    while t < length:
        order = list(visitors)
        rng.shuffle(order)
        # submissions due this tick, in arrival order, against a single state
        for v in order:
            if v.draft and v.draft[2] <= t:
                p, seen, _ = v.draft
                v.draft = None
                if not v.present(t):
                    continue
                if not el(v, t):
                    continue
                if version[p] != seen:
                    stale += 1
                    if rng.random() < 0.6:  # tries again soon
                        v.draft = None
                        v.retry = True
                    continue
                if rule == "settle" and v.standing:
                    for q in list(v.standing):
                        owner[q] = SETTLED
                        del v.standing[q]
                    v.releases += 1
                prev = owner[p]
                owner[p] = v.id
                version[p] += 1
                log.append((t, v.id, p, prev))
                if isinstance(prev, int):
                    d = visitors[prev]
                    d.standing.pop(p, None)
                    d.last_displacer = v.id
                    d.retaliated = False
                v.standing[p] = t
                v.last_pos = p
                v.last_action = t
                v.actions += 1
                if first_all_gone is None and MAKER not in owner:
                    first_all_gone = t

        here_now = [v for v in visitors if v.present(t)]
        if here_now:
            occupied_ticks += 1
            frozen_ticks += all(not el(v, t) for v in here_now)
        for v in visitors:
            here = v.present(t)
            ok = el(v, t)
            # eligibility episodes (wall clock, present or not)
            if v.was_eligible and not ok:
                v.locked_at = t
            elif not v.was_eligible and ok:
                v.lock_durations.append(t - v.locked_at)
                v.locked_at = None
            v.was_eligible = ok
            # return visits: able to act on arrival?
            for k, (a, _) in enumerate(v.visits):
                if k > 0 and a <= t < a + dt:
                    v.return_visits += 1
                    v.return_visits_able += ok
            if not here:
                continue
            v.present_ticks += 1
            if not ok:
                v.blocked_ticks += 1
                continue
            if v.draft:
                continue
            urge = dt / v.delib * (1.0 if v.actions == 0 else v.appetite)
            if getattr(v, "retry", False):
                urge, v.retry = 1.0, False
            if rng.random() < 1 - math.exp(-urge):
                allowed = allowed_targets(rule, v)
                if not allowed:
                    continue
                p = choose(rule, v, allowed, owner, visitors, clique, t, rng, p_retaliate, p_unlock)
                v.draft = (p, version[p], t + dt * rng.randint(1, max(1, int(20 / dt))))
        t += dt

    for v in visitors:
        if v.locked_at is not None:
            v.open_lock = length - v.locked_at
    m = metrics(visitors, log, stale, first_all_gone, owner, length)
    m["frozen"] = frozen_ticks / occupied_ticks if occupied_ticks else float("nan")
    return m


def top_share(counts, frac=0.2):
    s = sorted(counts, reverse=True)
    total = sum(s)
    if total == 0:
        return float("nan")
    k = frac * len(s)
    whole = int(k)
    return (sum(s[:whole]) + (k - whole) * (s[whole] if whole < len(s) else 0)) / total


def metrics(visitors, log, stale, first_all_gone, owner, length):
    acts = [v.actions for v in visitors]
    n = len(log)
    vv = [(a, p, d) for (_, a, p, d) in log if isinstance(d, int)]
    # revenge: X displaces Y, and the last visitor to displace X was Y
    last_by = {}
    revenge = 0
    pair_counts = {}
    for _, a, p, d in log:
        if isinstance(d, int):
            if last_by.get(a) == d:
                revenge += 1
            last_by[d] = a
            key = frozenset((a, d))
            pair_counts[key] = pair_counts.get(key, 0) + 1
    repeated_pair = sum(c for c in pair_counts.values() if c >= 3)
    # A→B→A at one position: the displaced word had itself displaced the actor there
    pingpong = 0
    by_pos = {}
    for _, a, p, d in log:
        hist = by_pos.setdefault(p, [])
        if len(hist) >= 1 and isinstance(d, int) and hist[-1][1] == a:
            pingpong += 1
        hist.append((a, d))
    same_pos = sum(1 for i in range(1, n) if log[i][2] == log[i - 1][2])
    pos_counts = [sum(1 for x in log if x[2] == p) for p in range(N_POS)]
    ent = -sum(c / n * math.log(c / n) for c in pos_counts if c) / math.log(N_POS) if n else float("nan")
    locks = [d for v in visitors for d in v.lock_durations]
    open_locks = [v.open_lock for v in visitors if v.open_lock is not None]
    present = [v for v in visitors if v.present_ticks]
    rv = sum(v.return_visits for v in visitors)
    return {
        "actions": n,
        "per_visitor_mean": statistics.mean(acts),
        "acts": acts,
        "never_acted": sum(a == 0 for a in acts) / len(acts),
        "mostly_blocked": sum(v.blocked_ticks / v.present_ticks > 0.5 for v in present) / len(present),
        "wait_mean": statistics.mean(locks) if locks else float("nan"),
        "regained_share": len(locks) / (len(locks) + len(open_locks)) if locks or open_locks else float("nan"),
        "vv_share": len(vv) / n if n else float("nan"),
        "repeated_pair": repeated_pair / n if n else float("nan"),
        "revenge": revenge / n if n else float("nan"),
        "pingpong": pingpong / n if n else float("nan"),
        "top20": top_share(acts),
        "same_pos": same_pos / (n - 1) if n > 1 else float("nan"),
        "hot_pos": max(pos_counts) / n if n else float("nan"),
        "entropy": ent,
        "stale_per_success": stale / n if n else float("nan"),
        "originals_left": owner.count(MAKER),
        "all_gone_min": first_all_gone / 60 if first_all_gone is not None else float("nan"),
        "all_gone": 1.0 if first_all_gone is not None else 0.0,
        "return_able": sum(v.return_visits_able for v in visitors) / rv if rv else float("nan"),
        "releases": sum(v.releases for v in visitors),
        # still locked at the end, and locked for over half the window: "stuck"
        "stuck_end": sum(1 for v in visitors if v.open_lock is not None and v.open_lock > length / 2) / len(visitors),
    }


# --- reporting -------------------------------------------------------------
def agg(rows, key):
    xs = [r[key] for r in rows if not (isinstance(r[key], float) and math.isnan(r[key]))]
    if not xs:
        return float("nan"), float("nan"), float("nan"), 0
    xs.sort()
    q = lambda f: xs[min(len(xs) - 1, int(f * len(xs)))]
    return statistics.mean(xs), q(0.1), q(0.9), len(xs)


def fmt(x, pct=False, d=2):
    if isinstance(x, float) and math.isnan(x):
        return "—"
    return f"{100 * x:.0f}%" if pct else f"{x:.{d}f}"


COLUMNS = [
    ("per_visitor_mean", "acts/visitor", False, 2),
    ("median", "median", False, 1),
    ("dist", "0/1/2/3/4+ acts", False, 0),
    ("mostly_blocked", "blocked >½ time", True, 0),
    ("stuck_end", "stuck at end", True, 0),
    ("frozen", "room frozen", True, 0),
    ("wait_mean_min", "wait to regain (min)", False, 1),
    ("regained_share", "locks that end", True, 0),
    ("repeated_pair", "repeated-pair", True, 0),
    ("revenge", "revenge", True, 0),
    ("pingpong", "A→B→A same pos", True, 0),
    ("top20", "top-20% share", True, 0),
    ("same_pos", "same pos as prev", True, 0),
    ("entropy", "pos spread (0–1)", False, 2),
    ("stale_per_success", "stale/success", False, 2),
    ("all_gone", "runs where all 10 originals go", True, 0),
    ("all_gone_min", "…at minute (those runs)", False, 1),
    ("return_able", "return visits able", True, 0),
]


def table(mix, seeds, **kw):
    out = [f"\n### Mix: `{mix}`  ({seeds} seeds; mean, with p10–p90 for key columns)\n"]
    head = "| rule | " + " | ".join(c[1] for c in COLUMNS) + " |"
    out.append(head)
    out.append("|" + "---|" * (len(COLUMNS) + 1))
    for rule in RULES:
        rows = [run(rule, mix, s, **kw) for s in range(seeds)]
        pooled = [a for r in rows for a in r["acts"]]
        hist = [sum(a == k for a in pooled) for k in range(4)] + [sum(a >= 4 for a in pooled)]
        dist = "/".join(f"{100 * h / len(pooled):.0f}" for h in hist)
        cells = []
        for key, _, pct, d in COLUMNS:
            if key == "median":
                cells.append(fmt(statistics.median(pooled), d=1))
            elif key == "dist":
                cells.append(dist)
            elif key == "wait_mean_min":
                m, lo, hi, _ = agg(rows, "wait_mean")
                cells.append(f"{fmt(m / 60, d=1)}" if not math.isnan(m) else "—")
            else:
                m, lo, hi, _ = agg(rows, key)
                cell = fmt(m, pct, d)
                if key in ("per_visitor_mean", "revenge", "top20", "mostly_blocked") and not math.isnan(m):
                    cell += f" ({fmt(lo, pct, d)}–{fmt(hi, pct, d)})"
                cells.append(cell)
        out.append(f"| {rule} | " + " | ".join(cells) + " |")
    return "\n".join(out)


def sensitivity(seeds):
    out = ["\n## Sensitivity\n",
           "Key metrics for the two leading rules as the assumptions move. "
           "`delib` is the mean seconds an able visitor takes to act; "
           "`p_ret`/`p_unl` are how reliably retaliators and friends follow their habit.\n"]
    out.append("| mix | rule | delib | p_ret / p_unl | acts/visitor | blocked >½ | revenge | repeated-pair | top-20% |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    for mix in ("retaliatory", "friends"):
        for rule in ("standing", "moveon"):
            for delib in (20.0, 40.0, 80.0):
                for p in (0.5, 0.95):
                    rows = [run(rule, mix, s, delib_mean=delib, p_retaliate=p, p_unlock=p) for s in range(seeds)]
                    g = lambda k, pct=True, d=0: fmt(agg(rows, k)[0], pct, d)
                    out.append(
                        f"| {mix} | {rule} | {delib:.0f}s | {p} | {g('per_visitor_mean', False, 2)} | "
                        f"{g('mostly_blocked')} | {g('revenge')} | {g('repeated_pair')} | {g('top20')} |"
                    )
    return "\n".join(out)


def settle_sensitivity(seeds):
    out = ["\n## Settle age\n", "How the `settle` rule moves with the time a word must stand before it settles. 0 min is voluntary release with no wait: effectively unlimited.\n"]
    out.append("| mix | settle after | acts/visitor | stuck at end | room frozen | wait to regain (min) | revenge | repeated-pair | top-20% |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    for mix in ("random", "retaliatory", "friends", "pod-4", "trickle-24h"):
        for age in (0, 5, 10, 20, 60):
            rows = [run("settle", mix, s, settle_age=age * 60) for s in range(seeds)]
            g = lambda k, pct=True, d=0: fmt(agg(rows, k)[0], pct, d)
            w = agg(rows, "wait_mean")[0]
            out.append(
                f"| {mix} | {age} min | {g('per_visitor_mean', False, 2)} | {g('stuck_end')} | {g('frozen')} | "
                f"{fmt(w / 60, d=1)} | {g('revenge')} | {g('repeated_pair')} | {g('top20')} |"
            )
    return "\n".join(out)


if __name__ == "__main__":
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    print("# Simulation results\n")
    print("Generated by `sim.py` (agent-generated simulation, not user evidence; "
          "see README.md for every assumption). Simulation cannot show that any rule is fun.\n")
    print("## 12 visitors, 20 minutes (and one 24-hour trickle)\n")
    for mix in MIXES:
        print(table(mix, seeds if mix != "trickle-24h" else max(20, seeds // 4)))
    print(sensitivity(max(40, seeds // 4)))
    print(settle_sensitivity(max(40, seeds // 4)))
