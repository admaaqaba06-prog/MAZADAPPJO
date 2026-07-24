/** Compact JOD magnitude for tight labels (chips): 500000 -> "500K", 1.5M etc.
 * Digits only — callers append the JOD/د.أ unit. Non-finite/negative -> "0". */
export function compactJod(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const trim = (v: number) => String(Number(v.toFixed(1))); // drop trailing .0
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(Math.round(n));
}
