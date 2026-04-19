"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageCompression";
import { isSupabaseStorageUrl, removeStorageFile } from "@/lib/storageCleanup";
import { parsePlaceImageUrls } from "@/lib/placeImageUrls";
import { useRouter } from "next/navigation";
import { useClientRealtime } from "./ClientRealtimeContext";

const FEED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];
const SEEN_CANCELLATIONS_KEY = "chriscut_seen_cancellation_ids";

type CancellationItem = {
  id: number;
  cancelled_at: string;
  cancel_reason: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
};

type UpcomingBooking = {
  id: number;
  slot_id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  address: string | null;
  place_image_urls: string[];
  barberName: string;
  prestationTitle: string | null;
  prestationDescription: string | null;
  priceEur: number | null;
  pricePoints: number | null;
};

function firstRel<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default function ClientHomePage() {
  const router = useRouter();
  const { transactionUpdateVersion } = useClientRealtime();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [points, setPoints] = useState<number>(0);
  const [recentVisits, setRecentVisits] = useState<
    { id: number; created_at: string; points: number | null }[]
  >([]);
  const [feedPosts, setFeedPosts] = useState<
    { id: number; content: string; image_url: string | null; audio_url: string | null; created_at: string }[]
  >([]);
  const [reactionsByPost, setReactionsByPost] = useState<
    Record<number, { counts: Record<string, number>; myEmoji: string | null }>
  >({});
  const [pointsNotification, setPointsNotification] = useState<string | null>(null);
  const [bookings, setBookings] = useState<UpcomingBooking[]>([]);
  const [bookingDetail, setBookingDetail] = useState<UpcomingBooking | null>(null);
  const [popupCancellations, setPopupCancellations] = useState<CancellationItem[]>([]);
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState<UpcomingBooking | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push("/auth");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url, first_name, last_name, full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        if ((profile as { avatar_url?: string | null }).avatar_url) {
          setAvatarUrl((profile as { avatar_url: string }).avatar_url);
        }
        const p = profile as {
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
        };
        const fromParts = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        const name = (fromParts || p.full_name || "").trim();
        if (name) setDisplayName(name);
      }

      const { data: existingCustomer, error: customerErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (customerErr) {
        console.error(customerErr.message);
        setLoading(false);
        return;
      }

      let customer = existingCustomer as { id: number } | null;

      if (!customer) {
        const newToken = crypto.randomUUID();

        const { data: created, error: createErr } = await supabase
          .from("customers")
          .insert({ user_id: user.id, qr_token: newToken })
          .select("id")
          .single();

        if (createErr) {
          console.error(createErr.message);
          setLoading(false);
          return;
        }

        customer = created as { id: number };
      }

      const { data: txs } = await supabase
        .from("transactions")
        .select("points")
        .eq("customer_id", customer.id);

      const total = (txs ?? []).reduce(
        (acc, t: { points: number | null }) => acc + (t.points ?? 0),
        0
      );
      setPoints(total);
      setCustomerId(customer.id);

      const { data: lastTxs } = await supabase
        .from("transactions")
        .select("id, points, created_at")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(3);

      setRecentVisits((lastTxs as any) ?? []);

      const fiftyDaysAgo = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
      const { data: posts } = await supabase
        .from("feed_posts")
        .select("id, content, image_url, audio_url, created_at")
        .gte("created_at", fiftyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(20);
      const postList = (posts as { id: number; content: string; image_url: string | null; audio_url: string | null; created_at: string }[]) ?? [];
      setFeedPosts(postList);

      if (postList.length > 0 && user) {
        const postIds = postList.map((p) => p.id);
        const { data: reactions } = await supabase
          .from("feed_post_reactions")
          .select("post_id, emoji, created_by")
          .in("post_id", postIds);
        const byPost: Record<number, { counts: Record<string, number>; myEmoji: string | null }> = {};
        postList.forEach((p) => {
          byPost[p.id] = { counts: {}, myEmoji: null };
        });
        (reactions ?? []).forEach((r: { post_id: number; emoji: string; created_by: string }) => {
          if (!byPost[r.post_id]) return;
          byPost[r.post_id].counts[r.emoji] = (byPost[r.post_id].counts[r.emoji] ?? 0) + 1;
          if (r.created_by === user.id) byPost[r.post_id].myEmoji = r.emoji;
        });
        setReactionsByPost(byPost);
      } else {
        setReactionsByPost({});
      }

      const today = new Date().toISOString().slice(0, 10);
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select(
          "id, slot_id, prestation_id, prestations ( title, description, price_eur, price_points ), availability_slots ( slot_date, start_time, end_time, address, place_image_urls, created_by )"
        )
        .eq("customer_id", customer.id);

      type Row = {
        id: number;
        slot_id: number;
        prestation_id: number | null;
        prestations:
          | { title: string; description: string | null; price_eur: number; price_points: number }
          | { title: string; description: string | null; price_eur: number; price_points: number }[]
          | null;
        availability_slots: {
          slot_date: string;
          start_time: string;
          end_time: string;
          address: string | null;
          place_image_urls?: unknown;
          created_by: string;
        } | {
          slot_date: string;
          start_time: string;
          end_time: string;
          address: string | null;
          place_image_urls?: unknown;
          created_by: string;
        }[] | null;
      };

      const partial = (bookingsData ?? [])
        .map((b) => {
          const row = b as Row;
          const slot = firstRel(row.availability_slots);
          if (!slot) return null;
          const prest = firstRel(row.prestations);
          return {
            id: row.id,
            slot_id: row.slot_id,
            slot_date: slot.slot_date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            address: slot.address ?? null,
            place_image_urls: parsePlaceImageUrls(slot.place_image_urls),
            barberUserId: slot.created_by,
            prestationTitle: prest?.title ?? null,
            prestationDescription:
              prest?.description != null && String(prest.description).trim() ? String(prest.description).trim() : null,
            priceEur: prest != null ? Number(prest.price_eur) : null,
            pricePoints: prest != null ? prest.price_points : null,
          };
        })
        .filter(Boolean) as {
        id: number;
        slot_id: number;
        slot_date: string;
        start_time: string;
        end_time: string;
        address: string | null;
        place_image_urls: string[];
        barberUserId: string;
        prestationTitle: string | null;
        prestationDescription: string | null;
        priceEur: number | null;
        pricePoints: number | null;
      }[];

      const barberIds = [...new Set(partial.map((p) => p.barberUserId))];
      const barberNameById: Record<string, string> = {};
      if (barberIds.length > 0) {
        const { data: barberProfiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", barberIds);
        (barberProfiles ?? []).forEach((p) => {
          const pid = (p as { id: string }).id;
          const fn = (p as { first_name: string | null }).first_name ?? "";
          const ln = (p as { last_name: string | null }).last_name ?? "";
          barberNameById[pid] = `${fn} ${ln}`.trim() || "Coiffeur";
        });
      }

      const withSlots: UpcomingBooking[] = partial.map((p) => ({
        id: p.id,
        slot_id: p.slot_id,
        slot_date: p.slot_date,
        start_time: p.start_time,
        end_time: p.end_time,
        address: p.address,
        place_image_urls: p.place_image_urls,
        barberName: barberNameById[p.barberUserId] ?? "Coiffeur",
        prestationTitle: p.prestationTitle,
        prestationDescription: p.prestationDescription,
        priceEur: p.priceEur,
        pricePoints: p.pricePoints,
      }));

      const upcoming = withSlots
        .filter((b) => b.slot_date >= today)
        .sort((a, b) => a.slot_date.localeCompare(b.slot_date) || String(a.start_time).localeCompare(String(b.start_time)));
      setBookings(upcoming);

      const { data: cancellationsData } = await supabase
        .from("booking_cancellations")
        .select("id, cancelled_at, cancel_reason, availability_slots(slot_date, start_time, end_time)")
        .eq("customer_id", customer.id)
        .order("cancelled_at", { ascending: false })
        .limit(10);
      const cancellationsList = (cancellationsData ?? []).map((c: { id: number; cancelled_at: string; cancel_reason: string | null; availability_slots: { slot_date: string; start_time: string; end_time: string } | { slot_date: string; start_time: string; end_time: string }[] | null }) => {
        const raw = c.availability_slots;
        const slot = Array.isArray(raw) ? raw[0] : raw;
        if (!slot) return null;
        return {
          id: c.id,
          cancelled_at: c.cancelled_at,
          cancel_reason: c.cancel_reason,
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
        };
      }).filter(Boolean) as CancellationItem[];
      try {
        const seenRaw = typeof window !== "undefined" ? window.localStorage.getItem(SEEN_CANCELLATIONS_KEY) : null;
        const seenIds: number[] = seenRaw ? JSON.parse(seenRaw) : [];
        const unseen = cancellationsList.filter((c) => !seenIds.includes(c.id));
        if (unseen.length > 0) setPopupCancellations(unseen);
      } catch {
        if (cancellationsList.length > 0) setPopupCancellations(cancellationsList);
      }

      setLoading(false);
    };

    run();
  }, [router]);

  // Refetch points et dernières visites quand le coiffeur a scanné (realtime dans le layout)
  useEffect(() => {
    if (!customerId || transactionUpdateVersion === 0) return;

    const refetch = async () => {
      const { data: txs } = await supabase
        .from("transactions")
        .select("points")
        .eq("customer_id", customerId);
      const total = (txs ?? []).reduce((acc: number, t: { points: number | null }) => acc + (t.points ?? 0), 0);
      setPoints(total);

      const { data: lastTxs } = await supabase
        .from("transactions")
        .select("id, points, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(3);
      setRecentVisits((lastTxs as { id: number; created_at: string; points: number | null }[]) ?? []);
    };

    refetch();
  }, [customerId, transactionUpdateVersion]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

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

  const avatarWrapperStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "16px",
    marginBottom: "20px",
  };

  const avatarCircleStyle: React.CSSProperties = {
    width: "96px",
    height: "96px",
    borderRadius: "9999px",
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "32px",
    fontWeight: 600,
    color: "#9ca3af",
  };

  const uploadLabelStyle: React.CSSProperties = {
    marginTop: "8px",
    fontSize: "13px",
    color: "#111",
    cursor: "pointer",
    textDecoration: "underline",
  };

  const setReaction = async (postId: number, emoji: string) => {
    if (!userId) return;
    const current = reactionsByPost[postId]?.myEmoji;
    if (current === emoji) {
      await supabase
        .from("feed_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("created_by", userId);
    } else {
      await supabase.from("feed_post_reactions").upsert(
        { post_id: postId, created_by: userId, emoji },
        { onConflict: "post_id,created_by" }
      );
    }
    const { data: list } = await supabase
      .from("feed_post_reactions")
      .select("post_id, emoji, created_by")
      .eq("post_id", postId);
    const counts: Record<string, number> = {};
    let myEmoji: string | null = null;
    (list ?? []).forEach((r: { emoji: string; created_by: string }) => {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
      if (r.created_by === userId) myEmoji = r.emoji;
    });
    setReactionsByPost((prev) => ({
      ...prev,
      [postId]: { counts, myEmoji },
    }));
  };

  const getCancellationPenalty = (slotDate: string, startTime: string): number => {
    const [y, m, d] = slotDate.split("-").map(Number);
    const [h, min] = String(startTime).slice(0, 5).split(":").map(Number);
    const appointment = new Date(y, m - 1, d, h ?? 0, min ?? 0, 0, 0);
    const now = new Date();
    const hoursUntil = (appointment.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil >= 48) return 0;
    if (hoursUntil >= 24) return 10;
    return 50;
  };

  const confirmCancelBooking = async () => {
    if (!cancelConfirmBooking) return;
    setCancelling(true);
    await cancelBooking(cancelConfirmBooking);
    setCancelConfirmBooking(null);
    setCancelling(false);
  };

  const cancelBooking = async (booking: UpcomingBooking) => {
    const penalty = getCancellationPenalty(booking.slot_date, booking.start_time);
    if (penalty > 0 && customerId) {
      const { error: txErr } = await supabase.from("transactions").insert({
        customer_id: customerId,
        points: -penalty,
        barber_user_id: null,
        shop_item_id: null,
      });
      if (txErr) {
        setPointsNotification("Erreur lors de l'application de la pénalité. Annulation impossible.");
        setTimeout(() => setPointsNotification(null), 4000);
        return;
      }
      setPoints((prev) => prev - penalty);
      setPointsNotification(
        penalty === 10
          ? "Réservation annulée. Pénalité de 10 points (annulation entre 24h et 48h avant le RDV)."
          : "Réservation annulée. Pénalité de 50 points (annulation à moins de 24h du RDV)."
      );
      setTimeout(() => setPointsNotification(null), 5000);
    }
    const { error } = await supabase.from("bookings").delete().eq("id", booking.id);
    if (!error) {
      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
      setBookingDetail((d) => (d?.id === booking.id ? null : d));
    }
  };

  const dismissCancellationPopup = () => {
    if (popupCancellations.length === 0) return;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(SEEN_CANCELLATIONS_KEY) : null;
      const seen: number[] = raw ? JSON.parse(raw) : [];
      const merged = [...new Set([...seen, ...popupCancellations.map((c) => c.id)])];
      if (typeof window !== "undefined") window.localStorage.setItem(SEEN_CANCELLATIONS_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    setPopupCancellations([]);
  };

  const handleAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploadError(null);

    // Aperçu immédiat depuis la galerie (la photo s’affiche tout de suite)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;
    setAvatarUrl(previewUrl);

    // Supprimer l'ancienne photo du Storage si elle venait de Supabase (libère de l'espace)
    if (avatarUrl && isSupabaseStorageUrl(avatarUrl)) {
      await removeStorageFile(avatarUrl);
    }

    let blob: Blob;
    try {
      blob = await compressImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.8 });
    } catch {
      setUploadError("Impossible de compresser l'image.");
      return;
    }
    const filePath = `${userId}/${Date.now()}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(filePath, blob, { upsert: true });

    if (uploadErr) {
      setUploadError(
        "Impossible d’enregistrer la photo. Vérifie dans Supabase : bucket « avatars » créé et autorisé en écriture pour les utilisateurs connectés."
      );
      console.error("Upload avatar:", uploadErr.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setAvatarUrl(publicUrl);

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (updateErr) {
      setUploadError(
        "Photo envoyée mais profil non mis à jour. Vérifie que la colonne « avatar_url » existe dans la table profiles."
      );
      console.error("Update profile avatar_url:", updateErr.message);
    }
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
      {popupCancellations.length > 0 && (
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
          onClick={dismissCancellationPopup}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px", color: "#111" }}>
              Rendez-vous annulé(s)
            </h3>
            <p style={{ fontSize: "14px", color: "#374151", marginBottom: "16px" }}>
              Le salon a annulé le(s) rendez-vous suivant(s) :
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: "20px" }}>
              {popupCancellations.map((c) => (
                <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <span style={{ fontSize: "14px", color: "#111", display: "block" }}>
                    {(() => {
                      const [y, m, d] = c.slot_date.split("-").map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      });
                    })()}{" "}
                    {String(c.start_time).slice(0, 5)} – {String(c.end_time).slice(0, 5)}
                  </span>
                  {c.cancel_reason && (
                    <span style={{ fontSize: "13px", color: "#6b7280", display: "block", marginTop: "4px", fontStyle: "italic" }}>
                      Motif : {c.cancel_reason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={dismissCancellationPopup}
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

      <div style={cardStyle}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 600,
            marginBottom: "4px",
            color: "#111",
            textAlign: "center",
          }}
        >
          Espace client
        </h1>
        {displayName && (
          <p
            style={{
              fontSize: "16px",
              fontWeight: 500,
              color: "#111",
              textAlign: "center",
              marginBottom: "4px",
            }}
          >
            Bienvenue {displayName}
          </p>
        )}
        <p
          style={{
            fontSize: "14px",
            color: "#4b5563",
            marginTop: "4px",
            textAlign: "center",
          }}
        >
          Page d&apos;accueil client. Utilise le menu en haut à gauche pour accéder
          à ton QR code, ton historique ou au shop.
        </p>

        <div style={avatarWrapperStyle}>
          <div style={avatarCircleStyle}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "?"
            )}
          </div>
          <label style={uploadLabelStyle}>
            Changer la photo
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
          </label>
          {uploadError && (
            <p
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "#dc2626",
                textAlign: "center",
                maxWidth: "320px",
              }}
            >
              {uploadError}
            </p>
          )}
          <div
            style={{
              marginTop: "10px",
              fontSize: "14px",
              color: "#4b5563",
            }}
          >
            Points cumulés :{" "}
            <span style={{ fontWeight: 600, color: "#111" }}>{points}</span>
          </div>
          {pointsNotification && (
            <p
              style={{
                marginTop: "10px",
                fontSize: "13px",
                color: "#16a34a",
                textAlign: "center",
              }}
            >
              {pointsNotification}
            </p>
          )}
        </div>

        {bookings.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 600,
                marginBottom: "8px",
                color: "#111",
              }}
            >
              Prochain(s) rendez-vous
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {bookings.map((b) => (
                <li
                  key={b.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    padding: "10px 0",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "14px", color: "#111" }}>
                      {(() => {
                        const [y, m, d] = b.slot_date.split("-").map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        });
                      })()}{" "}
                      {String(b.start_time).slice(0, 5)} – {String(b.end_time).slice(0, 5)}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setCancelConfirmBooking(null);
                          setBookingDetail(b);
                        }}
                        style={{
                          fontSize: "12px",
                          color: "#374151",
                          background: "#fff",
                          border: "1px solid #d1d5db",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontWeight: 500,
                        }}
                      >
                        Détail
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBookingDetail(null);
                          setCancelConfirmBooking(b);
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
                        Annuler
                      </button>
                    </div>
                  </div>
                  {b.place_image_urls.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {b.place_image_urls.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt="Lieu du rendez-vous" style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb" }} />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {bookingDetail && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 99,
              padding: "20px",
            }}
            onClick={() => setBookingDetail(null)}
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
              <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "#111" }}>
                Détail de la réservation
              </h3>
              <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>
                Récapitulatif de ta commande
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: "16px", fontSize: "14px", color: "#374151" }}>
                <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <strong>Coiffeur :</strong> {bookingDetail.barberName}
                </li>
                <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <strong>Intitulé :</strong> {bookingDetail.prestationTitle ?? "—"}
                </li>
                <li
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid #e5e7eb",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "4px" }}>Prestation :</strong>
                  {bookingDetail.prestationDescription?.trim() ? bookingDetail.prestationDescription.trim() : "—"}
                </li>
                <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <strong>Date :</strong>{" "}
                  {(() => {
                    const [y, m, d] = bookingDetail.slot_date.split("-").map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
                  })()}{" "}
                  {String(bookingDetail.start_time).slice(0, 5)} – {String(bookingDetail.end_time).slice(0, 5)}
                </li>
                <li style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <strong>Tarif :</strong>{" "}
                  {bookingDetail.priceEur != null && bookingDetail.pricePoints != null
                    ? `${bookingDetail.priceEur} € — ${bookingDetail.pricePoints} points`
                    : "—"}
                </li>
                {bookingDetail.address?.trim() && (
                  <li style={{ padding: "6px 0", borderBottom: bookingDetail.place_image_urls.length ? "1px solid #e5e7eb" : "none" }}>
                    <strong>Adresse :</strong> {bookingDetail.address.trim()}
                  </li>
                )}
              </ul>
              {bookingDetail.place_image_urls.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Photos du lieu</p>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {bookingDetail.place_image_urls.map((url) => (
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
                onClick={() => setBookingDetail(null)}
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
                Fermer
              </button>
            </div>
          </div>
        )}

        {cancelConfirmBooking && (
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
            onClick={() => !cancelling && setCancelConfirmBooking(null)}
          >
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "16px",
                padding: "24px",
                maxWidth: "380px",
                width: "100%",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px", color: "#111" }}>
                Êtes-vous sûr d&apos;annuler ?
              </h3>
              <p style={{ fontSize: "14px", color: "#374151", marginBottom: "8px" }}>
                Votre réservation du{" "}
                {(() => {
                  const [y, m, d] = cancelConfirmBooking.slot_date.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
                })()}{" "}
                à {String(cancelConfirmBooking.start_time).slice(0, 5)} sera supprimée.
              </p>
              {getCancellationPenalty(cancelConfirmBooking.slot_date, cancelConfirmBooking.start_time) > 0 ? (
                <p style={{ fontSize: "14px", color: "#dc2626", fontWeight: 500, marginBottom: "20px" }}>
                  Attention : une annulation à moins de 48h du rendez-vous entraîne une pénalité de{" "}
                  {getCancellationPenalty(cancelConfirmBooking.slot_date, cancelConfirmBooking.start_time)} points
                  {getCancellationPenalty(cancelConfirmBooking.slot_date, cancelConfirmBooking.start_time) === 50
                    ? " (moins de 24h avant)."
                    : " (entre 24h et 48h avant)."}
                </p>
              ) : (
                <p style={{ fontSize: "14px", color: "#16a34a", marginBottom: "20px" }}>
                  Aucune pénalité (annulation plus de 48h avant le RDV).
                </p>
              )}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => !cancelling && setCancelConfirmBooking(null)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "10px",
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    fontSize: "14px",
                    cursor: cancelling ? "not-allowed" : "pointer",
                  }}
                >
                  Non
                </button>
                <button
                  type="button"
                  onClick={confirmCancelBooking}
                  disabled={cancelling}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: cancelling ? "not-allowed" : "pointer",
                  }}
                >
                  {cancelling ? "Annulation..." : "Oui, annuler"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: "20px" }}>
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "6px",
              color: "#111",
            }}
          >
            Dernières visites
          </h2>
          {recentVisits.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              Pas encore de visites enregistrées.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recentVisits.map((v) => (
                <li
                  key={v.id}
                  style={{
                    fontSize: "13px",
                    color: "#4b5563",
                    padding: "4px 0",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  {new Date(v.created_at).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  })}{" "}
                  – {v.points ?? 0} points
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: "24px" }}>
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "10px",
              color: "#111",
            }}
          >
            Actualités
          </h2>
          {feedPosts.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              Aucune actualité pour l&apos;instant.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {feedPosts.map((p) => (
                <li
                  key={p.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  {p.content ? (
                    <p
                      style={{
                        fontSize: "14px",
                        color: "#111",
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {p.content}
                    </p>
                  ) : null}
                  {p.image_url && (
                    <div style={{ marginTop: "6px" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image_url}
                        alt=""
                        style={{
                          maxWidth: "100%",
                          maxHeight: 200,
                          borderRadius: "8px",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  )}
                  {p.audio_url && (
                    <audio
                      controls
                      src={p.audio_url}
                      style={{ width: "100%", marginTop: "6px", height: 36 }}
                    />
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginTop: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    {FEED_EMOJIS.map((emoji) => {
                      const count = reactionsByPost[p.id]?.counts[emoji] ?? 0;
                      const isMine = reactionsByPost[p.id]?.myEmoji === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setReaction(p.id, emoji)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "8px",
                            border: isMine ? "1px solid #111" : "1px solid #e5e7eb",
                            background: isMine ? "#050608" : "transparent",
                            fontSize: "16px",
                            cursor: "pointer",
                          }}
                          title="Réagir"
                        >
                          {emoji}
                          {count > 0 && (
                            <span style={{ marginLeft: "4px", fontSize: "12px", color: "#6b7280" }}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#9ca3af",
                      marginTop: "4px",
                      display: "block",
                    }}
                  >
                    {new Date(p.created_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
