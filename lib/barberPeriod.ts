/** Borne minimale alignée avec les stats RDV (scripts SQL / métier). */
export const RDV_STATS_START_ISO = "2026-05-01T00:00:00.000Z";
export const RDV_STATS_MIN_YMD = "2026-05-01";

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function clampFromStartIso(iso: string): string {
  return iso < RDV_STATS_START_ISO ? RDV_STATS_START_ISO : iso;
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toDateKey(dt);
}

/** Tous les jours calendaires entre deux bornes incluses (format YYYY-MM-DD). */
export function buildInclusiveRangeKeys(startYmd: string, endYmd: string): string[] {
  const keys: string[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    keys.push(cur);
    cur = addDaysToYmd(cur, 1);
  }
  return keys;
}

export function buildRollingWindowKeys(days: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(toDateKey(d));
  }
  return keys;
}

export function periodBoundsPreset(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  const prevEnd = new Date(start);
  prevEnd.setDate(start.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));

  return {
    startIso: `${toDateKey(start)}T00:00:00.000Z`,
    endIso: `${toDateKey(end)}T23:59:59.999Z`,
    prevStartIso: `${toDateKey(prevStart)}T00:00:00.000Z`,
    prevEndIso: `${toDateKey(prevEnd)}T23:59:59.999Z`,
  };
}

export type ClampedRange = { from: string; to: string };

/** Valide une période personnalisée (stats / historique), avec bornes projet + aujourd’hui. */
export function clampStatRange(fromYmd: string, toYmd: string): ClampedRange | { error: string } {
  const todayYmd = toDateKey(new Date());
  let a = fromYmd <= toYmd ? fromYmd : toYmd;
  let b = fromYmd <= toYmd ? toYmd : fromYmd;

  if (b < RDV_STATS_MIN_YMD) {
    return { error: "Choisis une période à partir du 1er mai 2026." };
  }
  if (a < RDV_STATS_MIN_YMD) a = RDV_STATS_MIN_YMD;
  if (b > todayYmd) b = todayYmd;
  if (a > b) {
    return { error: "La date de début doit être avant (ou égale à) la date de fin." };
  }
  return { from: a, to: b };
}

/** Pour l’historique : filtre optionnel sans borne projet forcée (tout l’historique possible). */
export function clampHistoryFilter(fromYmd: string, toYmd: string): ClampedRange | { error: string } {
  const todayYmd = toDateKey(new Date());
  let a = fromYmd <= toYmd ? fromYmd : toYmd;
  let b = fromYmd <= toYmd ? toYmd : fromYmd;
  if (b > todayYmd) b = todayYmd;
  if (a > b) {
    return { error: "La date de début doit être avant (ou égale à) la date de fin." };
  }
  return { from: a, to: b };
}
