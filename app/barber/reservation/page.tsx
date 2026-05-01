"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageCompression";
import { parsePlaceImageUrls } from "@/lib/placeImageUrls";
import { PlaceImagesPreview } from "@/app/components/PlaceImagesPreview";

const SLOT_PLACE_IMAGES_BUCKET = "slot-place-images";
const MAX_PLACE_IMAGES = 6;

const SLOT_DURATION_MINUTES = 45;

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

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayLocalDateString(): string {
  return toLocalDateString(new Date());
}

type Slot = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
  address: string | null;
  place_image_urls: string[];
};

export default function BarberReservationPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookingClientInfo, setBookingClientInfo] = useState<Record<number, { name: string; phone: string }>>({});
  const [bookingCustomerIds, setBookingCustomerIds] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [slotDate, setSlotDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [address, setAddress] = useState("");
  const [placeImageFiles, setPlaceImageFiles] = useState<File[]>([]);
  const [existingPlaceImageUrls, setExistingPlaceImageUrls] = useState<string[]>([]);
  const [selectedExistingPlaceImageUrls, setSelectedExistingPlaceImageUrls] = useState<string[]>([]);
  const [loadingExistingPlaceImages, setLoadingExistingPlaceImages] = useState(false);
  const placeImagePreviews = useMemo(() => placeImageFiles.map((f) => URL.createObjectURL(f)), [placeImageFiles]);
  useEffect(() => {
    return () => {
      placeImagePreviews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [placeImagePreviews]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelModalSlotId, setCancelModalSlotId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const loadExistingPlaceImages = async (uid: string) => {
    setLoadingExistingPlaceImages(true);
    const collectedPaths: string[] = [];
    let offset = 0;
    const pageSize = 100;
    while (true) {
      const { data, error: listErr } = await supabase.storage
        .from(SLOT_PLACE_IMAGES_BUCKET)
        .list(uid, { limit: pageSize, offset, sortBy: { column: "created_at", order: "desc" } });
      if (listErr) {
        setError(`Impossible de charger les images existantes: ${listErr.message}`);
        break;
      }
      const files = (data ?? []).filter((entry) => {
        const name = String((entry as { name?: string }).name ?? "");
        return !!name && !name.endsWith("/");
      });
      for (const file of files) {
        const name = (file as { name: string }).name;
        collectedPaths.push(`${uid}/${name}`);
      }
      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
    const urls = collectedPaths.map((path) => supabase.storage.from(SLOT_PLACE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl);
    setExistingPlaceImageUrls(urls);
    setLoadingExistingPlaceImages(false);
  };

  const loadSlots = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const now = new Date();
    const today = todayLocalDateString();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const { data: allSlots, error: errAll } = await supabase
      .from("availability_slots")
      .select("id, slot_date, start_time, end_time, created_at, address, place_image_urls")
      .eq("created_by", authData.user.id)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (errAll) {
      setError(errAll.message);
      setSlots([]);
      return;
    }
    const all = (allSlots ?? []) as {
      id: number;
      slot_date: string;
      start_time: string;
      end_time: string;
      created_at: string;
      address: string | null;
      place_image_urls?: unknown;
    }[];
    const pastIds: number[] = [];
    for (const s of all) {
      if (s.slot_date < today) pastIds.push(s.id);
      else if (s.slot_date === today) {
        const [h, m] = String(s.end_time).slice(0, 5).split(":").map(Number);
        if ((h ?? 0) * 60 + (m ?? 0) <= currentMinutes) pastIds.push(s.id);
      }
    }
    if (pastIds.length) {
      const { data: pastBooked } = await supabase.from("bookings").select("slot_id").in("slot_id", pastIds);
      const bookedPastIds = new Set((pastBooked ?? []).map((b: { slot_id: number }) => b.slot_id));
      const pastIdsToDelete = pastIds.filter((id) => !bookedPastIds.has(id));
      if (pastIdsToDelete.length > 0) {
        // Les photos du lieu sont permanentes : on nettoie les lignes de créneaux passés non réservés, jamais les fichiers image.
        await supabase.from("availability_slots").delete().in("id", pastIdsToDelete);
      }
    }

    const slotList: Slot[] = all
      .filter((s) => !pastIds.includes(s.id))
      .map((s) => {
        const row = s as {
          id: number;
          slot_date: string;
          start_time: string;
          end_time: string;
          created_at: string;
          address: string | null;
          place_image_urls?: unknown;
        };
        return {
          id: row.id,
          slot_date: row.slot_date,
          start_time: row.start_time,
          end_time: row.end_time,
          created_at: row.created_at,
          address: row.address ?? null,
          place_image_urls: parsePlaceImageUrls(row.place_image_urls),
        };
      });
    setSlots(slotList);

    if (slotList.length === 0) {
      setBookingClientInfo({});
      setBookingCustomerIds({});
      return;
    }
    const slotIds = slotList.map((s) => s.id);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("slot_id, customer_id")
      .in("slot_id", slotIds);
    if (!bookings?.length) {
      setBookingClientInfo({});
      setBookingCustomerIds({});
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
      setBookingCustomerIds({});
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
    const slotToCustomerId: Record<number, string> = {};
    (bookings as { slot_id: number; customer_id: string }[]).forEach((b) => {
      const info = userToInfo[customerToUser[b.customer_id]];
      if (info) slotToInfo[b.slot_id] = info;
      slotToCustomerId[b.slot_id] = b.customer_id;
    });
    setBookingClientInfo(slotToInfo);
    setBookingCustomerIds(slotToCustomerId);
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
      await loadExistingPlaceImages(authData.user.id);
      await loadSlots();
      setLoading(false);
    };
    run();
  }, [router]);

  useEffect(() => {
    setExpandedDays((prev) => {
      const next = { ...prev };
      for (const s of slots) {
        if (!(s.slot_date in next)) next[s.slot_date] = true;
      }
      return next;
    });
  }, [slots]);

  const handleAdd = async () => {
    if (!slotDate || !startTime || !endTime) {
      setError("Renseigne au moins une date et les heures.");
      return;
    }
    const periodEnd = endDate || slotDate;
    if (periodEnd < slotDate) {
      setError("La date de fin doit être après ou égale à la date de début.");
      return;
    }
    if (startTime >= endTime) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    const generated = buildSlotsFromRange(startTime, endTime);
    if (generated.length === 0) {
      setError("La plage doit couvrir au moins 45 minutes.");
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setSaving(true);
    setError(null);
    const datesToCreate: string[] = [];
    const [startY, startM, startD] = slotDate.split("-").map(Number);
    const [endY, endM, endD] = periodEnd.split("-").map(Number);
    let cursor = new Date(startY, startM - 1, startD, 0, 0, 0, 0);
    const last = new Date(endY, endM - 1, endD, 0, 0, 0, 0);
    while (cursor.getTime() <= last.getTime()) {
      datesToCreate.push(toLocalDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const addr = address.trim() || null;
    let imageUrls: string[] = [];
    const selectedExisting = selectedExistingPlaceImageUrls.slice(0, MAX_PLACE_IMAGES);
    if (selectedExisting.length > 0) {
      imageUrls = [...selectedExisting];
    }
    if (placeImageFiles.length > 0) {
      if (imageUrls.length + placeImageFiles.length > MAX_PLACE_IMAGES) {
        setError(`Tu peux sélectionner au maximum ${MAX_PLACE_IMAGES} images au total.`);
        setSaving(false);
        return;
      }
      const uid = authData.user!.id;
      const stamp = Date.now();
      for (let i = 0; i < placeImageFiles.length; i++) {
        const file = placeImageFiles[i];
        let blob: Blob;
        try {
          blob = await compressImage(file, { maxDimension: 1200, quality: 0.8 });
        } catch {
          setError("Impossible de compresser une des photos du lieu.");
          setSaving(false);
          return;
        }
        const path = `${uid}/${stamp}-${i}.jpg`;
        const { error: upErr } = await supabase.storage.from(SLOT_PLACE_IMAGES_BUCKET).upload(path, blob, { upsert: false });
        if (upErr) {
          setError("Erreur envoi photo : " + upErr.message);
          setSaving(false);
          return;
        }
        const { data: urlData } = supabase.storage.from(SLOT_PLACE_IMAGES_BUCKET).getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }
    }
    const rows = datesToCreate.flatMap((date) =>
      generated.map(({ start, end }) => ({
        slot_date: date,
        start_time: start,
        end_time: end,
        created_by: authData.user!.id,
        address: addr,
        place_image_urls: imageUrls,
      }))
    );
    const { error: err } = await supabase.from("availability_slots").insert(rows);
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    setSlotDate("");
    setEndDate("");
    setStartTime("08:00");
    setEndTime("12:00");
    setAddress("");
    setPlaceImageFiles([]);
    setSelectedExistingPlaceImageUrls([]);
    await loadExistingPlaceImages(authData.user!.id);
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

  const handleDeleteDay = async (date: string) => {
    const daySlots = slots.filter((s) => s.slot_date === date);
    if (daySlots.length === 0) return;
    const deletableSlots = daySlots.filter((s) => !bookingClientInfo[s.id]);
    if (deletableSlots.length === 0) {
      setError("Tous les créneaux de cette journée sont déjà réservés.");
      return;
    }

    const ids = deletableSlots.map((s) => s.id);
    const { error: err } = await supabase.from("availability_slots").delete().in("id", ids);
    if (err) {
      setError(err.message);
      return;
    }

    setSlots((prev) => prev.filter((s) => s.slot_date !== date));
    setBookingClientInfo((prev) => {
      const next: Record<number, { name: string; phone: string }> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!ids.includes(Number(k))) next[Number(k)] = v;
      }
      return next;
    });
    setBookingCustomerIds((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!ids.includes(Number(k))) next[Number(k)] = v;
      }
      return next;
    });
    setExpandedDays((prev) => {
      const next = { ...prev };
      if (!slots.some((s) => s.slot_date === date && !ids.includes(s.id))) delete next[date];
      return next;
    });
    setError(null);
  };

  const handleCancelReservation = async () => {
    if (cancelModalSlotId == null) return;
    const customerId = bookingCustomerIds[cancelModalSlotId];
    if (!customerId) {
      setError("Client introuvable.");
      setCancelling(false);
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setCancelling(true);
    setError(null);
    const { error: insertErr } = await supabase.from("booking_cancellations").insert({
      slot_id: cancelModalSlotId,
      customer_id: customerId,
      cancel_reason: cancelReason.trim() || null,
      cancelled_by: authData.user.id,
    });
    if (insertErr) {
      setError(insertErr.message);
      setCancelling(false);
      return;
    }
    const { error: deleteErr } = await supabase.from("bookings").delete().eq("slot_id", cancelModalSlotId);
    if (deleteErr) {
      setError(deleteErr.message);
      setCancelling(false);
      return;
    }
    setCancelModalSlotId(null);
    setCancelReason("");
    await loadSlots();
    setCancelling(false);
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

  const slotsByDay = useMemo(() => {
    const grouped: Record<string, Slot[]> = {};
    for (const s of slots) {
      if (!grouped[s.slot_date]) grouped[s.slot_date] = [];
      grouped[s.slot_date].push(s);
    }
    return grouped;
  }, [slots]);

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
          Indique une plage où tu es dispo : des créneaux de 45 min seront créés automatiquement (ex. 8h–12h → 8h00, 8h45, 9h30…).
          Tu peux aussi appliquer la même plage sur une période.
        </p>

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Période (début)</label>
        <input
          type="date"
          value={slotDate}
          min={todayLocalDateString()}
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
        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>
          Période (fin, optionnel)
        </label>
        <input
          type="date"
          value={endDate}
          min={slotDate || todayLocalDateString()}
          onChange={(e) => setEndDate(e.target.value)}
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
        <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 12px" }}>
          Si la date de fin est vide, les créneaux seront créés uniquement pour la date de début.
        </p>
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
            marginBottom: "12px",
            fontSize: "14px",
          }}
        />
        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Adresse du RDV (optionnel)</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex. 12 rue de la Paix, 75002 Paris"
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "12px",
            fontSize: "14px",
            resize: "vertical",
          }}
        />
        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>
          Photos du lieu (optionnel, max {MAX_PLACE_IMAGES})
        </label>
        <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
          Aide les clients à repérer le salon ou le lieu exact du rendez-vous.
        </p>
        <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
          Tu peux soit sélectionner des photos déjà enregistrées, soit en ajouter de nouvelles.
        </p>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px", color: "#374151" }}>
          Photos déjà enregistrées
        </label>
        {loadingExistingPlaceImages ? (
          <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "10px" }}>Chargement des images...</p>
        ) : existingPlaceImageUrls.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "10px" }}>Aucune image enregistrée pour le moment.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
            {existingPlaceImageUrls.map((url) => {
              const selected = selectedExistingPlaceImageUrls.includes(url);
              const maxReached = selectedExistingPlaceImageUrls.length + placeImageFiles.length >= MAX_PLACE_IMAGES;
              const disableSelect = !selected && maxReached;
              return (
                <button
                  key={url}
                  type="button"
                  disabled={disableSelect}
                  onClick={() =>
                    setSelectedExistingPlaceImageUrls((prev) => {
                      if (prev.includes(url)) return prev.filter((u) => u !== url);
                      if (prev.length + placeImageFiles.length >= MAX_PLACE_IMAGES) return prev;
                      return [...prev, url];
                    })
                  }
                  style={{
                    borderRadius: "10px",
                    border: selected ? "2px solid #111" : "1px solid #d1d5db",
                    background: selected ? "#f3f4f6" : "#fff",
                    padding: "2px",
                    cursor: disableSelect ? "not-allowed" : "pointer",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", opacity: disableSelect ? 0.45 : 1 }}
                  />
                </button>
              );
            })}
          </div>
        )}
        {selectedExistingPlaceImageUrls.length > 0 && (
          <p style={{ fontSize: "12px", color: "#374151", marginBottom: "8px" }}>
            {selectedExistingPlaceImageUrls.length} image(s) existante(s) sélectionnée(s)
          </p>
        )}
        <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px", color: "#374151" }}>
          Ajouter de nouvelles photos
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            setPlaceImageFiles((prev) => {
              const room = Math.max(0, MAX_PLACE_IMAGES - selectedExistingPlaceImageUrls.length);
              return [...prev, ...picked].slice(0, room);
            });
          }}
          style={{ marginBottom: "10px", fontSize: "14px", width: "100%" }}
        />
        {placeImageFiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
            {placeImageFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={placeImagePreviews[idx]}
                  alt=""
                  style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                />
                <button
                  type="button"
                  aria-label="Retirer cette photo"
                  onClick={() => setPlaceImageFiles((prev) => prev.filter((_, i) => i !== idx))}
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: "none",
                    background: "#111",
                    color: "#fff",
                    fontSize: "14px",
                    lineHeight: 1,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
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
          {saving
            ? "Création des créneaux..."
            : `Créer les créneaux (45 min)${endDate ? " sur la période" : ""}`}
        </button>

        {error && <p style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>{error}</p>}

        <h2 style={{ fontSize: "16px", fontWeight: 600, marginTop: "24px", marginBottom: "10px", color: "#111" }}>
          Créneaux à venir
        </h2>
        {slots.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#6b7280" }}>Aucun créneau.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {Object.entries(slotsByDay).map(([date, daySlots]) => {
              const isOpen = expandedDays[date] ?? true;
              const [y, m, d] = date.split("-").map(Number);
              const dayLabel = new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              });
              return (
                <li key={date} style={{ borderBottom: "1px solid #e5e7eb", padding: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedDays((prev) => ({ ...prev, [date]: !isOpen }))}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        fontSize: "14px",
                        color: "#111",
                        fontWeight: 600,
                        textTransform: "capitalize",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {isOpen ? "▼" : "▶"} {dayLabel} ({daySlots.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDay(date)}
                      style={{
                        fontSize: "12px",
                        color: "#dc2626",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Supprimer la journée
                    </button>
                  </div>
                  {isOpen && (
                    <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
                      {daySlots.map((s) => (
                        <li
                          key={s.id}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            padding: "8px 0",
                            borderTop: "1px dashed #e5e7eb",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "14px", color: "#111" }}>
                              {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                            </span>
                            <div style={{ display: "flex", gap: "8px" }}>
                              {bookingClientInfo[s.id] ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelModalSlotId(s.id);
                                    setCancelReason("");
                                    setError(null);
                                  }}
                                  style={{
                                    fontSize: "12px",
                                    color: "#dc2626",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
                                >
                                  Annuler la réservation
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(s.id)}
                                  style={{ fontSize: "12px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                                >
                                  Supprimer
                                </button>
                              )}
                            </div>
                          </div>
                          {bookingClientInfo[s.id] && (
                            <span style={{ fontSize: "13px", color: "#4b5563", display: "block", marginTop: "4px" }}>
                              Réservé par : {bookingClientInfo[s.id].name}
                              {bookingClientInfo[s.id].phone && <> — {bookingClientInfo[s.id].phone}</>}
                            </span>
                          )}
                          <PlaceImagesPreview urls={s.place_image_urls} thumbSize={40} gap={6} marginTop="6px" />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {cancelModalSlotId != null && (
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
            onClick={() => !cancelling && setCancelModalSlotId(null)}
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
                Annuler la réservation
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
                  onClick={() => !cancelling && setCancelModalSlotId(null)}
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
                  onClick={handleCancelReservation}
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
