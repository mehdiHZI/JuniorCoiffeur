"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type DayPoint = { label: string; booked: number; cancelled: number; arrived: number; noShow: number };
type StatsState = {
  totalCustomers: number;
  totalSlots: number;
  activeBookings: number;
  cancelledBookings: number;
  arrivedBookings: number;
  noShowBookings: number;
};

const DAY_WINDOW = 14;

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

export default function BarberStatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsState>({
    totalCustomers: 0,
    totalSlots: 0,
    activeBookings: 0,
    cancelledBookings: 0,
    arrivedBookings: 0,
    noShowBookings: 0,
  });
  const [daily, setDaily] = useState<DayPoint[]>([]);

  const kpiCards = useMemo(
    () => [
      { label: "Clients enregistrés", value: stats.totalCustomers, accent: "#111827" },
      { label: "RDV pris (total)", value: stats.activeBookings + stats.cancelledBookings + stats.arrivedBookings + stats.noShowBookings, accent: "#0f766e" },
      { label: "RDV en attente", value: stats.activeBookings, accent: "#1d4ed8" },
      { label: "RDV annulés", value: stats.cancelledBookings, accent: "#b91c1c" },
      { label: "Clients venus", value: stats.arrivedBookings, accent: "#166534" },
      { label: "Clients absents", value: stats.noShowBookings, accent: "#92400e" },
    ],
    [stats]
  );

  const loadStats = async () => {
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

    const slotIds: number[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error: slotErr } = await supabase
        .from("availability_slots")
        .select("id")
        .eq("created_by", user.id)
        .range(offset, offset + pageSize - 1);
      if (slotErr) {
        setError(slotErr.message);
        return;
      }
      const chunk = (data ?? []) as { id: number }[];
      slotIds.push(...chunk.map((s) => s.id));
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

    let activeBookings = 0;
    if (slotIds.length > 0) {
      const { count: activeCount, error: activeErr } = await supabase
        .from("bookings")
        .select("*", { head: true, count: "exact" })
        .in("slot_id", slotIds);
      if (activeErr) return void setError(activeErr.message);
      activeBookings = Number(activeCount ?? 0);
    }

    const { count: cancelledCount, error: cancelledErr } = await supabase
      .from("booking_cancellations")
      .select("*", { head: true, count: "exact" })
      .eq("cancelled_by", user.id);
    if (cancelledErr) return void setError(cancelledErr.message);

    const { count: arrivedCount, error: arrivedErr } = await supabase
      .from("booking_outcomes")
      .select("*", { head: true, count: "exact" })
      .eq("barber_user_id", user.id)
      .eq("status", "arrived");
    if (arrivedErr) return void setError(arrivedErr.message);

    const { count: noShowCount, error: noShowErr } = await supabase
      .from("booking_outcomes")
      .select("*", { head: true, count: "exact" })
      .eq("barber_user_id", user.id)
      .eq("status", "no_show");
    if (noShowErr) return void setError(noShowErr.message);

    const windowKeys = buildWindowKeys(DAY_WINDOW);
    const since = `${windowKeys[0]}T00:00:00.000Z`;
    const dayAgg: Record<string, DayPoint> = {};
    windowKeys.forEach((k) => (dayAgg[k] = { label: k.slice(5), booked: 0, cancelled: 0, arrived: 0, noShow: 0 }));

    if (slotIds.length > 0) {
      const { data: bookingRows, error: bookingRowsErr } = await supabase
        .from("bookings")
        .select("created_at")
        .in("slot_id", slotIds)
        .gte("created_at", since);
      if (bookingRowsErr) return void setError(bookingRowsErr.message);
      (bookingRows ?? []).forEach((row) => {
        const key = String((row as { created_at: string }).created_at ?? "").slice(0, 10);
        if (dayAgg[key]) dayAgg[key].booked += 1;
      });
    }

    const { data: cancelRows, error: cancelRowsErr } = await supabase
      .from("booking_cancellations")
      .select("cancelled_at")
      .eq("cancelled_by", user.id)
      .gte("cancelled_at", since);
    if (cancelRowsErr) return void setError(cancelRowsErr.message);
    (cancelRows ?? []).forEach((row) => {
      const key = String((row as { cancelled_at: string }).cancelled_at ?? "").slice(0, 10);
      if (dayAgg[key]) dayAgg[key].cancelled += 1;
    });

    const { data: outcomeRows, error: outcomeRowsErr } = await supabase
      .from("booking_outcomes")
      .select("status, created_at")
      .eq("barber_user_id", user.id)
      .gte("created_at", since);
    if (outcomeRowsErr) return void setError(outcomeRowsErr.message);
    (outcomeRows ?? []).forEach((row) => {
      const r = row as { status: "arrived" | "no_show"; created_at: string };
      const key = String(r.created_at ?? "").slice(0, 10);
      if (!dayAgg[key]) return;
      if (r.status === "arrived") dayAgg[key].arrived += 1;
      if (r.status === "no_show") dayAgg[key].noShow += 1;
    });

    setStats({
      totalCustomers: Number(totalCustomers ?? 0),
      totalSlots: Number(totalSlots ?? 0),
      activeBookings,
      cancelledBookings: Number(cancelledCount ?? 0),
      arrivedBookings: Number(arrivedCount ?? 0),
      noShowBookings: Number(noShowCount ?? 0),
    });
    setDaily(windowKeys.map((k) => dayAgg[k]));
  };

  useEffect(() => {
    const run = async () => {
      await loadStats();
      setLoading(false);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const maxForGraph = Math.max(1, ...daily.map((d) => Math.max(d.booked, d.cancelled, d.arrived, d.noShow)));

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };
  const cardStyle: React.CSSProperties = {
    maxWidth: "860px",
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
          <button
            type="button"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await loadStats();
              setRefreshing(false);
            }}
            style={{ border: "1px solid #d1d5db", borderRadius: "10px", background: "#fff", padding: "8px 12px", fontSize: "13px", cursor: refreshing ? "not-allowed" : "pointer" }}
          >
            {refreshing ? "Actualisation..." : "Actualiser"}
          </button>
        </div>

        <p style={{ fontSize: "13px", color: "#6b7280", marginTop: 0, marginBottom: "18px" }}>
          Vue synthétique. Requêtes optimisées en comptage pour limiter la consommation.
        </p>
        {error && <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "14px" }}>{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "18px" }}>
          {kpiCards.map((kpi) => (
            <div key={kpi.label} style={{ borderRadius: "12px", border: "1px solid #e5e7eb", padding: "12px", background: "#fff" }}>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>{kpi.label}</div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: kpi.accent }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "14px" }}>
          <h2 style={{ fontSize: "15px", margin: "0 0 12px", color: "#111" }}>Activité des 14 derniers jours</h2>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${daily.length}, minmax(40px, 1fr))`, gap: "8px", minWidth: "640px" }}>
              {daily.map((d) => (
                <div key={d.label} style={{ textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "end", gap: "2px", height: "110px", marginBottom: "6px" }}>
                    <div title={`Pris: ${d.booked}`} style={{ width: "7px", height: `${Math.max(4, (d.booked / maxForGraph) * 100)}px`, background: "#0f766e", borderRadius: "4px 4px 0 0" }} />
                    <div title={`Annulés: ${d.cancelled}`} style={{ width: "7px", height: `${Math.max(4, (d.cancelled / maxForGraph) * 100)}px`, background: "#b91c1c", borderRadius: "4px 4px 0 0" }} />
                    <div title={`Venus: ${d.arrived}`} style={{ width: "7px", height: `${Math.max(4, (d.arrived / maxForGraph) * 100)}px`, background: "#166534", borderRadius: "4px 4px 0 0" }} />
                    <div title={`Absents: ${d.noShow}`} style={{ width: "7px", height: `${Math.max(4, (d.noShow / maxForGraph) * 100)}px`, background: "#92400e", borderRadius: "4px 4px 0 0" }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px", fontSize: "12px", color: "#4b5563" }}>
            <span>■ Pris</span>
            <span>■ Annulés</span>
            <span>■ Venus</span>
            <span>■ Absents</span>
          </div>
        </div>
      </div>
    </div>
  );
}

