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
} from "@/app/barber/stats/charts";
import type { DailyChartRow, NamedCount, PointBucket } from "@/app/barber/stats/charts";
import { addDaysToYmd, buildInclusiveRangeKeys, toDateKey } from "@/lib/barberPeriod";

type RangeOption = 7 | 30 | 90;
type StatPeriod =
  | { type: "preset"; days: RangeOption }
  | { type: "custom"; fromYmd: string; toYmd: string };
type Kpi = {
  label: string;
  value: number;
  accent: string;
  delta?: number;
  footnote?: string;
};

type StatsState = {
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
const WEEK_ORDER_MON_FIRST = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const STATS2_MIN_YMD = "2026-01-01";
const PRESTATION_LABEL = "Coupe + barbe";
const PRESTATION_POINTS = 25;
const FAKE_TOTAL_CLIENTS = 320;
const SLOT_HOURS = ["09h", "10h", "11h", "14h", "15h", "16h", "17h"];

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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weekdayFromIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAY_FR[new Date(y, m - 1, d).getDay()];
}

function countForWeekday(weekday: string): number {
  if (weekday === "jeudi" || weekday === "vendredi" || weekday === "samedi") return 15;
  if (weekday === "dimanche") return 0;
  if (weekday === "lundi") return randomInt(6, 9);
  if (weekday === "mardi" || weekday === "mercredi") return randomInt(8, 10);
  return 0;
}

function clampStats2Range(fromYmd: string, toYmd: string): { from: string; to: string } | { error: string } {
  const today = toDateKey(new Date());
  let a = fromYmd <= toYmd ? fromYmd : toYmd;
  let b = fromYmd <= toYmd ? toYmd : fromYmd;
  if (b < STATS2_MIN_YMD) return { error: "Choisis une période à partir du 1er janvier 2026." };
  if (a < STATS2_MIN_YMD) a = STATS2_MIN_YMD;
  if (b > today) b = today;
  if (a > b) return { error: "La date de début doit être avant (ou égale à) la date de fin." };
  return { from: a, to: b };
}

type SimWindow = {
  total: number;
  cancelled: number;
  arrived: number;
  noShow: number;
  pointsAdded: number;
  pointsRemoved: number;
  daily: Record<string, DailyChartRow>;
  weekdayCounts: Record<string, number>;
  hourCounts: Record<string, number>;
};

function buildSimWindow(keys: string[]): SimWindow {
  const daily: Record<string, DailyChartRow> = {};
  const weekdayCounts: Record<string, number> = {};
  const hourCounts: Record<string, number> = {};
  let total = 0;
  let arrived = 0;
  const cancelled = 0;
  const noShow = 0;
  let pointsAdded = 0;
  const pointsRemoved = 0;

  for (const key of keys) {
    const wd = weekdayFromIso(key);
    const booked = countForWeekday(wd);
    total += booked;
    arrived += booked;
    pointsAdded += booked * PRESTATION_POINTS;
    weekdayCounts[wd] = (weekdayCounts[wd] ?? 0) + booked;

    for (let i = 0; i < booked; i += 1) {
      const h = SLOT_HOURS[randomInt(0, SLOT_HOURS.length - 1)];
      hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    }

    daily[key] = {
      label: key.slice(5),
      booked,
      cancelled: 0,
      arrived: booked,
      noShow: 0,
      pointsAdded: booked * PRESTATION_POINTS,
      pointsRemoved: 0,
    };
  }

  return { total, cancelled, arrived, noShow, pointsAdded, pointsRemoved, daily, weekdayCounts, hourCounts };
}

export default function BarberStatisque2Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<StatPeriod>({ type: "preset", days: 30 });
  const todayYmd = toDateKey(new Date());
  const [customDraftFrom, setCustomDraftFrom] = useState(() => addDaysToYmd(todayYmd, -29));
  const [customDraftTo, setCustomDraftTo] = useState(() => todayYmd);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsState>({
    totalClientsSalon: FAKE_TOTAL_CLIENTS,
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
      { label: "Clients du salon", value: stats.totalClientsSalon, accent: "#111827", footnote: "Valeur manuelle" },
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
    const c = clampStats2Range(customDraftFrom, customDraftTo);
    if ("error" in c) return void setError(c.error);
    setError(null);
    setPeriod({ type: "custom", fromYmd: c.from, toYmd: c.to });
  };

  const loadStats = async (p: StatPeriod) => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return void router.push("/auth");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if ((profile as { role?: string } | null)?.role !== "barber") return void router.push("/barber");

    setError(null);

    let startYmd: string;
    let endYmd: string;
    let prevStartYmd: string;
    let prevEndYmd: string;
    let keys: string[];

    if (p.type === "preset") {
      const end = toDateKey(new Date());
      const start = addDaysToYmd(end, -(p.days - 1));
      const clamped = clampStats2Range(start, end);
      if ("error" in clamped) return void setError(clamped.error);
      startYmd = clamped.from;
      endYmd = clamped.to;
      keys = buildInclusiveRangeKeys(startYmd, endYmd);
      const n = keys.length;
      prevEndYmd = addDaysToYmd(startYmd, -1);
      prevStartYmd = addDaysToYmd(startYmd, -n);
    } else {
      const c = clampStats2Range(p.fromYmd, p.toYmd);
      if ("error" in c) return void setError(c.error);
      startYmd = c.from;
      endYmd = c.to;
      keys = buildInclusiveRangeKeys(startYmd, endYmd);
      const n = keys.length;
      prevEndYmd = addDaysToYmd(startYmd, -1);
      prevStartYmd = addDaysToYmd(startYmd, -n);
    }

    const prevKeys = buildInclusiveRangeKeys(prevStartYmd, prevEndYmd).filter((d) => d >= STATS2_MIN_YMD);
    const cur = buildSimWindow(keys);
    const prev = buildSimWindow(prevKeys);

    const busiestWeekday = Object.entries(cur.weekdayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    const busiestHour = Object.entries(cur.hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

    const weeklyForChart: NamedCount[] = WEEK_ORDER_MON_FIRST.map((d) => ({
      name: d.charAt(0).toUpperCase() + d.slice(1),
      value: cur.weekdayCounts[d] ?? 0,
    }));
    const hourlyForChart: NamedCount[] = Object.entries(cur.hourCounts)
      .map(([name, value]) => ({ name, value, order: parseInt(name.replace("h", ""), 10) || 0 }))
      .sort((a, b) => a.order - b.order)
      .map(({ name, value }) => ({ name, value }));

    setKpiDeltas({
      historique: percentDelta(cur.total, prev.total),
      cancelled: percentDelta(cur.cancelled, prev.cancelled),
      arrived: percentDelta(cur.arrived, prev.arrived),
      noShow: percentDelta(cur.noShow, prev.noShow),
      pointsAdded: percentDelta(cur.pointsAdded, prev.pointsAdded),
      pointsRemoved: percentDelta(cur.pointsRemoved, prev.pointsRemoved),
    });

    const totalClosed = cur.arrived + cur.noShow;
    setStats({
      totalClientsSalon: FAKE_TOTAL_CLIENTS,
      totalHistorique: cur.total,
      cancelledInRange: 0,
      arrivedInRange: cur.arrived,
      noShowInRange: 0,
      pointsAdded: cur.pointsAdded,
      pointsRemoved: 0,
      showRate: safeRate(cur.arrived, totalClosed),
      cancelRate: safeRate(0, cur.total),
      noShowRate: safeRate(0, totalClosed),
      busiestWeekday,
      busiestHour,
      prestationPointBuckets: cur.arrived > 0 ? [{ points: PRESTATION_POINTS, count: cur.arrived }] : [],
    });
    setDaily(keys.map((k) => cur.daily[k]));
    setWeeklyBars(weeklyForChart);
    setHourBars(hourlyForChart);
  };

  useEffect(() => {
    const run = async () => {
      await loadStats(period);
      setLoading(false);
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, period]);

  const periodLabelShort = period.type === "preset" ? `${period.days}j` : `${period.fromYmd}_${period.toYmd}`;
  const periodLabelLong = period.type === "preset" ? `${period.days} derniers jours` : `du ${period.fromYmd} au ${period.toYmd}`;

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push("Periode,Valeur");
    lines.push(`${periodLabelLong},`);
    lines.push(`Clients du salon (manuel),${stats.totalClientsSalon}`);
    lines.push(`RDV historique (${periodLabelLong}),${stats.totalHistorique}`);
    lines.push(`Annulations salon (${periodLabelLong}),${stats.cancelledInRange}`);
    lines.push(`Clients venus (${periodLabelLong}),${stats.arrivedInRange}`);
    lines.push(`Clients absents (${periodLabelLong}),${stats.noShowInRange}`);
    lines.push(`Points ajoutes (${periodLabelLong}),${stats.pointsAdded}`);
    lines.push(`Points retires (${periodLabelLong}),${stats.pointsRemoved}`);
    lines.push(`Prestation unique,${csvEscape(PRESTATION_LABEL)}`);
    lines.push("");
    lines.push("Jour,Volume historique,Annulations salon,Clients venus,Clients absents,Points ajoutes,Points retires");
    daily.forEach((d) => {
      lines.push([csvEscape(d.label), d.booked, d.cancelled, d.arrived, d.noShow, d.pointsAdded, d.pointsRemoved].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats2-barber-${periodLabelShort}.csv`;
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
        <div style={cardStyle}>Chargement des statistiques 2...</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#111", margin: 0 }}>Statistiques 2</h1>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {RANGE_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setError(null);
                  setPeriod({ type: "preset", days: d });
                }}
                style={{
                  border: period.type === "preset" && period.days === d ? "2px solid #111" : "1px solid #d1d5db",
                  borderRadius: "10px",
                  background: period.type === "preset" && period.days === d ? "#f3f4f6" : "#fff",
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
              min={STATS2_MIN_YMD}
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
                border: period.type === "custom" ? "2px solid #111" : "1px solid #d1d5db",
                borderRadius: "10px",
                background: period.type === "custom" ? "#f3f4f6" : "#fff",
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
                await loadStats(period);
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
          Données <strong>manuelles/simulées</strong> depuis le 1er janvier 2026 : jeudi/vendredi/samedi = 15 RDV, dimanche = 0,
          lundi = 6 à 9, mardi/mercredi = 8 à 10 (tirage aléatoire à chaque chargement), <strong>sans annulation</strong>.
          Prestation unique : <strong>{PRESTATION_LABEL}</strong>.
          <br />
          <strong>Période sélectionnée :</strong> {periodLabelLong}.
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
