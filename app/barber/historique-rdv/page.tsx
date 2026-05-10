"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { addDaysToYmd, clampHistoryFilter, toDateKey } from "@/lib/barberPeriod";
import {
  fetchAllCancellationsForBarber,
  fetchAllOutcomesForBarber,
  fetchCancellationsByEffDateRange,
  fetchOutcomesByEffDateRange,
} from "@/lib/bookingEffRangeFetch";

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

/** Date du créneau (jour + date) + plage horaire, comme demandé pour la colonne Créneau. */
function formatCreneauCell(isoYmd: string, start: string | null, end: string | null): string {
  const datePart = formatDateHeading(isoYmd);
  const timePart = formatTimeRange(start, end);
  if (!timePart) return datePart;
  return `${datePart} · ${timePart}`;
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

function rollingRange(days: number): { fromYmd: string; toYmd: string } {
  const toYmd = toDateKey(new Date());
  const fromYmd = addDaysToYmd(toYmd, -(days - 1));
  return { fromYmd, toYmd };
}

type LoadedScope = "all" | { fromYmd: string; toYmd: string };

const SEL_OUTCOME_HIST =
  "id, status, prestation_points, prestation_title, slot_date, start_time, end_time, created_at, customer_id";
const SEL_CANCEL_HIST =
  "id, customer_id, cancelled_at, cancel_reason, prestation_title, slot_date, start_time, end_time";

export default function BarberHistoriqueRdvPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HistRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Ce qui est réellement chargé depuis Supabase (pas un simple filtre client). */
  const [loadedScope, setLoadedScope] = useState<LoadedScope>({ ...rollingRange(30) });
  const todayYmd = toDateKey(new Date());
  const [draftFrom, setDraftFrom] = useState(() => addDaysToYmd(todayYmd, -29));
  const [draftTo, setDraftTo] = useState(() => todayYmd);
  const [filterError, setFilterError] = useState<string | null>(null);

  const loadHistory = async (scope: LoadedScope) => {
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

    setLoading(true);
    setError(null);

    let outcomesRaw: OutcomeRow[] = [];
    let cancellationsRaw: CancellationRow[] = [];

    if (scope === "all") {
      const o = await fetchAllOutcomesForBarber<OutcomeRow>(supabase, user.id, SEL_OUTCOME_HIST);
      if (o.error) {
        setError(o.error);
        setLoading(false);
        return;
      }
      const c = await fetchAllCancellationsForBarber<CancellationRow>(supabase, user.id, SEL_CANCEL_HIST);
      if (c.error) {
        setError(c.error);
        setLoading(false);
        return;
      }
      outcomesRaw = o.data;
      cancellationsRaw = c.data;
    } else {
      const o = await fetchOutcomesByEffDateRange<OutcomeRow>(supabase, {
        barberUserId: user.id,
        fromYmd: scope.fromYmd,
        toYmd: scope.toYmd,
        select: SEL_OUTCOME_HIST,
      });
      if (o.error) {
        setError(o.error);
        setLoading(false);
        return;
      }
      const c = await fetchCancellationsByEffDateRange<CancellationRow>(supabase, {
        cancelledBy: user.id,
        fromYmd: scope.fromYmd,
        toYmd: scope.toYmd,
        select: SEL_CANCEL_HIST,
      });
      if (c.error) {
        setError(c.error);
        setLoading(false);
        return;
      }
      outcomesRaw = o.data;
      cancellationsRaw = c.data;
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
    setLoadedScope(scope);
    setLoading(false);
  };

  useEffect(() => {
    void loadHistory({ ...rollingRange(30) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const applyCustomRange = () => {
    const c = clampHistoryFilter(draftFrom, draftTo);
    if ("error" in c) {
      setFilterError(c.error);
      return;
    }
    setFilterError(null);
    void loadHistory({ fromYmd: c.from, toYmd: c.to });
  };

  const scopeMatchesRolling = (days: number) => {
    if (loadedScope === "all") return false;
    const r = rollingRange(days);
    return loadedScope.fromYmd === r.fromYmd && loadedScope.toYmd === r.toYmd;
  };

  const containerStyle: CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: CSSProperties = {
    maxWidth: "920px",
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
        <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "12px", lineHeight: 1.5 }}>
          Confirmations <strong>client venu / absent</strong>, et réservations <strong>annulées par toi</strong> (salon).
          Classement par <strong>date du créneau</strong>. Par défaut seuls les <strong>30 derniers jours</strong> sont chargés
          depuis la base ; utilise <strong>Tout</strong> uniquement si tu as besoin de tout l&apos;historique.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            alignItems: "center",
            marginBottom: "14px",
            padding: "12px",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            background: "#fafafa",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Période :</span>
          <button
            type="button"
            onClick={() => {
              setFilterError(null);
              void loadHistory("all");
            }}
            style={{
              border: loadedScope === "all" ? "2px solid #111" : "1px solid #d1d5db",
              borderRadius: "10px",
              background: "#fff",
              padding: "6px 11px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Tout
          </button>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setFilterError(null);
                void loadHistory(rollingRange(d));
              }}
              style={{
                border: scopeMatchesRolling(d) ? "2px solid #111" : "1px solid #d1d5db",
                borderRadius: "10px",
                background: "#fff",
                padding: "6px 11px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {d} jours
            </button>
          ))}
          <span style={{ fontSize: "13px", color: "#6b7280" }}>ou du</span>
          <input
            type="date"
            value={draftFrom}
            max={draftTo}
            onChange={(e) => setDraftFrom(e.target.value)}
            style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "6px 10px", fontSize: "13px" }}
          />
          <span style={{ fontSize: "13px", color: "#6b7280" }}>au</span>
          <input
            type="date"
            value={draftTo}
            min={draftFrom}
            max={todayYmd}
            onChange={(e) => setDraftTo(e.target.value)}
            style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "6px 10px", fontSize: "13px" }}
          />
          <button
            type="button"
            onClick={applyCustomRange}
            style={{ border: "1px solid #d1d5db", borderRadius: "10px", background: "#fff", padding: "6px 12px", fontSize: "13px", cursor: "pointer" }}
          >
            Appliquer
          </button>
          {loadedScope === "all" ? (
            <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "4px" }}>
              (toute la base — charge plus de données)
            </span>
          ) : (
            <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "4px" }}>
              (chargé : {loadedScope.fromYmd} → {loadedScope.toYmd})
            </span>
          )}
        </div>
        {filterError && <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "10px" }}>{filterError}</p>}

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

        {rows.length === 0 && !error && loadedScope === "all" ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            Aucune entrée pour l&apos;instant : confirme un passage depuis « Rendez-vous à venir », ou annule une réservation
            depuis ton planning.
          </p>
        ) : rows.length === 0 && !error && loadedScope !== "all" ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            Aucun rendez-vous dans la période chargée. Élargis les dates ou clique sur « Tout » pour parcourir tout l&apos;historique.
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
                          const creneauLabel = formatCreneauCell(displayIsoDateRow(r), r.start_time, r.end_time);
                          return (
                            <tr key={`outcome-${r.id}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "10px 10px 10px 0", color: "#111" }}>{r.firstName || "—"}</td>
                              <td style={{ padding: "10px", color: "#111" }}>{r.lastName || "—"}</td>
                              <td style={{ padding: "10px", color: "#374151" }}>{prest}</td>
                              <td style={{ padding: "10px", color: "#6b7280", fontSize: "13px", maxWidth: "280px", lineHeight: 1.35 }}>
                                {creneauLabel}
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
                        const creneauLabel = formatCreneauCell(displayIsoDateRow(r), r.start_time, r.end_time);
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
                            <td style={{ padding: "10px", color: "#6b7280", fontSize: "13px", maxWidth: "280px", lineHeight: 1.35 }}>
                              {creneauLabel}
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
