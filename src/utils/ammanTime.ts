// Jordan is permanently UTC+3 (no DST since 2022).
const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;

// datetime-local "YYYY-MM-DDTHH:mm" (Amman wall-clock) -> epoch ms.
export function parseAmmanLocalToMs(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value}:00+03:00`);
  return Number.isNaN(ms) ? null : ms;
}

// epoch ms -> "H:MM" 24-hour Amman time (offset math avoids ICU dependence).
export function formatAmmanClock(ms: number): string {
  const d = new Date(ms + AMMAN_OFFSET_MS);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h}:${m.toString().padStart(2, '0')}`;
}
