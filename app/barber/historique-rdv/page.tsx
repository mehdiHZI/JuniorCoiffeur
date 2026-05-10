"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OutcomeRow = {
  id: number;
  status: "arrived" | "no_show";
  prestation_points: number;
  prestation_title: string | null;
  slot_date: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  customer_id: string;
};

type CancellationRow = {
  id: number;
  customer_id: string;
  cancelled_at: string;
  cancel_reason: string | null;
  prestation_title: string | null;
  slot_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

type HistOutcome = OutcomeRow & {
  kind: "outcome";
  firstName: string;
  lastName: string;
};

type HistCancellation = CancellationRow & {
  kind: "cancellation";
  firstName: string;
  lastName: string;
};

type HistRow = HistOutcome | HistCancellation;

function formatDateHeading(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function displayIsoDateRow(r: HistRow): string {
  if (r.kind === "outcome") {
    return (r.slot_date && String(r.slot_date).trim()) || String(r.created_at ?? "").slice(0, 10);
  }
  return (r.slot_date && String(r.slot_date).trim()) || String(r.cancelled_at ?? "").slice(0, 10);
}

function formatTimeRange(start: string | null, end: string | null): string {
  const s = start ? String(start).slice(0, 5) : "—";
  const e = end ? String(end).slice(0, 5) : "—";
  if (s === "—" && e === "—") return "";
  return `${s} – ${e}`;
}

async function mapCustomersToNames(customerIds: string[]) {
  const firstMap: Record<string, string> = {};
  const lastMap: Record<string, string> = {};
  const uniq = [...new Set(customerIds)];
  if (uniq.length === 0) return { firstMap, lastMap };

  const { data: customers } = await supabase.from("customers").select("id, user_id").in("id", uniq);
  const uidByCust: Record<string, string> = {};
  (customers ?? []).forEach((c) => {
    uidByCust[(c as { id: string }).id] = (c as { user_id: string }).user_id;
  });
  const userIds = [...new Set(Object.values(uidByCust))];
  if (userIds.length === 0) return { firstMap, lastMap };

  const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds);
  const profByUser: Record<string, { fn: string; ln: string }> = {};
  (profiles ?? []).forEach((p) => {
    const id = (p as { id: string }).id;
    profByUser[id] = {
      fn: (p as { first_name: string | null }).first_name ?? "",
      ln: (p as { last_name: string | null }).last_name ?? "",
    };
  });
  uniq.forEach((cid) => {
    const uid = uidByCust[cid];
    const pr = uid ? profByUser[uid] : undefined;
    firstMap[cid] = pr?.fn ?? "";
    lastMap[cid] = pr?.ln ?? "";
  });
  return { firstMap, lastMap };
}

export default function BarberHistoriqueRdvPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HistRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
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

    const outcomesRaw: OutcomeRow[] = [];
    let offset = 0;
    const pageSize = 500;
    while (true) {
      const { data, error: qErr } = await supabase
        .from("booking_outcomes")
        .select("id, status, prestation_points, prestation_title, slot_date, start_time, end_time, created_at, customer_id")
        .eq("barber_user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }
      const chunk = (data ?? []) as OutcomeRow[];
      outcomesRaw.push(...chunk);
      if (chunk.length < pageSize) break;
      offset += pageSize;
    }

    const cancellationsRaw: CancellationRow[] = [];
    offset = 0;
    while (true) {
      const { data, error: cErr } = await supabase
        .from("booking_cancellations")
        .select("id, customer_id, cancelled_at, cancel_reason, prestation_title, slot_date, start_time, end_time")
        .eq("cancelled_by", user.id)
        .order("cancelled_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (cErr) {
        setError(cErr.message);
        setLoading(false);
        return;
      }
      const chunk = (data ?? []) as CancellationRow[];
      cancellationsRaw.push(...chunk);
      if (chunk.length < pageSize) break;
      offset += pageSize;
    }

    const allCust = [...new Set([...outcomesRaw.map((r) => r.customer_id), ...cancellationsRaw.map((r) => r.customer_id)])];
    const { firstMap, lastMap } = await mapCustomersToNames(allCust);

    const outcomeRows: HistOutcome[] = outcomesRaw.map((r) => ({
      ...r,
      kind: "outcome" as const,
      firstName: firstMap[r.customer_id] ?? "",
      lastName: lastMap[r.customer_id] ?? "",
    }));

    const cancelRows: HistCancellation[] = cancellationsRaw.map((r) => ({
      ...r,
      kind: "cancellation" as const,
      firstName: firstMap[r.customer_id] ?? "",
      lastName: lastMap[r.customer_id] ?? "",
    }));

    const merged: HistRow[] = [...outcomeRows, ...cancelRows];
    merged.sort((a, b) => {
      const da = displayIsoDateRow(a);
      const db = displayIsoDateRow(b);
      const c = db.localeCompare(da);
      if (c !== 0) return c;
      const ta = a.kind === "outcome" ? String(a.start_time ?? "") : String(a.start_time ?? "");
      const tb = b.kind === "outcome" ? String(b.start_time ?? "") : String(b.start_time ?? "");
      return tb.localeCompare(ta);
    });

    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [router]);

  const grouped = useMemo(() => {
    const m = new Map<string, HistRow[]>();
    for (const r of rows) {
      const key = displayIsoDateRow(r);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const containerStyle: CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: CSSProperties = {
    maxWidth: "720px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    padding: "28px 24px",
    borderRadius: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>Chargement de l&apos;historique...</div>
      </div>
    );
  }

  const sqlHint =
    error &&
    (error.includes("column") || error.includes("slot_date") || error.includes("prestation_title") || error.includes("does not exist"));

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "8px", color: "#111" }}>Historique des RDV</h1>
        <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "16px", lineHeight: 1.5 }}>
          Confirmations <strong>client venu / absent</strong>, et réservations <strong>annulées par toi</strong> (salon).
          Classement par <strong>date du créneau</strong>.
        </p>
        {error && (
          <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "12px" }}>
            {error}
            {sqlHint ? (
              <>
                {" "}
                — exécute dans Supabase les scripts{" "}
                <code style={{ fontSize: "12px" }}>patch-booking-outcomes-preserve-history.sql</code> et{" "}
                <code style={{ fontSize: "12px" }}>patch-booking-cancellations-snapshot.sql</code>.
              </>
            ) : null}
          </p>
        )}

        {rows.length === 0 && !error ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            Aucune entrée pour l&apos;instant : confirme un passage depuis « Rendez-vous à venir », ou annule une réservation
            depuis ton planning.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {grouped.map(([isoDate, list]) => (
              <section key={isoDate}>
                <h2
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "#111",
                    marginBottom: "12px",
                    paddingBottom: "8px",
                    borderBottom: "2px solid rgba(185, 147, 47, 0.35)",
                    textTransform: "capitalize",
                  }}
                >
                  {formatDateHeading(isoDate)}
                </h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#6b7280", fontSize: "12px" }}>
                        <th style={{ padding: "8px 10px 8px 0", fontWeight: 600 }}>Prénom</th>
                        <th style={{ padding: "8px 10px", fontWeight: 600 }}>Nom</th>
                        <th style={{ padding: "8px 10px", fontWeight: 600 }}>Prestation</th>
                        <th style={{ padding: "8px 10px", fontWeight: 600 }}>Créneau</th>
                        <th style={{ padding: "8px 0 8px 10px", fontWeight: 600 }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => {
                        if (r.kind === "outcome") {
                          const prest =
                            r.prestation_title?.trim() ||
                            (r.prestation_points > 0 ? `${r.prestation_points} pts` : "—");
                          const statusLabel = r.status === "arrived" ? "Venu" : "Absent";
                          const statusStyle =
                            r.status === "arrived"
                              ? { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" }
                              : { bg: "#fee2e2", color: "#b91c1c", border: "#fecaca" };
                          const timeLabel = formatTimeRange(r.start_time, r.end_time);
                          return (
                            <tr key={`outcome-${r.id}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "10px 10px 10px 0", color: "#111" }}>{r.firstName || "—"}</td>
                              <td style={{ padding: "10px", color: "#111" }}>{r.lastName || "—"}</td>
                              <td style={{ padding: "10px", color: "#374151" }}>{prest}</td>
                              <td style={{ padding: "10px", color: "#6b7280", fontSize: "13px", whiteSpace: "nowrap" }}>
                                {timeLabel || "—"}
                              </td>
                              <td style={{ padding: "10px 0 10px 10px" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    padding: "4px 10px",
                                    borderRadius: "9999px",
                                    backgroundColor: statusStyle.bg,
                                    color: statusStyle.color,
                                    border: `1px solid ${statusStyle.border}`,
                                  }}
                                >
                                  {statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        }

                        const prest = r.prestation_title?.trim() || "—";
                        const timeLabel = formatTimeRange(r.start_time, r.end_time);
                        return (
                          <tr key={`cancel-${r.id}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "10px 10px 10px 0", color: "#111" }}>{r.firstName || "—"}</td>
                            <td style={{ padding: "10px", color: "#111" }}>{r.lastName || "—"}</td>
                            <td style={{ padding: "10px", color: "#374151", verticalAlign: "top" }}>
                              <div>{prest}</div>
                              {r.cancel_reason?.trim() ? (
                                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                                  Motif : {r.cancel_reason.trim()}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ padding: "10px", color: "#6b7280", fontSize: "13px", whiteSpace: "nowrap" }}>
                              {timeLabel || "—"}
                            </td>
                            <td style={{ padding: "10px 0 10px 10px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  padding: "4px 10px",
                                  borderRadius: "9999px",
                                  backgroundColor: "#fef3c7",
                                  color: "#92400e",
                                  border: "1px solid #fcd34d",
                                }}
                              >
                                Annulé (salon)
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
