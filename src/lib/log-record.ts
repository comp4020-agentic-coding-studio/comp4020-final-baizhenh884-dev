// The log (docs/decisions/0006-the-log.md): stubs until it's built, so its checks fail for their reason.
export const LOG_LINES = 50;
export type LogLine = { position: number; part: string; from: string; to: string };
export const logOf = (_rows: { position: number; fromWord: string; toWord: string }[], _blocked: (w: string) => boolean): LogLine[] => [];
export const logLine = (_line: LogLine): { place: string; change: string } => ({ place: "", change: "" });
