/** Compact JOD magnitude for tight labels (chips): 500000 -> "500K", 1.5M etc.
 * Digits only — callers append the JOD/د.أ unit. Non-finite/negative -> "0". */
export function compactJod(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const trim = (v: number) => String(Number(v.toFixed(1))); // drop trailing .0
  // 999_950 rounds up to 1.0M at one decimal — promote so we never render "1000K".
  if (n >= 999_950) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(Math.round(n));
}

/**
 * Shared auction countdown formatter — the SINGLE source of truth for how a
 * remaining-seconds value renders across the whole app (detail-page pill AND
 * discover cards). Replaces two divergent local formatters that both dropped
 * the hour rollover (a 6h lot showed "364:14").
 *
 * Rules:
 * - secondsLeft ≤ 0        → "00:00"
 * - secondsLeft < 3600     → "MM:SS", both zero-padded (e.g. 45s → "00:45", 135s → "02:15")
 * - secondsLeft ≥ 3600     → "{h}h {mm}m" (EN) / "{h}س {mm}د" (AR), minutes zero-padded to 2
 *                            (e.g. 21749s → "6h 02m" / "٦س ٠٢د")
 *
 * Numerals stay Western digits in EN; the AR branch uses Arabic-Indic digits.
 */
export function formatCountdown(secondsLeft: number, isAr: boolean): string {
  const s = Math.floor(secondsLeft);
  if (!Number.isFinite(s) || s <= 0) return '00:00';

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const toAr = (str: string) =>
    str.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

  if (s < 3600) {
    const mm = pad2(Math.floor(s / 60));
    const ss = pad2(s % 60);
    const out = `${mm}:${ss}`;
    return isAr ? toAr(out) : out;
  }

  const h = Math.floor(s / 3600);
  const mm = pad2(Math.floor((s % 3600) / 60));
  return isAr ? `${toAr(String(h))}س ${toAr(mm)}د` : `${h}h ${mm}m`;
}
