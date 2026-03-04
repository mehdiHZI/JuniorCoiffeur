"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Slot = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
};

export default function ClientReservationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  useEffect(() => {
    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.push("/auth");
        return;
      }
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (!customer) {
        router.push("/client");
        return;
      }
      setCustomerId((customer as { id: number }).id);
      setLoading(false);
    };
    run();
  }, [router]);

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }
    const load = async () => {
      setLoadingSlots(true);
      const { data: allSlots } = await supabase
        .from("availability_slots")
        .select("id, slot_date, start_time, end_time")
        .eq("slot_date", selectedDate)
        .gte("slot_date", new Date().toISOString().slice(0, 10))
        .order("start_time", { ascending: true });

      const { data: booked } = await supabase
        .from("bookings")
        .select("slot_id")
        .in("slot_id", (allSlots ?? []).map((s: { id: number }) => s.id));

      const bookedIds = new Set((booked ?? []).map((b: { slot_id: number }) => b.slot_id));
      const available = (allSlots ?? []).filter((s: { id: number }) => !bookedIds.has(s.id)) as Slot[];
      setSlots(available);
      setLoadingSlots(false);
    };
    load();
  }, [selectedDate]);

  const handleBook = async (slotId: number) => {
    if (!customerId) return;
    setBooking(true);
    setMessage(null);
    const { error } = await supabase.from("bookings").insert({ slot_id: slotId, customer_id: customerId });
    if (error) {
      setMessage("Créneau déjà pris ou erreur : " + error.message);
      setBooking(false);
      return;
    }
    setMessage("Réservation enregistrée.");
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    setBooking(false);
  };

  const daysInMonth = (year: number, month: number) => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const start = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const total = last.getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < start; i++) days.push(null);
    for (let d = 1; d <= total; d++) days.push(d);
    return days;
  };

  const formatMonth = (y: number, m: number) => {
    return new Date(y, m).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  };

  const prevMonth = () => {
    if (calendarMonth.month === 0) setCalendarMonth({ year: calendarMonth.year - 1, month: 11 });
    else setCalendarMonth({ year: calendarMonth.year, month: calendarMonth.month - 1 });
  };

  const nextMonth = () => {
    if (calendarMonth.month === 11) setCalendarMonth({ year: calendarMonth.year + 1, month: 0 });
    else setCalendarMonth({ year: calendarMonth.year, month: calendarMonth.month + 1 });
  };

  const today = new Date().toISOString().slice(0, 10);
  const days = daysInMonth(calendarMonth.year, calendarMonth.month);

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
          Choisis un jour puis un créneau pour réserver.
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <button
            type="button"
            onClick={prevMonth}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "14px" }}
          >
            ←
          </button>
          <span style={{ fontSize: "16px", fontWeight: 600, color: "#111", textTransform: "capitalize" }}>
            {formatMonth(calendarMonth.year, calendarMonth.month)}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "14px" }}
          >
            →
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "8px" }}>
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: "12px", color: "#6b7280", fontWeight: 600 }}>
              {d}
            </div>
          ))}
          {days.map((d, i) => {
            if (d === null) return <div key={`e-${i}`} />;
            const dateStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isPast = dateStr < today;
            const isSelected = selectedDate === dateStr;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => !isPast && setSelectedDate(dateStr)}
                disabled={isPast}
                style={{
                  padding: "10px",
                  borderRadius: "8px",
                  border: isSelected ? "2px solid #111" : "1px solid #e5e7eb",
                  background: isSelected ? "#f3f4f6" : isPast ? "#f9fafb" : "#fff",
                  color: isPast ? "#9ca3af" : "#111",
                  cursor: isPast ? "not-allowed" : "pointer",
                  fontSize: "14px",
                }}
              >
                {d}
              </button>
            );
          })}
        </div>

        {selectedDate && (
          <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "10px", color: "#111" }}>
              Créneaux le {(() => {
              const [y, m, d] = selectedDate.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
            })()}
            </h2>
            {loadingSlots ? (
              <p style={{ fontSize: "14px", color: "#6b7280" }}>Chargement...</p>
            ) : slots.length === 0 ? (
              <p style={{ fontSize: "14px", color: "#6b7280" }}>Aucun créneau disponible ce jour-là.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {slots.map((s) => (
                  <li
                    key={s.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <span style={{ fontSize: "14px", color: "#111" }}>
                      {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleBook(s.id)}
                      disabled={booking}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "#111",
                        color: "#fff",
                        fontSize: "14px",
                        fontWeight: 500,
                        cursor: booking ? "not-allowed" : "pointer",
                      }}
                    >
                      Réserver
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {message && (
          <p style={{ marginTop: "16px", fontSize: "14px", color: message.startsWith("Créneau") ? "#dc2626" : "#16a34a" }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
