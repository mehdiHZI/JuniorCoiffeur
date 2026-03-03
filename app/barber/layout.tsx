"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function BarberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);


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

  const nav = (path: string) => {
    setMenuOpen(false);
    router.push(path);
  };

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
        </div>
      )}

      {children}
    </div>
  );
}
