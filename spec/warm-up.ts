// Asks for `url` until it answers within `fastMs`, `inARow` times running, or
// `budgetMs` runs out. Never throws: a site that stays slow is reported, and
// the checks then run and show it. `times` is how long each answer took, in ms.
export type WarmUp = { warm: boolean; times: number[] };

export async function warmUp(url: string, { fastMs, inARow, budgetMs }: { fastMs: number; inARow: number; budgetMs: number }): Promise<WarmUp> {
  const times: number[] = [];
  const end = Date.now() + budgetMs;
  let fast = 0;
  while (fast < inARow && Date.now() < end) {
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, end - started)) });
      await res.arrayBuffer();
      if (!res.ok) throw new Error(String(res.status));
      const took = Date.now() - started;
      times.push(took);
      fast = took < fastMs ? fast + 1 : 0;
    } catch {
      times.push(Date.now() - started);
      fast = 0;
    }
  }
  return { warm: fast >= inARow, times };
}
