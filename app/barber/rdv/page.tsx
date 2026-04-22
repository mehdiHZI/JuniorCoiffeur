"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { parsePlaceImageUrls } from "@/lib/placeImageUrls";

type RdvRow = {
  id: number;
  slot_id: number;
  customer_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  address: string | null;
  place_image_urls: string[];
  clientName: string;
  clientPhone: string;
  prestationTitle: string | null;
  prestationPoints: number;
};

export default function BarberRdvPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<RdvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelModalRdv, setCancelModalRdv] = useState<RdvRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [processingBookingId, setProcessingBookingId] = useState<number | null>(null);

  const loadRdv = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.push("/auth");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if ((profile as { role?: string } | null)?.role !== "barber") {
      router.push("/barber");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: slots, error: slotsErr } = await supabase
      .from("availability_slots")
      .select("id, slot_date, start_time, end_time, address, place_image_urls")
      .eq("created_by", authData.user.id)
      .gte("slot_date", today)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (slotsErr || !slots?.length) {
      setList([]);
      setLoading(false);
      return;
    }

    const slotIds = (slots as { id: number }[]).map((s) => s.id);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, slot_id, customer_id, prestation_id")
      .in("slot_id", slotIds);

    if (!bookings?.length) {
      setList([]);
      setLoading(false);
      return;
    }

    const slotMap: Record<
      number,
      { slot_date: string; start_time: string; end_time: string; address: string | null; place_image_urls: string[] }
    > = {};
    (slots as { id: number; slot_date: string; start_time: string; end_time: string; address: string | null; place_image_urls?: unknown }[]).forEach((s) => {
      slotMap[s.id] = {
        slot_date: s.slot_date,
        start_time: s.start_time,
        end_time: s.end_time,
        address: s.address ?? null,
        place_image_urls: parsePlaceImageUrls(s.place_image_urls),
      };
    });

    const customerIds = [...new Set((bookings as { customer_id: string }[]).map((b) => b.customer_id))];
    const { data: customers } = await supabase
      .from("customers")
      .select("id, user_id")
      .in("id", customerIds);

    const userIds = (customers ?? [])
      .map((c) => (c as { user_id: string }).user_id)
      .filter(Boolean) as string[];

    if (userIds.length === 0) {
      setList([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone")
      .in("id", userIds);

    const userToInfo: Record<string, { name: string; phone: string }> = {};
    (profiles ?? []).forEach((p) => {
      const pid = (p as { id: string }).id;
      const fn = (p as { first_name: string | null }).first_name ?? "";
      const ln = (p as { last_name: string | null }).last_name ?? "";
      const name = `${fn} ${ln}`.trim() || "Client";
      const phone = (p as { phone: string | null }).phone ?? "";
      userToInfo[pid] = { name, phone };
    });

    const customerToUser: Record<string, string> = {};
    (customers ?? []).forEach((c) => {
      const cid = (c as { id: string }).id;
      const uid = (c as { user_id: string }).user_id;
      customerToUser[cid] = uid;
    });

    const prestationIds = [...new Set((bookings as { prestation_id: number | null }[]).map((b) => b.prestation_id).filter(Boolean))] as number[];
    let prestationMap: Record<number, { title: string; points: number }> = {};
    if (prestationIds.length > 0) {
      const { data: prestations } = await supabase
        .from("prestations")
        .select("id, title, price_points")
        .in("id", prestationIds);
      (prestations ?? []).forEach((p) => {
        const id = (p as { id: number }).id;
        prestationMap[id] = {
          title: (p as { title: string }).title,
          points: Number((p as { price_points: number | null }).price_points ?? 0),
        };
      });
    }

    const rows: RdvRow[] = (bookings as { id: number; slot_id: number; customer_id: string; prestation_id: number | null }[]).map((b) => {
      const slot = slotMap[b.slot_id];
      const userInfo = userToInfo[customerToUser[b.customer_id]];
      return {
        id: b.id,
        slot_id: b.slot_id,
        customer_id: b.customer_id,
        slot_date: slot?.slot_date ?? "",
        start_time: slot?.start_time ?? "",
        end_time: slot?.end_time ?? "",
        address: slot?.address ?? null,
        place_image_urls: slot?.place_image_urls ?? [],
        clientName: userInfo?.name ?? "Client",
        clientPhone: userInfo?.phone ?? "",
        prestationTitle: b.prestation_id ? (prestationMap[b.prestation_id]?.title ?? null) : null,
        prestationPoints: b.prestation_id ? (prestationMap[b.prestation_id]?.points ?? 0) : 0,
      };
    });

    rows.sort((a, b) => {
      const d = a.slot_date.localeCompare(b.slot_date);
      if (d !== 0) return d;
      return String(a.start_time).localeCompare(String(b.start_time));
    });

    setList(rows);
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await loadRdv();
    };

    run();
  }, [router]);

  const handleCancelRdv = async () => {
    if (!cancelModalRdv) return;
    setCancelling(true);
    setError(null);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setCancelling(false);
      return;
    }
    const { error: insertErr } = await supabase.from("booking_cancellations").insert({
      slot_id: cancelModalRdv.slot_id,
      customer_id: cancelModalRdv.customer_id,
      cancel_reason: cancelReason.trim() || null,
      cancelled_by: authData.user.id,
    });
    if (insertErr) {
      setError(insertErr.message);
      setCancelling(false);
      return;
    }
    const { error: deleteErr } = await supabase.from("bookings").delete().eq("id", cancelModalRdv.id);
    if (deleteErr) {
      setError(deleteErr.message);
      setCancelling(false);
      return;
    }
    setCancelModalRdv(null);
    setCancelReason("");
    await loadRdv();
    setCancelling(false);
  };

  const handleMarkAttendance = async (rdv: RdvRow, status: "arrived" | "no_show") => {
    setProcessingBookingId(rdv.id);
    setError(null);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setProcessingBookingId(null);
      return;
    }

    const points = Math.max(0, Number(rdv.prestationPoints || 0));
    const signedPoints = status === "arrived" ? points : -points;

    const { error: outcomeErr } = await supabase.from("booking_outcomes").insert({
      booking_id: rdv.id,
      slot_id: rdv.slot_id,
      customer_id: rdv.customer_id,
      barber_user_id: user.id,
      prestation_points: points,
      status,
    });
    if (outcomeErr) {
      setError(outcomeErr.message);
      setProcessingBookingId(null);
      return;
    }

    if (signedPoints !== 0) {
      const { error: txErr } = await supabase.from("transactions").insert({
        customer_id: rdv.customer_id,
        points: signedPoints,
        barber_user_id: user.id,
        shop_item_id: null,
      });
      if (txErr) {
        setError(txErr.message);
        setProcessingBookingId(null);
        return;
      }
    }

    const { error: deleteErr } = await supabase.from("bookings").delete().eq("id", rdv.id);
    if (deleteErr) {
      setError(deleteErr.message);
      setProcessingBookingId(null);
      return;
    }

    await loadRdv();
    setProcessingBookingId(null);
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: "520px",
    margin: "0 auto",
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
        <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: "8px", color: "#111" }}>
          Rendez-vous à venir
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
          Liste des réservations à venir, classées par date et heure.
        </p>

        {error && <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "12px" }}>{error}</p>}

        {list.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Aucun rendez-vous à venir.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {list.map((rdv) => (
              <li
                key={rdv.id}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <span style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>
                      {(() => {
                        const [y, m, d] = rdv.slot_date.split("-").map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
                      })()}
                    </span>
                    <span style={{ fontSize: "15px", color: "#374151", marginLeft: "6px" }}>
                      {String(rdv.start_time).slice(0, 5)} – {String(rdv.end_time).slice(0, 5)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelModalRdv(rdv);
                      setCancelReason("");
                      setError(null);
                    }}
                    style={{ fontSize: "12px", color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                  >
                    Annuler le RDV
                  </button>
                </div>
                <div style={{ fontSize: "14px", color: "#374151", marginTop: "6px" }}>
                  <strong>Client :</strong> {rdv.clientName}
                  {rdv.clientPhone && <> — {rdv.clientPhone}</>}
                </div>
                {rdv.prestationTitle && (
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                    Prestation : {rdv.prestationTitle} — {rdv.prestationPoints} points
                  </div>
                )}
                {rdv.address?.trim() && (
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                    Adresse : {rdv.address.trim()}
                  </div>
                )}
                {rdv.place_image_urls.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                    {rdv.place_image_urls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="" style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e5e7eb" }} />
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={processingBookingId === rdv.id || cancelling}
                    onClick={() => handleMarkAttendance(rdv, "arrived")}
                    style={{
                      fontSize: "12px",
                      color: "#166534",
                      background: "#dcfce7",
                      border: "1px solid #bbf7d0",
                      borderRadius: "9999px",
                      padding: "6px 10px",
                      cursor: processingBookingId === rdv.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {processingBookingId === rdv.id ? "Traitement..." : "Client venu (+points)"}
                  </button>
                  <button
                    type="button"
                    disabled={processingBookingId === rdv.id || cancelling}
                    onClick={() => handleMarkAttendance(rdv, "no_show")}
                    style={{
                      fontSize: "12px",
                      color: "#b91c1c",
                      background: "#fee2e2",
                      border: "1px solid #fecaca",
                      borderRadius: "9999px",
                      padding: "6px 10px",
                      cursor: processingBookingId === rdv.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {processingBookingId === rdv.id ? "Traitement..." : "Client absent (-points)"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {cancelModalRdv && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
              padding: "16px",
            }}
            onClick={() => !cancelling && setCancelModalRdv(null)}
          >
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "16px",
                padding: "24px",
                maxWidth: "400px",
                width: "100%",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "#111" }}>
                Annuler le rendez-vous
              </h3>
              <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "12px" }}>
                Le motif sera envoyé au client.
              </p>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>
                Motif (optionnel)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex. imprévu, fermeture exceptionnelle..."
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #d1d5db",
                  marginBottom: "16px",
                  fontSize: "14px",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => !cancelling && setCancelModalRdv(null)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    fontSize: "14px",
                    cursor: cancelling ? "not-allowed" : "pointer",
                  }}
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={handleCancelRdv}
                  disabled={cancelling}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: "14px",
                    cursor: cancelling ? "not-allowed" : "pointer",
                  }}
                >
                  {cancelling ? "Annulation..." : "Confirmer l'annulation"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
