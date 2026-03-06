"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Notif = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }
      setUserId(user.id);
      setAuthReady(true);
    };
    check();
  }, [router]);

  const loadNotifications = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, payload, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as Notif[]) ?? []);
  };

  useEffect(() => {
    if (!userId) return;
    loadNotifications();
  }, [userId]);

  useEffect(() => {
    if (!userId || !authReady) return;
    const ensureBookingReminders = async () => {
      const { data: customer } = await supabase.from("customers").select("id").eq("user_id", userId).maybeSingle();
      if (!customer) return;
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("id, availability_slots(slot_date, start_time)")
        .eq("customer_id", (customer as { id: string }).id);
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const { data: existing } = await supabase.from("notifications").select("payload").eq("user_id", userId).eq("type", "booking_reminder");
      const existingIds = new Set((existing ?? []).map((n) => (n.payload as { booking_id?: number })?.booking_id).filter(Boolean));
      for (const b of bookingsData ?? []) {
        const raw = (b as { availability_slots: { slot_date: string; start_time: string } | { slot_date: string; start_time: string }[] | null }).availability_slots;
        const slot = Array.isArray(raw) ? raw[0] : raw;
        if (!slot) continue;
        const [y, m, d] = (slot as { slot_date: string }).slot_date.split("-").map(Number);
        const startStr = String((slot as { start_time: string }).start_time).slice(0, 5);
        const [sh, sm] = startStr.split(":").map(Number);
        const slotDt = new Date(y, m - 1, d, sh ?? 0, sm ?? 0);
        if (slotDt >= now && slotDt <= in24h && !existingIds.has((b as { id: number }).id)) {
          await supabase.from("notifications").insert({
            user_id: userId,
            type: "booking_reminder",
            title: "Rappel rendez-vous",
            body: "Ton rendez-vous est dans les 24 h.",
            payload: { booking_id: (b as { id: number }).id },
          });
          existingIds.add((b as { id: number }).id);
        }
      }
      await loadNotifications();
    };
    ensureBookingReminders();
  }, [userId, authReady]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const markRead = async (id: number) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId!);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const isActive = (path: string) => pathname === path;

  const menuButtonStyle: React.CSSProperties = {
    position: "fixed",
    top: "16px",
    left: "16px",
    padding: "8px 14px",
    borderRadius: "9999px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    fontSize: "14px",
    cursor: "pointer",
    zIndex: 40,
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: "56px",
    left: "16px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
    border: "1px solid #e5e7eb",
    minWidth: "180px",
    zIndex: 50,
    overflow: "hidden",
  };

  const menuItemBase: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "14px",
    border: "none",
    background: "white",
    cursor: "pointer",
  };

  const activeItemExtra: React.CSSProperties = {
    backgroundColor: "#f3f4f6",
    fontWeight: 600,
  };

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        style={menuButtonStyle}
      >
        ☰ Menu
      </button>

      <div ref={notifRef} style={{ position: "fixed", top: "16px", right: "16px", zIndex: 40 }}>
        <button
          type="button"
          onClick={() => {
            setNotifOpen((v) => {
              if (!v) void loadNotifications();
              return !v;
            });
          }}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            border: "1px solid #d1d5db",
            backgroundColor: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
            position: "relative",
          }}
          aria-label="Notifications"
        >
          🔔
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "2px",
                right: "2px",
                minWidth: "18px",
                height: "18px",
                borderRadius: "9px",
                backgroundColor: "#dc2626",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <div
            style={{
              position: "absolute",
              top: "52px",
              right: 0,
              width: "320px",
              maxHeight: "400px",
              overflow: "auto",
              backgroundColor: "#fff",
              borderRadius: "12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: "14px", color: "#111" }}>Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  style={{ fontSize: "12px", color: "#4b5563", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  Tout marquer lu
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p style={{ padding: "20px", fontSize: "13px", color: "#6b7280", margin: 0 }}>Aucune notification.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: "8px 0" }}>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => { markRead(n.id); setNotifOpen(false); }}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #f3f4f6",
                      cursor: "pointer",
                      backgroundColor: n.read_at ? "transparent" : "#f9fafb",
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: "13px", color: "#111" }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{n.body}</div>}
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                      {new Date(n.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {menuOpen && (
        <div style={menuStyle}>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(isActive("/client") ? activeItemExtra : {}),
            }}
            onClick={() => {
              setMenuOpen(false);
              router.push("/client");
            }}
          >
            Accueil
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(isActive("/client/qr") ? activeItemExtra : {}),
            }}
            onClick={() => {
              setMenuOpen(false);
              router.push("/client/qr");
            }}
          >
            QR Code
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(isActive("/client/historique") ? activeItemExtra : {}),
            }}
            onClick={() => {
              setMenuOpen(false);
              router.push("/client/historique");
            }}
          >
            Historique
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(isActive("/client/shop") ? activeItemExtra : {}),
            }}
            onClick={() => {
              setMenuOpen(false);
              router.push("/client/shop");
            }}
          >
            Shop
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(isActive("/client/reservation") ? activeItemExtra : {}),
            }}
            onClick={() => {
              setMenuOpen(false);
              router.push("/client/reservation");
            }}
          >
            Réservation
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(isActive("/client/profil") ? activeItemExtra : {}),
            }}
            onClick={() => {
              setMenuOpen(false);
              router.push("/client/profil");
            }}
          >
            Profil
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              color: "#dc2626",
              borderTop: "1px solid #e5e7eb",
            }}
            onClick={async () => {
              setMenuOpen(false);
              await supabase.auth.signOut();
              router.push("/auth");
            }}
          >
            Déconnexion
          </button>
        </div>
      )}

      {children}
    </div>
  );
}

