"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const SLOT_DURATION_MINUTES = 40;

function timeToMinutes(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildSlotsFromRange(startTime: string, endTime: string): { start: string; end: string }[] {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const slots: { start: string; end: string }[] = [];
  for (let t = startMin; t + SLOT_DURATION_MINUTES <= endMin; t += SLOT_DURATION_MINUTES) {
    slots.push({
      start: minutesToTime(t),
      end: minutesToTime(t + SLOT_DURATION_MINUTES),
    });
  }
  return slots;
}

type Slot = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
};

export default function BarberReservationPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookingClientInfo, setBookingClientInfo] = useState<Record<number, { name: string; phone: string }>>({});
  const [loading, setLoading] = useState(true);
  const [slotDate, setSlotDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data, error: err } = await supabase
      .from("availability_slots")
      .select("id, slot_date, start_time, end_time, created_at")
      .eq("created_by", authData.user.id)
      .gte("slot_date", new Date().toISOString().slice(0, 10))
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (err) {
      setError(err.message);
      setSlots([]);
      return;
    }
    const slotList = (data as Slot[]) ?? [];
    setSlots(slotList);

    if (slotList.length === 0) {
      setBookingClientInfo({});
      return;
    }
    const slotIds = slotList.map((s) => s.id);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("slot_id, customer_id")
      .in("slot_id", slotIds);
    if (!bookings?.length) {
      setBookingClientInfo({});
      return;
    }
    const customerIds = [...new Set((bookings as { customer_id: string }[]).map((b) => b.customer_id))];
    const { data: customers } = await supabase
      .from("customers")
      .select("id, user_id")
      .in("id", customerIds);
    const userIds = (customers ?? [])
      .map((c) => (c as { user_id: string }).user_id)
      .filter(Boolean);
    if (userIds.length === 0) {
      setBookingClientInfo({});
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone")
      .in("id", userIds);
    const userToInfo: Record<string, { name: string; phone: string }> = {};
    (profiles ?? []).forEach((p) => {
      const pid = (p as { id: string; first_name: string | null; last_name: string | null; phone: string | null }).id;
      const fn = (p as { first_name: string | null }).first_name ?? "";
      const ln = (p as { last_name: string | null }).last_name ?? "";
      const name = `${fn} ${ln}`.trim() || "Client";
      const phone = (p as { phone: string | null }).phone ?? "";
      userToInfo[pid] = { name, phone };
    });
    const customerToUser: Record<string, string> = {};
    (customers ?? []).forEach((c) => {
      const cid = (c as { id: string; user_id: string }).id;
      const uid = (c as { id: string; user_id: string }).user_id;
      customerToUser[cid] = uid;
    });
    const slotToInfo: Record<number, { name: string; phone: string }> = {};
    (bookings as { slot_id: number; customer_id: string }[]).forEach((b) => {
      const info = userToInfo[customerToUser[b.customer_id]];
      if (info) slotToInfo[b.slot_id] = info;
    });
    setBookingClientInfo(slotToInfo);
  };

  useEffect(() => {
    const run = async () => {
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
      await loadSlots();
      setLoading(false);
    };
    run();
  }, [router]);

  const handleAdd = async () => {
    if (!slotDate || !startTime || !endTime) {
      setError("Renseigne la date et les heures.");
      return;
    }
    if (startTime >= endTime) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    const generated = buildSlotsFromRange(startTime, endTime);
    if (generated.length === 0) {
      setError("La plage doit couvrir au moins 40 minutes.");
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setSaving(true);
    setError(null);
    const rows = generated.map(({ start, end }) => ({
      slot_date: slotDate,
      start_time: start,
      end_time: end,
      created_by: authData.user!.id,
    }));
    const { error: err } = await supabase.from("availability_slots").insert(rows);
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    setSlotDate("");
    setStartTime("08:00");
    setEndTime("12:00");
    await loadSlots();
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    const { data: booked } = await supabase.from("bookings").select("id").eq("slot_id", id).maybeSingle();
    if (booked) {
      setError("Ce créneau est déjà réservé, impossible de le supprimer.");
      return;
    }
    const { error: err } = await supabase.from("availability_slots").delete().eq("id", id);
    if (!err) setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: "480px",
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
          Réservation
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
          Indique une plage où tu es dispo : des créneaux de 40 min seront créés automatiquement (ex. 8h–12h → 8h00, 8h40, 9h20…).
        </p>

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Date</label>
        <input
          type="date"
          value={slotDate}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setSlotDate(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "12px",
            fontSize: "14px",
          }}
        />
        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Dispo de (heure début)</label>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "12px",
            fontSize: "14px",
          }}
        />
        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Dispo jusqu'à (heure fin)</label>
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "16px",
            fontSize: "14px",
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          style={{
            width: "100%",
            backgroundColor: "#111",
            color: "#fff",
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            fontSize: "15px",
            fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Création des créneaux..." : "Créer les créneaux (40 min)"}
        </button>

        {error && <p style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>{error}</p>}

        <h2 style={{ fontSize: "16px", fontWeight: 600, marginTop: "24px", marginBottom: "10px", color: "#111" }}>
          Créneaux à venir
        </h2>
        {slots.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#6b7280" }}>Aucun créneau.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {slots.map((s) => (
              <li
                key={s.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  padding: "10px 0",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", color: "#111" }}>
                    {(() => {
                      const [y, m, d] = s.slot_date.split("-").map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
                    })()}{" "}
                    {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    style={{ fontSize: "12px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Supprimer
                  </button>
                </div>
                {bookingClientInfo[s.id] && (
                  <span style={{ fontSize: "13px", color: "#4b5563", display: "block", marginTop: "4px" }}>
                    Réservé par : {bookingClientInfo[s.id].name}
                    {bookingClientInfo[s.id].phone && (
                      <> — {bookingClientInfo[s.id].phone}</>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
