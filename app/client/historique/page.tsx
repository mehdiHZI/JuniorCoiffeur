"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useClientRealtime } from "../ClientRealtimeContext";

type HistoryVisit = {
  kind: "visit";
  id: number;
  created_at: string;
  points: number | null;
};

type HistoryBooking = {
  kind: "booking";
  id: number;
  created_at: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  prestationTitle: string | null;
  barberName: string;
};

type HistoryItem = HistoryVisit | HistoryBooking;

function firstRel<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function formatAppointmentShort(slotDate: string, startTime: string): string {
  const [y, m, d] = slotDate.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const hm = String(startTime).slice(0, 5);
  return `${label} · ${hm}`;
}

export default function ClientHistoriquePage() {
  const router = useRouter();
  const { transactionUpdateVersion } = useClientRealtime();
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(async (cid: string) => {
    const [{ data: txRows }, { data: bookingRows }] = await Promise.all([
      supabase.from("transactions").select("id, created_at, points").eq("customer_id", cid).order("created_at", { ascending: false }),
      supabase
        .from("bookings")
        .select(
          "id, created_at, prestations ( title ), availability_slots ( slot_date, start_time, end_time, created_by )"
        )
        .eq("customer_id", cid)
        .order("created_at", { ascending: false }),
    ]);

    const visits: HistoryVisit[] = (txRows ?? []).map((r) => ({
      kind: "visit" as const,
      id: (r as { id: number }).id,
      created_at: (r as { created_at: string }).created_at,
      points: (r as { points: number | null }).points,
    }));

    type BRow = {
      id: number;
      created_at: string;
      prestations: { title: string } | { title: string }[] | null;
      availability_slots:
        | { slot_date: string; start_time: string; end_time: string; created_by: string }
        | { slot_date: string; start_time: string; end_time: string; created_by: string }[]
        | null;
    };

    const partial = (bookingRows ?? [])
      .map((raw) => {
        const b = raw as BRow;
        const slot = firstRel(b.availability_slots);
        if (!slot) return null;
        const prest = firstRel(b.prestations);
        return {
          id: b.id,
          created_at: b.created_at,
          slotDate: slot.slot_date,
          startTime: slot.start_time,
          endTime: slot.end_time,
          barberUserId: slot.created_by,
          prestationTitle: prest?.title ?? null,
        };
      })
      .filter(Boolean) as {
      id: number;
      created_at: string;
      slotDate: string;
      startTime: string;
      endTime: string;
      barberUserId: string;
      prestationTitle: string | null;
    }[];

    const barberIds = [...new Set(partial.map((p) => p.barberUserId))];
    const barberNameById: Record<string, string> = {};
    if (barberIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", barberIds);
      (profiles ?? []).forEach((p) => {
        const pid = (p as { id: string }).id;
        const fn = (p as { first_name: string | null }).first_name ?? "";
        const ln = (p as { last_name: string | null }).last_name ?? "";
        barberNameById[pid] = `${fn} ${ln}`.trim() || "Coiffeur";
      });
    }

    const bookings: HistoryBooking[] = partial.map((p) => ({
      kind: "booking" as const,
      id: p.id,
      created_at: p.created_at,
      slotDate: p.slotDate,
      startTime: p.startTime,
      endTime: p.endTime,
      prestationTitle: p.prestationTitle,
      barberName: barberNameById[p.barberUserId] ?? "Coiffeur",
    }));

    const merged = [...visits, ...bookings].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setItems(merged);
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push("/auth");
        return;
      }

      const { data: customer, error: customerErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (customerErr || !customer) {
        setLoading(false);
        return;
      }

      const cid = (customer as { id: string }).id;
      setCustomerId(cid);
      await loadHistory(cid);
      setLoading(false);
    };

    void run();
  }, [router, loadHistory]);

  useEffect(() => {
    if (!customerId || transactionUpdateVersion === 0) return;
    void loadHistory(customerId);
  }, [customerId, transactionUpdateVersion, loadHistory]);

  useEffect(() => {
    if (!customerId) return;
    const channel = supabase
      .channel(`client-bookings-history-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `customer_id=eq.${customerId}`,
        },
        () => {
          void loadHistory(customerId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customerId, loadHistory]);

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "480px",
    backgroundColor: "#ffffff",
    padding: "28px 24px",
    borderRadius: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 600,
            marginBottom: "6px",
            color: "#111",
          }}
        >
          Historique
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#4b5563",
            marginTop: "4px",
            marginBottom: "20px",
            lineHeight: 1.5,
          }}
        >
          Tes passages au salon (points) et tes réservations en ligne apparaissent ici, du plus récent au plus ancien.
        </p>

        {items.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Aucune activité pour le moment.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((row) =>
              row.kind === "visit" ? (
                <li
                  key={`v-${row.id}`}
                  style={{
                    fontSize: "14px",
                    color: "#374151",
                    padding: "12px 0",
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <span>
                    {new Date(row.created_at).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <span style={{ display: "block", fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                      Visite (scan QR)
                    </span>
                  </span>
                  <span style={{ fontWeight: 600, color: "#111", whiteSpace: "nowrap" }}>
                    {row.points == null ? "—" : `${row.points > 0 ? "+" : ""}${row.points} pts`}
                  </span>
                </li>
              ) : (
                <li
                  key={`b-${row.id}`}
                  style={{
                    fontSize: "14px",
                    color: "#374151",
                    padding: "12px 0",
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    {new Date(row.created_at).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <span style={{ display: "block", fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                      Réservation en ligne
                    </span>
                    <span style={{ display: "block", fontSize: "13px", color: "#374151", marginTop: "6px" }}>
                      {row.barberName}
                      {row.prestationTitle ? ` · ${row.prestationTitle}` : ""}
                    </span>
                    <span style={{ display: "block", fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                      RDV : {formatAppointmentShort(row.slotDate, row.startTime)} – {String(row.endTime).slice(0, 5)}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#1d4ed8",
                      backgroundColor: "#eff6ff",
                      padding: "4px 8px",
                      borderRadius: "8px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Résa
                  </span>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
