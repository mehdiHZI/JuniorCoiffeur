"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ClientLayout({
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
