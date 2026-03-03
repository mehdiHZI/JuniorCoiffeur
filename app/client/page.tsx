"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ClientHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push("/auth");
        return;
      }

      setLoading(false);
    };

    run();
  }, [router]);

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
    position: "relative",
  };

  const menuButtonStyle: React.CSSProperties = {
    position: "absolute",
    top: "8px",
    left: "8px",
    padding: "6px 10px",
    borderRadius: "9999px",
    border: "1px solid #d1d5db",
    backgroundColor: "#fff",
    fontSize: "13px",
    cursor: "pointer",
  };

  const menuStyle: React.CSSProperties = {
    position: "absolute",
    top: "40px",
    left: "8px",
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb",
    minWidth: "160px",
    zIndex: 10,
    overflow: "hidden",
  };

  const menuItemStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "8px 12px",
    fontSize: "14px",
    border: "none",
    background: "white",
    cursor: "pointer",
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
              style={menuItemStyle}
              onClick={() => {
                setMenuOpen(false);
                router.push("/client/qr");
              }}
            >
              QR Code
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onClick={() => {
                setMenuOpen(false);
                router.push("/client/historique");
              }}
            >
              Historique
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onClick={() => {
                setMenuOpen(false);
                router.push("/client/shop");
              }}
            >
              Shop
            </button>
          </div>
        )}

        <h1
          style={{
            fontSize: "22px",
            fontWeight: 600,
            marginBottom: "6px",
            color: "#111",
            textAlign: "center",
          }}
        >
          Espace client
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#4b5563",
            marginTop: "8px",
            textAlign: "center",
          }}
        >
          Page d&apos;accueil client. Utilise le menu pour accéder à ton QR
          code, ton historique ou au shop.
        </p>
      </div>
    </div>
  );
}
