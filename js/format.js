// Formatting helpers for counts, durations, dates and the cost meter (English UI, EUR).

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Small euro amounts with cents, for the cost meter: €0.38. */
export function eurCents(value) {
  return `€${nf2.format(Number(value) || 0)}`;
}

/** A whole number with thousands separators: 1,122. */
export function int(value) {
  return nf0.format(Math.round(Number(value) || 0));
}

/** mm:ss (or h:mm:ss) for the stopwatch. */
export function clock(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

// en-GB writes September "Sept" next to the three-letter Aug and Oct; keep all months at three.
const month3 = (text) => text.replace(/\bSept\b/, "Sep");

/**
 * "12 Oct 2026" from an ISO date or timestamp (for recordings made on another day). A bare date is
 * read as that day where the browser is, not as midnight UTC (which is the day before west of UTC).
 */
export function dateWithYear(iso) {
  const text = String(iso ?? "");
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text);
  return Number.isNaN(d.getTime()) ? "an earlier date" : month3(d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
}

/** "15:56:03" local time from an ISO timestamp. */
export function timeOfDay(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
