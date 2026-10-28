export type WarmUp = { warm: boolean; times: number[] };

export async function warmUp(_url: string, _opts: { fastMs: number; inARow: number; budgetMs: number }): Promise<WarmUp> {
  throw new Error("warmUp is not built yet");
}
