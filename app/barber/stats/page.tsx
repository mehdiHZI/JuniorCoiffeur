"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  DailyFlowChart,
  HourlyPeakChart,
  OutcomesDonutChart,
  PointsFlowChart,
  PrestationPointsChart,
  WeekdayBookingsChart,
} from "./charts";
import type { DailyChartRow, NamedCount, PointBucket } from "./charts";
import {
  addDaysToYmd,
  buildInclusiveRangeKeys,
  clampFromStartIso,
  clampStatRange,
  periodBoundsPreset,
  RDV_STATS_MIN_YMD,
  toDateKey,
} from "@/lib/barberPeriod";
import { fetchCancellationsByEffDateRange, fetchOutcomesByEffDateRange } from "@/lib/bookingEffRangeFetch";

type RangeOption = 7 | 30 | 90;

/** Période affichée : presets glissants ou plage calendaire fixe */
type StatPeriod =
  | { type: "preset"; days: RangeOption }
  | { type: "custom"; fromYmd: string; toYmd: string };
type Kpi = {
  label: string;
  value: number;
  accent: string;
  /** Variation vs période précédente ; ignoré si `footnote` est défini */
  delta?: number;
  /** Texte sous la valeur (ex. métrique cumulative hors période) */
  footnote?: string;
};

type OutcomeRowDb = {
  id: number;
  customer_id: string;
  status: "arrived" | "no_show";
  prestation_points: number;
  slot_date: string | null;
  start_time: string | null;
  created_at: string;
};

type CancelRowDb = {
  id: number;
  customer_id: string;
  slot_date: string | null;
  start_time: string | null;
  cancelled_at: string;
};

type StatsState = {
  /** Total des lignes `customers` avec compte (user_id) — base salon */
  totalClientsSalon: number;
  totalHistorique: number;
  cancelledInRange: number;
  arrivedInRange: number;
  noShowInRange: number;
  pointsAdded: number;
  pointsRemoved: number;
  showRate: number;
  cancelRate: number;
  noShowRate: number;
  busiestWeekday: string;
  busiestHour: string;
  prestationPointBuckets: PointBucket[];
};

const RANGE_OPTIONS: RangeOption[] = [7, 30, 90];
const WEEKDAY_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
/** Ordre affichage graphique : lundi → dimanche */
const WEEK_ORDER_MON_FIRST = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function percentDelta(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function effOutcomeDate(o: OutcomeRowDb): string {
  return (o.slot_date && String(o.slot_date).trim()) || String(o.created_at ?? "").slice(0, 10);
}

function effCancelDate(c: CancelRowDb): string {
  return (c.slot_date && String(c.slot_date).trim()) || String(c.cancelled_at ?? "").slice(0, 10);
}

function inYmdRange(isoYmd: string, startYmd: string, endYmd: string): boolean {
  return isoYmd >= startYmd && isoYmd <= endYmd;
}

function weekdayFromIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAY_FR[new Date(y, m - 1, d).getDay()];
}

function hourBucket(startTime: string | null): string | null {
  if (!startTime) return null;
  return `${String(startTime).slice(0, 2)}h`;
}

export default function BarberStatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statPeriod, setStatPeriod] = useState<StatPeriod>({ type: "preset", days: 30 });
  const todayYmd = toDateKey(new Date());
  const [customDraftFrom, setCustomDraftFrom] = useState(() => addDaysToYmd(todayYmd, -29));
  const [customDraftTo, setCustomDraftTo] = useState(() => todayYmd);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsState>({
    totalClientsSalon: 0,
    totalHistorique: 0,
    cancelledInRange: 0,
    arrivedInRange: 0,
    noShowInRange: 0,
    pointsAdded: 0,
    pointsRemoved: 0,
    showRate: 0,
    cancelRate: 0,
    noShowRate: 0,
    busiestWeekday: "-",
    busiestHour: "-",
    prestationPointBuckets: [],
  });
  const [daily, setDaily] = useState<DailyChartRow[]>([]);
  const [weeklyBars, setWeeklyBars] = useState<NamedCount[]>([]);
  const [hourBars, setHourBars] = useState<NamedCount[]>([]);
  const [kpiDeltas, setKpiDeltas] = useState<Record<string, number | undefined>>({});

  const kpiCards = useMemo<Kpi[]>(
    () => [
      {
        label: "Clients du salon",
        value: stats.totalClientsSalon,
        accent: "#111827",
        footnote: "Total des comptes clients enregistrés",
      },
      { label: "RDV (historique)", value: stats.totalHistorique, accent: "#0f766e", delta: kpiDeltas.historique },
      { label: "Annulations salon", value: stats.cancelledInRange, accent: "#b91c1c", delta: kpiDeltas.cancelled },
      { label: "Clients venus", value: stats.arrivedInRange, accent: "#166534", delta: kpiDeltas.arrived },
      { label: "Clients absents", value: stats.noShowInRange, accent: "#92400e", delta: kpiDeltas.noShow },
      { label: "Points ajoutés", value: stats.pointsAdded, accent: "#1d4ed8", delta: kpiDeltas.pointsAdded },
      { label: "Points retirés", value: stats.pointsRemoved, accent: "#7c2d12", delta: kpiDeltas.pointsRemoved },
    ],
    [stats, kpiDeltas]
  );

  const applyCustomPeriod = () => {
    const clamped = clampStatRange(customDraftFrom, customDraftTo);
    if ("error" in clamped) {
      setError(clamped.error);
      return;
    }
    setError(null);
    setStatPeriod({ type: "custom", fromYmd: clamped.from, toYmd: clamped.to });
  };

  const loadStats = async (period: StatPeriod) => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      router.push("/auth");
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if ((profile as { role?: string } | null)?.role !== "barber") {
      router.push("/barber");
      return;
    }

    setError(null);

    const { count: clientsCount, error: custErr } = await supabase
      .from("customers")
      .select("*", { head: true, count: "exact" })
      .not("user_id", "is", null);
    if (custErr) {
      setError(custErr.message);
      return;
    }

    let windowStartYmd: string;
    let windowEndYmd: string;
    let prevStartYmd: string;
    let prevEndYmd: string;
    let keys: string[];

    if (period.type === "preset") {
      const bounds = periodBoundsPreset(period.days);
      windowEndYmd = toDateKey(new Date());
      windowStartYmd = clampFromStartIso(bounds.startIso).slice(0, 10);
      prevStartYmd = clampFromStartIso(bounds.prevStartIso).slice(0, 10);
      prevEndYmd = clampFromStartIso(bounds.prevEndIso).slice(0, 10);
      keys = buildInclusiveRangeKeys(windowStartYmd, windowEndYmd);
    } else {
      const clamped = clampStatRange(period.fromYmd, period.toYmd);
      if ("error" in clamped) {
        setError(clamped.error);
        return;
      }
      windowStartYmd = clamped.from;
      windowEndYmd = clamped.to;
      keys = buildInclusiveRangeKeys(windowStartYmd, windowEndYmd);
      const n = keys.length;
      prevEndYmd = addDaysToYmd(windowStartYmd, -1);
      prevStartYmd = addDaysToYmd(windowStartYmd, -n);
    }
    const keySet = new Set(keys);
    const dayAgg: Record<string, DailyChartRow> = {};
    keys.forEach((k) => {
      dayAgg[k] = { label: k.slice(5), booked: 0, cancelled: 0, arrived: 0, noShow: 0, pointsAdded: 0, pointsRemoved: 0 };
    });

    const fetchFromYmd = prevStartYmd;
    const fetchToYmd = windowEndYmd;

    const selOutcome = "id, customer_id, status, prestation_points, slot_date, start_time, created_at";
    const selCancel = "id, customer_id, slot_date, start_time, cancelled_at";

    const { data: allOutcomes, error: oFetchErr } = await fetchOutcomesByEffDateRange<OutcomeRowDb>(supabase, {
      barberUserId: user.id,
      fromYmd: fetchFromYmd,
      toYmd: fetchToYmd,
      select: selOutcome,
    });
    if (oFetchErr) {
      setError(oFetchErr);
      return;
    }

    const { data: allCancels, error: cFetchErr } = await fetchCancellationsByEffDateRange<CancelRowDb>(supabase, {
      cancelledBy: user.id,
      fromYmd: fetchFromYmd,
      toYmd: fetchToYmd,
      select: selCancel,
    });
    if (cFetchErr) {
      setError(cFetchErr);
      return;
    }

    const inCurrent = (ymd: string) => inYmdRange(ymd, windowStartYmd, windowEndYmd);
    const inPrev = (ymd: string) => inYmdRange(ymd, prevStartYmd, prevEndYmd);

    const outCurr = allOutcomes.filter((o) => inCurrent(effOutcomeDate(o)));
    const cancelCurr = allCancels.filter((c) => inCurrent(effCancelDate(c)));
    const outPrev = allOutcomes.filter((o) => inPrev(effOutcomeDate(o)));
    const cancelPrev = allCancels.filter((c) => inPrev(effCancelDate(c)));

    const totalHistorique = outCurr.length + cancelCurr.length;
    const totalHistoriquePrev = outPrev.length + cancelPrev.length;

    const cancelledInRange = cancelCurr.length;
    const cancelledPrevCount = cancelPrev.length;

    let arrivedInRange = 0;
    let noShowInRange = 0;
    let arrivedPrevCount = 0;
    let noShowPrevCount = 0;
    let pointsAdded = 0;
    let pointsRemoved = 0;
    let pointsAddedPrev = 0;
    let pointsRemovedPrev = 0;
    const pointBuckets: Record<number, number> = {};
    const weekdayCounts: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};

    const bumpWeekdayHour = (effYmd: string, startTime: string | null) => {
      const wd = weekdayFromIso(effYmd);
      if (wd) weekdayCounts[wd] = (weekdayCounts[wd] ?? 0) + 1;
      const hb = hourBucket(startTime);
      if (hb) hourCounts[hb] = (hourCounts[hb] ?? 0) + 1;
    };

    outCurr.forEach((o) => {
      const eff = effOutcomeDate(o);
      if (o.status === "arrived") arrivedInRange += 1;
      else noShowInRange += 1;

      const p = Number(o.prestation_points ?? 0);
      // Aligné sur l’enregistrement RDV : la magnitude est toujours positive dans booking_outcomes ;
      // les points sont crédités seulement si « venu », sinon c’est une pénalité (retrait), comme la transaction négative.
      if (o.status === "arrived") {
        if (p > 0) {
          pointsAdded += p;
          pointBuckets[p] = (pointBuckets[p] ?? 0) + 1;
        }
        if (p < 0) pointsRemoved += Math.abs(p);
      } else {
        if (p > 0) pointsRemoved += p;
        else if (p < 0) pointsRemoved += Math.abs(p);
      }

      if (keySet.has(eff)) {
        dayAgg[eff].booked += 1;
        if (o.status === "arrived") dayAgg[eff].arrived += 1;
        else dayAgg[eff].noShow += 1;
        if (o.status === "arrived") {
          if (p > 0) dayAgg[eff].pointsAdded += p;
          if (p < 0) dayAgg[eff].pointsRemoved += Math.abs(p);
        } else {
          if (p > 0) dayAgg[eff].pointsRemoved += p;
          else if (p < 0) dayAgg[eff].pointsRemoved += Math.abs(p);
        }
      }
      bumpWeekdayHour(eff, o.start_time);
    });

    cancelCurr.forEach((c) => {
      const eff = effCancelDate(c);
      if (keySet.has(eff)) {
        dayAgg[eff].booked += 1;
        dayAgg[eff].cancelled += 1;
      }
      bumpWeekdayHour(eff, c.start_time);
    });

    outPrev.forEach((o) => {
      if (o.status === "arrived") arrivedPrevCount += 1;
      else noShowPrevCount += 1;
      const p = Number(o.prestation_points ?? 0);
      if (o.status === "arrived") {
        if (p > 0) pointsAddedPrev += p;
        if (p < 0) pointsRemovedPrev += Math.abs(p);
      } else {
        if (p > 0) pointsRemovedPrev += p;
        else if (p < 0) pointsRemovedPrev += Math.abs(p);
      }
    });

    const busiestWeekday = Object.entries(weekdayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    const busiestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    const totalClosed = arrivedInRange + noShowInRange;

    const weeklyForChart: NamedCount[] = WEEK_ORDER_MON_FIRST.map((day) => ({
      name: day.charAt(0).toUpperCase() + day.slice(1),
      value: weekdayCounts[day] ?? 0,
    }));

    const hourlyForChart: NamedCount[] = Object.entries(hourCounts)
      .map(([name, value]) => ({
        name,
        value,
        order: parseInt(name.replace("h", ""), 10) || 0,
      }))
      .sort((a, b) => a.order - b.order)
      .map(({ name, value }) => ({ name, value }));

    setKpiDeltas({
      historique: percentDelta(totalHistorique, totalHistoriquePrev),
      cancelled: percentDelta(cancelledInRange, cancelledPrevCount),
      arrived: percentDelta(arrivedInRange, arrivedPrevCount),
      noShow: percentDelta(noShowInRange, noShowPrevCount),
      pointsAdded: percentDelta(pointsAdded, pointsAddedPrev),
      pointsRemoved: percentDelta(pointsRemoved, pointsRemovedPrev),
    });

    setStats({
      totalClientsSalon: Number(clientsCount ?? 0),
      totalHistorique,
      cancelledInRange,
      arrivedInRange,
      noShowInRange,
      pointsAdded,
      pointsRemoved,
      showRate: safeRate(arrivedInRange, totalClosed),
      cancelRate: safeRate(cancelledInRange, totalHistorique > 0 ? totalHistorique : 0),
      noShowRate: safeRate(noShowInRange, totalClosed),
      busiestWeekday,
      busiestHour,
      prestationPointBuckets: Object.entries(pointBuckets)
        .map(([pts, count]) => ({ points: Number(pts), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    });
    setDaily(keys.map((k) => dayAgg[k]));
    setWeeklyBars(weeklyForChart);
    setHourBars(hourlyForChart);
  };

  useEffect(() => {
    const run = async () => {
      await loadStats(statPeriod);
      setLoading(false);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, statPeriod]);

  const periodLabelShort =
    statPeriod.type === "preset"
      ? `${statPeriod.days}j`
      : `${statPeriod.fromYmd}_${statPeriod.toYmd}`;
  const periodLabelLong =
    statPeriod.type === "preset"
      ? `${statPeriod.days} derniers jours`
      : `du ${statPeriod.fromYmd} au ${statPeriod.toYmd}`;

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push("Periode,Valeur");
    lines.push(`${periodLabelLong},`);
    lines.push(`Clients du salon (comptes),${stats.totalClientsSalon}`);
    lines.push(`RDV historique (${periodLabelLong}),${stats.totalHistorique}`);
    lines.push(`Annulations salon (${periodLabelLong}),${stats.cancelledInRange}`);
    lines.push(`Clients venus (${periodLabelLong}),${stats.arrivedInRange}`);
    lines.push(`Clients absents (${periodLabelLong}),${stats.noShowInRange}`);
    lines.push(`Points ajoutes (${periodLabelLong}),${stats.pointsAdded}`);
    lines.push(`Points retires (${periodLabelLong}),${stats.pointsRemoved}`);
    lines.push(`Show rate (%),${stats.showRate.toFixed(1)}`);
    lines.push(`Cancel rate (%),${stats.cancelRate.toFixed(1)}`);
    lines.push(`No-show rate (%),${stats.noShowRate.toFixed(1)}`);
    lines.push("");
    lines.push("Jour,Volume historique,Annulations salon,Clients venus,Clients absents,Points ajoutes,Points retires");
    daily.forEach((d) => {
      lines.push([csvEscape(d.label), d.booked, d.cancelled, d.arrived, d.noShow, d.pointsAdded, d.pointsRemoved].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats-barber-${periodLabelShort}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const containerStyle: CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };
  const cardStyle: CSSProperties = {
    maxWidth: "1080px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    padding: "24px",
    borderRadius: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>Chargement des statistiques...</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#111", margin: 0 }}>Statistiques</h1>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {RANGE_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setError(null);
                  setStatPeriod({ type: "preset", days: d });
                }}
                style={{
                  border:
                    statPeriod.type === "preset" && statPeriod.days === d ? "2px solid #111" : "1px solid #d1d5db",
                  borderRadius: "10px",
                  background: statPeriod.type === "preset" && statPeriod.days === d ? "#f3f4f6" : "#fff",
                  padding: "7px 11px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {d}j
              </button>
            ))}
            <span style={{ fontSize: "13px", color: "#6b7280", alignSelf: "center" }}>ou du</span>
            <input
              type="date"
              value={customDraftFrom}
              min={RDV_STATS_MIN_YMD}
              max={customDraftTo}
              onChange={(e) => setCustomDraftFrom(e.target.value)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "6px 10px", fontSize: "13px" }}
            />
            <span style={{ fontSize: "13px", color: "#6b7280", alignSelf: "center" }}>au</span>
            <input
              type="date"
              value={customDraftTo}
              min={customDraftFrom}
              max={todayYmd}
              onChange={(e) => setCustomDraftTo(e.target.value)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "6px 10px", fontSize: "13px" }}
            />
            <button
              type="button"
              onClick={applyCustomPeriod}
              style={{
                border:
                  statPeriod.type === "custom" ? "2px solid #111" : "1px solid #d1d5db",
                borderRadius: "10px",
                background: statPeriod.type === "custom" ? "#f3f4f6" : "#fff",
                padding: "7px 11px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Appliquer
            </button>
            <button
              type="button"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await loadStats(statPeriod);
                setRefreshing(false);
              }}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", background: "#fff", padding: "8px 12px", fontSize: "13px", cursor: refreshing ? "not-allowed" : "pointer" }}
            >
              {refreshing ? "Actualisation..." : "Actualiser"}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", background: "#fff", padding: "8px 12px", fontSize: "13px", cursor: "pointer" }}
            >
              Export CSV
            </button>
          </div>
        </div>

        <p style={{ fontSize: "13px", color: "#6b7280", marginTop: 0, marginBottom: "18px" }}>
          La carte <strong>Clients du salon</strong> compte tous les comptes clients en base. Le reste est lu dans Supabase pour la{" "}
          <strong>période affichée et la période de comparaison uniquement</strong> (moins de données transférées). Filtrage par{" "}
          <strong>date du créneau</strong> (ou date d&apos;enregistrement si le créneau n&apos;est pas stocké).{" "}
          <strong>Période sélectionnée :</strong> {periodLabelLong}
          {statPeriod.type === "preset"
            ? ` (fenêtre glissante · stats depuis le ${RDV_STATS_MIN_YMD} · comparaison avec les ${statPeriod.days} jours précédents)`
            : ` (plage fixe · comparaison avec les ${buildInclusiveRangeKeys(statPeriod.fromYmd, statPeriod.toYmd).length} jours calendaires précédents)`}
          .
        </p>
        {error && <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "14px" }}>{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px", marginBottom: "18px" }}>
          {kpiCards.map((kpi) => (
            <div key={kpi.label} style={{ borderRadius: "12px", border: "1px solid #e5e7eb", padding: "12px", background: "#fff" }}>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>{kpi.label}</div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: kpi.accent }}>{kpi.value}</div>
              <div style={{ marginTop: "4px", fontSize: "12px", color: "#6b7280" }}>
                {kpi.footnote != null && kpi.footnote !== ""
                  ? kpi.footnote
                  : kpi.delta == null
                    ? "Pas assez d'historique"
                    : `${kpi.delta >= 0 ? "+" : ""}${kpi.delta.toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "18px" }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Taux de présence</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#166534" }}>{stats.showRate.toFixed(1)}%</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Taux d'annulation</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#b91c1c" }}>{stats.cancelRate.toFixed(1)}%</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Taux d'absence</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#92400e" }}>{stats.noShowRate.toFixed(1)}%</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Jour le plus chargé</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#111", textTransform: "capitalize" }}>{stats.busiestWeekday}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Heure la plus demandée</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#111" }}>{stats.busiestHour}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", marginBottom: "16px" }}>
          <DailyFlowChart data={daily} />
          <PointsFlowChart data={daily} />
        </div>

        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", marginBottom: "16px" }}>
          <WeekdayBookingsChart data={weeklyBars} />
          <HourlyPeakChart data={hourBars} />
        </div>

        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", marginBottom: "8px" }}>
          <OutcomesDonutChart arrived={stats.arrivedInRange} noShow={stats.noShowInRange} />
          <PrestationPointsChart buckets={stats.prestationPointBuckets} />
        </div>
      </div>
    </div>
  );
}

