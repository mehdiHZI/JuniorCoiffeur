"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const COUPE_PRIX_POINTS = 100;

export default function ClientShopPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [points, setPoints] = useState<number>(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push("/auth");
        return;
      }

      const { data: customer, error: customerErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (customerErr || !customer) {
        setLoading(false);
        return;
      }

      setCustomerId(customer.id);

      const { data: txs } = await supabase
        .from("transactions")
        .select("points")
        .eq("customer_id", customer.id);

      const total = (txs ?? []).reduce(
        (acc: number, t: { points: number | null }) => acc + (t.points ?? 0),
        0
      );
      setPoints(total);
      setLoading(false);
    };

    run();
  }, [router]);

  const handleBuy = async () => {
    if (customerId == null || points < COUPE_PRIX_POINTS) return;
    setBuying(true);
    setMessage(null);

    const { error } = await supabase.from("transactions").insert({
      customer_id: customerId,
      points: -COUPE_PRIX_POINTS,
      barber_user_id: null,
    });

    setBuying(false);
    setConfirmOpen(false);

    if (error) {
      setMessage("Erreur : " + error.message);
      return;
    }

    setPoints((p) => p - COUPE_PRIX_POINTS);
    setMessage("Coupe offerte achetée ! 100 points ont été déduits.");
  };

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
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "#111",
          }}
        >
          Shop
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#4b5563",
            marginBottom: "24px",
          }}
        >
          Tes points : <strong>{points}</strong>
        </p>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#111" }}>
            Coupe offerte
          </div>
          <div style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
            {COUPE_PRIX_POINTS} points
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={points < COUPE_PRIX_POINTS}
            style={{
              marginTop: "14px",
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              backgroundColor: points >= COUPE_PRIX_POINTS ? "#111" : "#d1d5db",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 500,
              cursor: points >= COUPE_PRIX_POINTS ? "pointer" : "not-allowed",
            }}
          >
            Acheter
          </button>
        </div>

        {message && (
          <p
            style={{
              fontSize: "14px",
              color: message.startsWith("Erreur") ? "#dc2626" : "#16a34a",
              marginTop: "12px",
            }}
          >
            {message}
          </p>
        )}
      </div>

      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "16px",
          }}
          onClick={() => !buying && setConfirmOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "320px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              style={{
                fontSize: "16px",
                fontWeight: 500,
                color: "#111",
                marginBottom: "20px",
              }}
            >
              Êtes-vous sûr d&apos;acheter ?
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => !buying && setConfirmOpen(false)}
                disabled={buying}
                style={{
                  padding: "10px 18px",
                  borderRadius: "10px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#fff",
                  fontSize: "14px",
                  cursor: buying ? "not-allowed" : "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleBuy}
                disabled={buying}
                style={{
                  padding: "10px 18px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "#111",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: buying ? "not-allowed" : "pointer",
                }}
              >
                {buying ? "Achat..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

