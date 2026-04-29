"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function BarberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }
      setAuthReady(true);
    };
    check();
  }, [router]);

  const menuButtonStyle: React.CSSProperties = {
    position: "fixed",
    top: "16px",
    left: "16px",
    padding: "10px 18px",
    borderRadius: "12px",
    border: "1px solid rgba(185, 147, 47, 0.45)",
    background: "linear-gradient(180deg, #2f2a1f 0%, #1f1b14 100%)",
    color: "#f7e3a8",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    zIndex: 40,
    boxShadow: "0 8px 20px rgba(17, 24, 39, 0.22)",
  };

  const menuOverlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 45,
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: "56px",
    left: "16px",
    right: "16px",
    maxWidth: "280px",
    backgroundColor: "#fffdf7",
    borderRadius: "16px",
    boxShadow: "0 16px 40px rgba(15,23,42,0.16), 0 0 0 1px rgba(185,147,47,0.25)",
    border: "1px solid rgba(185,147,47,0.35)",
    minWidth: "200px",
    zIndex: 50,
    overflow: "hidden",
  };

  const menuItemBase: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "14px 18px",
    fontSize: "15px",
    fontWeight: 500,
    border: "none",
    borderLeft: "4px solid transparent",
    background: "#fffdf7",
    cursor: "pointer",
    color: "#111",
  };

  const activeItemExtra: React.CSSProperties = {
    backgroundColor: "#f6efdb",
    fontWeight: 700,
    borderLeft: "4px solid #b9932f",
  };

  const nav = (path: string) => {
    setMenuOpen(false);
    router.push(path);
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

      {menuOpen && (
        <>
          <div role="button" tabIndex={0} aria-label="Fermer le menu" style={menuOverlayStyle} onClick={() => setMenuOpen(false)} onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)} />
          <div style={menuStyle}>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(pathname === "/barber" ? activeItemExtra : {}),
            }}
            onClick={() => nav("/barber")}
          >
            Scanner
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(pathname.startsWith("/barber/feed") ? activeItemExtra : {}),
            }}
            onClick={() => nav("/barber/feed")}
          >
            Actualités
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(pathname.startsWith("/barber/shop") ? activeItemExtra : {}),
            }}
            onClick={() => nav("/barber/shop")}
          >
            Shop
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(pathname.startsWith("/barber/prestation") ? activeItemExtra : {}),
            }}
            onClick={() => nav("/barber/prestation")}
          >
            Prestation
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(pathname.startsWith("/barber/reservation") ? activeItemExtra : {}),
            }}
            onClick={() => nav("/barber/reservation")}
          >
            Réservation
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(pathname.startsWith("/barber/rdv") ? activeItemExtra : {}),
            }}
            onClick={() => nav("/barber/rdv")}
          >
            Rendez-vous à venir
          </button>
          <button
            type="button"
            style={{
              ...menuItemBase,
              ...(pathname.startsWith("/barber/stats") ? activeItemExtra : {}),
            }}
            onClick={() => nav("/barber/stats")}
          >
            Statistiques
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
        </>
      )}

      {children}
    </div>
  );
}
