"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { parsePlaceImageUrls } from "@/lib/placeImageUrls";
import { useRouter } from "next/navigation";

type Barber = { id: string; first_name: string | null; last_name: string | null };
type Prestation = {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  price_eur: number;
  price_points: number;
};
type Slot = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  address: string | null;
  place_image_urls: string[];
};

function isSlotStartInFuture(slotDate: string, startTime: string): boolean {
  const [y, m, d] = slotDate.split("-").map(Number);
  const [h, min] = String(startTime).slice(0, 5).split(":").map(Number);
  const slotStart = new Date(y, m - 1, d, h ?? 0, min ?? 0, 0, 0);
  return slotStart.getTime() > Date.now();
}

type Summary = {
  barberName: string;
  prestationTitle: string;
  prestationDescription: string | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  priceEur: number;
  pricePoints: number;
  address: string | null;
  placeImageUrls: string[];
};

export default function ClientReservationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedPrestation, setSelectedPrestation] = useState<Prestation | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmSlot, setConfirmSlot] = useState<Slot | null>(null);
  const [summaryPopup, setSummaryPopup] = useState<Summary | null>(null);
  const [datesWithAvailability, setDatesWithAvailability] = useState<Set<string>>(new Set());
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
      setCustomerId((customer as { id: string }).id);

      const { data: barberProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("role", "barber");
      const list = (barberProfiles ?? []).map((p) => ({
        id: (p as { id: string }).id,
        first_name: (p as { first_name: string | null }).first_name,
        last_name: (p as { last_name: string | null }).last_name,
      }));
      setBarbers(list);
      setLoading(false);
    };
    run();
  }, [router]);

  useEffect(() => {
    if (!selectedBarber) {
      setPrestations([]);
      setSelectedPrestation(null);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("prestations")
        .select("id, title, description, image_url, price_eur, price_points")
        .eq("barber_id", selectedBarber.id)
        .order("title");
      setPrestations((data as Prestation[]) ?? []);
      setSelectedPrestation(null);
    };
    load();
  }, [selectedBarber]);

  useEffect(() => {
    if (!selectedBarber || !selectedDate) {
      setSlots([]);
      return;
    }
    const load = async () => {
      setLoadingSlots(true);
      const { data: allSlots } = await supabase
        .from("availability_slots")
        .select("id, slot_date, start_time, end_time, address, place_image_urls")
        .eq("created_by", selectedBarber.id)
        .eq("slot_date", selectedDate)
        .gte("slot_date", new Date().toISOString().slice(0, 10))
        .order("start_time");

      const { data: booked } = await supabase
        .from("bookings")
        .select("slot_id")
        .in("slot_id", (allSlots ?? []).map((s: { id: number }) => s.id));

      const bookedIds = new Set((booked ?? []).map((b: { slot_id: number }) => b.slot_id));
      const available = (allSlots ?? [])
        .filter((s: { id: number }) => !bookedIds.has(s.id)) as Slot[];
      const futureOnly: Slot[] = available
        .filter((s) => isSlotStartInFuture(s.slot_date, s.start_time))
        .map((s) => {
          const row = s as Slot & { place_image_urls?: unknown };
          return {
            id: row.id,
            slot_date: row.slot_date,
            start_time: row.start_time,
            end_time: row.end_time,
            address: row.address ?? null,
            place_image_urls: parsePlaceImageUrls(row.place_image_urls),
          };
        });
      setSlots(futureOnly);
      setLoadingSlots(false);
    };
    load();
  }, [selectedBarber, selectedDate]);

  // Jours avec au moins un créneau dispo (pour le calendrier affiché + mois suivant)
  useEffect(() => {
    if (!selectedBarber) {
      setDatesWithAvailability(new Set());
      return;
    }
    const start = new Date(calendarMonth.year, calendarMonth.month, 1);
    const end = new Date(calendarMonth.year, calendarMonth.month + 2, 0); // fin du mois suivant
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const load = async () => {
      const { data: allSlots } = await supabase
        .from("availability_slots")
        .select("id, slot_date, start_time")
        .eq("created_by", selectedBarber!.id)
        .gte("slot_date", startStr)
        .lte("slot_date", endStr)
        .gte("slot_date", todayStr);

      if (!allSlots?.length) {
        setDatesWithAvailability(new Set());
        return;
      }

      const { data: booked } = await supabase
        .from("bookings")
        .select("slot_id")
        .in("slot_id", (allSlots as { id: number }[]).map((s) => s.id));

      const bookedIds = new Set((booked ?? []).map((b: { slot_id: number }) => b.slot_id));
      const withAvailability = new Set<string>();
      (allSlots as { id: number; slot_date: string; start_time: string }[]).forEach((s) => {
        if (bookedIds.has(s.id)) return;
        if (!isSlotStartInFuture(s.slot_date, s.start_time)) return;
        withAvailability.add(s.slot_date);
      });
      setDatesWithAvailability(withAvailability);
    };
    load();
  }, [selectedBarber, calendarMonth.year, calendarMonth.month]);

  const handleBook = async (slot: Slot) => {
    if (!customerId || !selectedBarber || !selectedPrestation) return;
    setBooking(true);
    setMessage(null);
    const { error } = await supabase.from("bookings").insert({
      slot_id: slot.id,
      customer_id: customerId,
      prestation_id: selectedPrestation.id,
    });
    if (error) {
      setMessage("Créneau déjà pris ou erreur : " + error.message);
      setBooking(false);
      return;
    }
    const barberName = `${selectedBarber.first_name ?? ""} ${selectedBarber.last_name ?? ""}`.trim() || "Coiffeur";
    setSummaryPopup({
      barberName,
      prestationTitle: selectedPrestation.title,
      prestationDescription: selectedPrestation.description?.trim() ? selectedPrestation.description.trim() : null,
      slotDate: slot.slot_date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      priceEur: Number(selectedPrestation.price_eur),
      pricePoints: selectedPrestation.price_points,
      address: slot.address ?? null,
      placeImageUrls: slot.place_image_urls ?? [],
    });
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
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

  const btnSecondary = {
    padding: "8px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "#fff",
    cursor: "pointer",
    fontSize: "14px",
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

        <div
          style={{
            marginBottom: "20px",
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            borderLeft: "4px solid #111",
            backgroundColor: "#fafafa",
          }}
        >
          <p style={{ fontSize: "12px", fontWeight: 600, color: "#111", margin: "0 0 6px", letterSpacing: "0.02em" }}>
            Engagement
          </p>
          <p style={{ fontSize: "13px", color: "#4b5563", margin: 0, lineHeight: 1.55 }}>
            Chaque créneau est réservé à ton nom : le salon t’accueille à l’heure prévue. Merci d’honorer ton
            rendez-vous ou, en cas d’imprévu, de{" "}
            <strong style={{ color: "#374151" }}>prévenir ton coiffeur au plus tôt</strong> pour libérer la place.
            Les annulations tardives peuvent entraîner une pénalité en points, conformément aux règles affichées sur ton
            espace client lors d’une annulation.
          </p>
        </div>

        {/* Step 1: Choisir le coiffeur */}
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "10px", color: "#111" }}>
            1. Choisir le coiffeur
          </h2>
          {barbers.length === 0 ? (
            <p style={{ fontSize: "14px", color: "#6b7280" }}>Aucun coiffeur disponible.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {barbers.map((b) => {
                const name = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || "Coiffeur";
                const isSelected = selectedBarber?.id === b.id;
                return (
                  <li key={b.id} style={{ marginBottom: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedBarber(b)}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: "10px",
                        border: isSelected ? "2px solid #111" : "1px solid #e5e7eb",
                        background: isSelected ? "#f3f4f6" : "#fff",
                        cursor: "pointer",
                        fontSize: "14px",
                        textAlign: "left",
                      }}
                    >
                      {name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Step 2: Choisir la coupe (prestation) */}
        {selectedBarber && (
          <div style={{ marginBottom: "24px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "10px", color: "#111" }}>
              2. Choisir la coupe
            </h2>
            {prestations.length === 0 ? (
              <p style={{ fontSize: "14px", color: "#6b7280" }}>Ce coiffeur n&apos;a pas encore de prestations.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {prestations.map((p) => {
                  const isSelected = selectedPrestation?.id === p.id;
                  return (
                    <li key={p.id} style={{ marginBottom: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPrestation(p)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          borderRadius: "10px",
                          border: isSelected ? "2px solid #111" : "1px solid #e5e7eb",
                          background: isSelected ? "#f3f4f6" : "#fff",
                          cursor: "pointer",
                          fontSize: "14px",
                          textAlign: "left",
                        }}
                      >
                        {p.image_url && (
                          <img
                            src={p.image_url}
                            alt=""
                            style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "8px" }}
                          />
                        )}
                        <div>
                          <span style={{ fontWeight: 500 }}>{p.title}</span>
                          <span style={{ display: "block", fontSize: "12px", color: "#6b7280" }}>
                            {Number(p.price_eur)} € — {p.price_points} pts
                          </span>
                          {p.description?.trim() && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "11px",
                                color: "#6b7280",
                                marginTop: "4px",
                                lineHeight: 1.35,
                                maxHeight: "2.7em",
                                overflow: "hidden",
                              }}
                            >
                              {p.description.trim()}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Step 3: Date et créneau */}
        {selectedBarber && selectedPrestation && (
          <div style={{ paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "10px", color: "#111" }}>
              3. Date et créneau
            </h2>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  if (calendarMonth.month === 0) setCalendarMonth({ year: calendarMonth.year - 1, month: 11 });
                  else setCalendarMonth({ year: calendarMonth.year, month: calendarMonth.month - 1 });
                }}
                style={btnSecondary}
              >
                ←
              </button>
              <span style={{ fontSize: "16px", fontWeight: 600, color: "#111", textTransform: "capitalize" }}>
                {formatMonth(calendarMonth.year, calendarMonth.month)}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (calendarMonth.month === 11) setCalendarMonth({ year: calendarMonth.year + 1, month: 0 });
                  else setCalendarMonth({ year: calendarMonth.year, month: calendarMonth.month + 1 });
                }}
                style={btnSecondary}
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
                const hasAvailability = !isPast && datesWithAvailability.has(dateStr);
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
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>{d}</span>
                    {hasAvailability && (
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#16a34a",
                          flexShrink: 0,
                        }}
                        title="Créneaux disponibles"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "10px", color: "#111" }}>
                  Créneaux le {(() => {
                    const [y, m, d] = selectedDate.split("-").map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
                  })()}
                </h3>
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
                          flexDirection: "column",
                          gap: "8px",
                          padding: "12px 0",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                          <span style={{ fontSize: "14px", color: "#111" }}>
                            {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirmSlot(s)}
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
                        </div>
                        {s.place_image_urls.length > 0 && (
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", overflowX: "auto", paddingBottom: "2px" }}>
                            {s.place_image_urls.map((url) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={url}
                                src={url}
                                alt="Lieu du rendez-vous"
                                style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb", flexShrink: 0 }}
                              />
                            ))}
                          </div>
                        )}
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
        )}
      </div>

      {/* Modal confirmation avant réservation */}
      {confirmSlot && selectedBarber && selectedPrestation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
          onClick={() => !booking && setConfirmSlot(null)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "28px 24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", color: "#111" }}>
              Confirmer la réservation
            </h3>
            <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "16px" }}>
              Récapitulatif de ta commande :
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: "16px", fontSize: "14px", color: "#374151" }}>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Coiffeur :</strong> {`${selectedBarber.first_name ?? ""} ${selectedBarber.last_name ?? ""}`.trim() || "Coiffeur"}
              </li>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Intitulé :</strong> {selectedPrestation.title}
              </li>
              <li
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #e5e7eb",
                  whiteSpace: "pre-wrap",
                }}
              >
                <strong style={{ display: "block", marginBottom: "4px" }}>Prestation :</strong>
                {selectedPrestation.description?.trim() ? selectedPrestation.description.trim() : "—"}
              </li>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Date :</strong>{" "}
                {(() => {
                  const [y, m, d] = confirmSlot.slot_date.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
                })()}{" "}
                {String(confirmSlot.start_time).slice(0, 5)} – {String(confirmSlot.end_time).slice(0, 5)}
              </li>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Tarif :</strong> {Number(selectedPrestation.price_eur)} € — {selectedPrestation.price_points} points
              </li>
              {confirmSlot.address?.trim() && (
                <li style={{ padding: "6px 0" }}>
                  <strong>Adresse :</strong> {confirmSlot.address.trim()}
                </li>
              )}
            </ul>
            <p
              style={{
                fontSize: "12px",
                color: "#6b7280",
                lineHeight: 1.5,
                margin: "0 0 16px",
                padding: "10px 12px",
                backgroundColor: "#f9fafb",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
              }}
            >
              En confirmant, tu t&apos;engages à honorer ce rendez-vous ou à prévenir ton coiffeur en cas d&apos;imprévu, dans
              le respect des conditions d&apos;annulation de ton espace client.
            </p>
            {confirmSlot.place_image_urls.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Photos du lieu</p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {confirmSlot.place_image_urls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt="Lieu du rendez-vous"
                      style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e5e7eb" }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => !booking && setConfirmSlot(null)}
                disabled={booking}
                style={{
                  padding: "10px 18px",
                  borderRadius: "10px",
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontSize: "14px",
                  cursor: booking ? "not-allowed" : "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleBook(confirmSlot);
                  setConfirmSlot(null);
                }}
                disabled={booking}
                style={{
                  padding: "10px 18px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: booking ? "not-allowed" : "pointer",
                }}
              >
                {booking ? "Réservation..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup remerciement après réservation */}
      {summaryPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
          onClick={() => setSummaryPopup(null)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "28px 24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px", color: "#111", textAlign: "center" }}>
              Merci pour ta réservation
            </h3>
            <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px", textAlign: "center" }}>
              Récapitulatif de ta commande :
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: "24px", fontSize: "14px", color: "#374151" }}>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Coiffeur :</strong> {summaryPopup.barberName}
              </li>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Intitulé :</strong> {summaryPopup.prestationTitle}
              </li>
              <li
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #e5e7eb",
                  whiteSpace: "pre-wrap",
                }}
              >
                <strong style={{ display: "block", marginBottom: "4px" }}>Prestation :</strong>
                {summaryPopup.prestationDescription?.trim() ? summaryPopup.prestationDescription.trim() : "—"}
              </li>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Date :</strong>{" "}
                {(() => {
                  const [y, m, d] = summaryPopup.slotDate.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
                })()}{" "}
                {String(summaryPopup.startTime).slice(0, 5)} – {String(summaryPopup.endTime).slice(0, 5)}
              </li>
              <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Tarif :</strong> {summaryPopup.priceEur} € — {summaryPopup.pricePoints} points
              </li>
              {summaryPopup.address?.trim() && (
                <li style={{ padding: "6px 0" }}>
                  <strong>Adresse :</strong> {summaryPopup.address.trim()}
                </li>
              )}
            </ul>
            {summaryPopup.placeImageUrls.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px", textAlign: "center" }}>Photos du lieu</p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                  {summaryPopup.placeImageUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt="Lieu du rendez-vous"
                      style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e5e7eb" }}
                    />
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSummaryPopup(null)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "#111",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
