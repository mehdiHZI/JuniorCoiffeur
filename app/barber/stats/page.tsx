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

type RangeOption = 7 | 30 | 90;
type Kpi = { label: string; value: number; accent: string; delta?: number };

type StatsState = {
  totalCustomers: number;
  totalSlots: number;
  bookedInRange: number;
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
const RDV_STATS_START_DATE = "2026-05-01T00:00:00.000Z";

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildWindowKeys(days: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(toDateKey(d));
  }
  return keys;
}

function periodBounds(days: number) {
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

function clampFromStart(iso: string): string {
  return iso < RDV_STATS_START_DATE ? RDV_STATS_START_DATE : iso;
}

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

export default function BarberStatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeDays, setRangeDays] = useState<RangeOption>(30);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsState>({
    totalCustomers: 0,
    totalSlots: 0,
    bookedInRange: 0,
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
      { label: "Clients enregistrés", value: stats.totalCustomers, accent: "#111827" },
      { label: "RDV pris", value: stats.bookedInRange, accent: "#0f766e", delta: kpiDeltas.booked },
      { label: "RDV annulés", value: stats.cancelledInRange, accent: "#b91c1c", delta: kpiDeltas.cancelled },
      { label: "Clients venus", value: stats.arrivedInRange, accent: "#166534", delta: kpiDeltas.arrived },
      { label: "Clients absents", value: stats.noShowInRange, accent: "#92400e", delta: kpiDeltas.noShow },
      { label: "Points ajoutés", value: stats.pointsAdded, accent: "#1d4ed8", delta: kpiDeltas.pointsAdded },
      { label: "Points retirés", value: stats.pointsRemoved, accent: "#7c2d12", delta: kpiDeltas.pointsRemoved },
    ],
    [stats, kpiDeltas]
  );

  const loadStats = async (days: RangeOption) => {
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
    const bounds = periodBounds(days);
    const startIso = clampFromStart(bounds.startIso);
    const prevStartIso = clampFromStart(bounds.prevStartIso);
    const prevEndIso = clampFromStart(bounds.prevEndIso);
    const keys = buildWindowKeys(days);
    const dayAgg: Record<string, DailyChartRow> = {};
    keys.forEach((k) => {
      dayAgg[k] = { label: k.slice(5), booked: 0, cancelled: 0, arrived: 0, noShow: 0, pointsAdded: 0, pointsRemoved: 0 };
    });

    // Charger les créneaux du coiffeur (id + horaire + date), pagination par sécurité.
    const slotMap: Record<number, { slot_date: string; start_time: string }> = {};
    const slotIds: number[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error: slotErr } = await supabase
        .from("availability_slots")
        .select("id, slot_date, start_time")
        .eq("created_by", user.id)
        .range(offset, offset + pageSize - 1);
      if (slotErr) {
        setError(slotErr.message);
        return;
      }
      const chunk = (data ?? []) as { id: number; slot_date: string; start_time: string }[];
      chunk.forEach((s) => {
        slotIds.push(s.id);
        slotMap[s.id] = { slot_date: s.slot_date, start_time: s.start_time };
      });
      if (chunk.length < pageSize) break;
      offset += pageSize;
    }

    const { count: totalCustomers, error: customersErr } = await supabase.from("customers").select("*", { head: true, count: "exact" });
    if (customersErr) return void setError(customersErr.message);

    const { count: totalSlots, error: slotsCountErr } = await supabase
      .from("availability_slots")
      .select("*", { head: true, count: "exact" })
      .eq("created_by", user.id);
    if (slotsCountErr) return void setError(slotsCountErr.message);

    let bookedInRange = 0;
    let bookedPrev = 0;
    const weekdayCounts: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};

    if (slotIds.length > 0) {
      const { data: bookingRows, error: bookingErr } = await supabase
        .from("bookings")
        .select("slot_id, created_at")
        .in("slot_id", slotIds)
        .gte("created_at", startIso)
        .lte("created_at", bounds.endIso);
      if (bookingErr) return void setError(bookingErr.message);
      bookedInRange = (bookingRows ?? []).length;
      (bookingRows ?? []).forEach((row) => {
        const r = row as { slot_id: number; created_at: string };
        const key = String(r.created_at ?? "").slice(0, 10);
        if (dayAgg[key]) dayAgg[key].booked += 1;

        const slot = slotMap[r.slot_id];
        if (slot) {
          const [y, m, d] = slot.slot_date.split("-").map(Number);
          const weekday = WEEKDAY_FR[new Date(y, m - 1, d).getDay()];
          const hour = String(slot.start_time).slice(0, 2) + "h";
          weekdayCounts[weekday] = (weekdayCounts[weekday] ?? 0) + 1;
          hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
        }
      });

      const { count: bookedPrevCount, error: bookedPrevErr } = await supabase
        .from("bookings")
        .select("*", { head: true, count: "exact" })
        .in("slot_id", slotIds)
        .gte("created_at", prevStartIso)
        .lte("created_at", prevEndIso);
      if (bookedPrevErr) return void setError(bookedPrevErr.message);
      bookedPrev = Number(bookedPrevCount ?? 0);
    }

    const { data: cancelRows, error: cancelErr } = await supabase
      .from("booking_cancellations")
      .select("slot_id, cancelled_at")
      .eq("cancelled_by", user.id)
      .gte("cancelled_at", startIso)
      .lte("cancelled_at", bounds.endIso);
    if (cancelErr) return void setError(cancelErr.message);
    const cancelledInRange = (cancelRows ?? []).length;
    (cancelRows ?? []).forEach((row) => {
      const key = String((row as { cancelled_at: string }).cancelled_at ?? "").slice(0, 10);
      if (dayAgg[key]) dayAgg[key].cancelled += 1;
    });
    const { count: cancelledPrev, error: cancelledPrevErr } = await supabase
      .from("booking_cancellations")
      .select("*", { head: true, count: "exact" })
      .eq("cancelled_by", user.id)
      .gte("cancelled_at", prevStartIso)
      .lte("cancelled_at", prevEndIso);
    if (cancelledPrevErr) return void setError(cancelledPrevErr.message);

    const { data: outcomeRows, error: outcomeErr } = await supabase
      .from("booking_outcomes")
      .select("slot_id, status, prestation_points, created_at")
      .eq("barber_user_id", user.id)
      .gte("created_at", startIso)
      .lte("created_at", bounds.endIso);
    if (outcomeErr) return void setError(outcomeErr.message);
    let arrivedInRange = 0;
    let noShowInRange = 0;
    const pointBuckets: Record<number, number> = {};
    (outcomeRows ?? []).forEach((row) => {
      const r = row as { slot_id: number; status: "arrived" | "no_show"; prestation_points: number; created_at: string };
      const key = String(r.created_at ?? "").slice(0, 10);
      if (r.status === "arrived") {
        arrivedInRange += 1;
        if (dayAgg[key]) dayAgg[key].arrived += 1;
      } else {
        noShowInRange += 1;
        if (dayAgg[key]) dayAgg[key].noShow += 1;
      }
      const pts = Math.max(0, Number(r.prestation_points || 0));
      if (pts > 0) pointBuckets[pts] = (pointBuckets[pts] ?? 0) + 1;
    });

    const { count: arrivedPrev, error: arrivedPrevErr } = await supabase
      .from("booking_outcomes")
      .select("*", { head: true, count: "exact" })
      .eq("barber_user_id", user.id)
      .eq("status", "arrived")
      .gte("created_at", prevStartIso)
      .lte("created_at", prevEndIso);
    if (arrivedPrevErr) return void setError(arrivedPrevErr.message);
    const { count: noShowPrev, error: noShowPrevErr } = await supabase
      .from("booking_outcomes")
      .select("*", { head: true, count: "exact" })
      .eq("barber_user_id", user.id)
      .eq("status", "no_show")
      .gte("created_at", prevStartIso)
      .lte("created_at", prevEndIso);
    if (noShowPrevErr) return void setError(noShowPrevErr.message);

    const { data: txRows, error: txErr } = await supabase
      .from("transactions")
      .select("points, created_at")
      .eq("barber_user_id", user.id)
      .gte("created_at", startIso)
      .lte("created_at", bounds.endIso);
    if (txErr) return void setError(txErr.message);
    let pointsAdded = 0;
    let pointsRemoved = 0;
    (txRows ?? []).forEach((row) => {
      const r = row as { points: number; created_at: string };
      const p = Number(r.points ?? 0);
      if (p > 0) pointsAdded += p;
      if (p < 0) pointsRemoved += Math.abs(p);
      const dayKey = String(r.created_at ?? "").slice(0, 10);
      if (dayAgg[dayKey]) {
        if (p > 0) dayAgg[dayKey].pointsAdded += p;
        if (p < 0) dayAgg[dayKey].pointsRemoved += Math.abs(p);
      }
    });

    const { data: txPrevRows, error: txPrevErr } = await supabase
      .from("transactions")
      .select("points, created_at")
      .eq("barber_user_id", user.id)
      .gte("created_at", prevStartIso)
      .lte("created_at", prevEndIso);
    if (txPrevErr) return void setError(txPrevErr.message);
    let pointsAddedPrev = 0;
    let pointsRemovedPrev = 0;
    (txPrevRows ?? []).forEach((row) => {
      const p = Number((row as { points: number }).points ?? 0);
      if (p > 0) pointsAddedPrev += p;
      if (p < 0) pointsRemovedPrev += Math.abs(p);
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
      booked: percentDelta(bookedInRange, bookedPrev),
      cancelled: percentDelta(cancelledInRange, Number(cancelledPrev ?? 0)),
      arrived: percentDelta(arrivedInRange, Number(arrivedPrev ?? 0)),
      noShow: percentDelta(noShowInRange, Number(noShowPrev ?? 0)),
      pointsAdded: percentDelta(pointsAdded, pointsAddedPrev),
      pointsRemoved: percentDelta(pointsRemoved, pointsRemovedPrev),
    });

    setStats({
      totalCustomers: Number(totalCustomers ?? 0),
      totalSlots: Number(totalSlots ?? 0),
      bookedInRange,
      cancelledInRange,
      arrivedInRange,
      noShowInRange,
      pointsAdded,
      pointsRemoved,
      showRate: safeRate(arrivedInRange, totalClosed),
      cancelRate: safeRate(cancelledInRange, bookedInRange),
      noShowRate: safeRate(noShowInRange, totalClosed),
      busiestWeekday,
      busiestHour,
      prestationPointBuckets: Object.entries(pointBuckets)
        .map(([points, count]) => ({ points: Number(points), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    });
    setDaily(keys.map((k) => dayAgg[k]));
    setWeeklyBars(weeklyForChart);
    setHourBars(hourlyForChart);
  };

  useEffect(() => {
    const run = async () => {
      await loadStats(rangeDays);
      setLoading(false);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, rangeDays]);

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push("Periode (jours),Valeur");
    lines.push(`${rangeDays},${rangeDays}`);
    lines.push(`Clients enregistres,${stats.totalCustomers}`);
    lines.push(`RDV pris (${rangeDays}j),${stats.bookedInRange}`);
    lines.push(`RDV annules (${rangeDays}j),${stats.cancelledInRange}`);
    lines.push(`Clients venus (${rangeDays}j),${stats.arrivedInRange}`);
    lines.push(`Clients absents (${rangeDays}j),${stats.noShowInRange}`);
    lines.push(`Points ajoutes (${rangeDays}j),${stats.pointsAdded}`);
    lines.push(`Points retires (${rangeDays}j),${stats.pointsRemoved}`);
    lines.push(`Show rate (%),${stats.showRate.toFixed(1)}`);
    lines.push(`Cancel rate (%),${stats.cancelRate.toFixed(1)}`);
    lines.push(`No-show rate (%),${stats.noShowRate.toFixed(1)}`);
    lines.push("");
    lines.push("Jour,RDV pris,RDV annules,Clients venus,Clients absents,Points ajoutes,Points retires");
    daily.forEach((d) => {
      lines.push([csvEscape(d.label), d.booked, d.cancelled, d.arrived, d.noShow, d.pointsAdded, d.pointsRemoved].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats-barber-${rangeDays}j.csv`;
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
                onClick={() => setRangeDays(d)}
                style={{
                  border: d === rangeDays ? "2px solid #111" : "1px solid #d1d5db",
                  borderRadius: "10px",
                  background: d === rangeDays ? "#f3f4f6" : "#fff",
                  padding: "7px 11px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {d}j
              </button>
            ))}
            <button
              type="button"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await loadStats(rangeDays);
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
          Vue business sur {rangeDays} jours, avec statistiques RDV prises en compte a partir du 1 mai 2026.
          Comparaison vs {rangeDays} jours précédents quand disponible.
        </p>
        {error && <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "14px" }}>{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px", marginBottom: "18px" }}>
          {kpiCards.map((kpi) => (
            <div key={kpi.label} style={{ borderRadius: "12px", border: "1px solid #e5e7eb", padding: "12px", background: "#fff" }}>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>{kpi.label}</div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: kpi.accent }}>{kpi.value}</div>
              <div style={{ marginTop: "4px", fontSize: "12px", color: "#6b7280" }}>
                {kpi.delta == null ? "Pas assez d'historique" : `${kpi.delta >= 0 ? "+" : ""}${kpi.delta.toFixed(1)}%`}
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
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Créneaux totaux créés</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#111" }}>{stats.totalSlots}</div>
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

