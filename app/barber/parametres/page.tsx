"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function BarberParametresPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.push("/auth");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, address")
        .eq("id", authData.user.id)
        .maybeSingle();
      if ((profile as { role?: string } | null)?.role !== "barber") {
        router.push("/barber");
        return;
      }
      setAddress(((profile as { address?: string | null })?.address) ?? "");
      setLoading(false);
    };
    run();
  }, [router]);

  const handleSave = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    const { error: err } = await supabase
      .from("profiles")
      .update({ address: address.trim() || null })
      .eq("id", authData.user.id);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
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
          Paramètres
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
          L&apos;adresse du lieu de rendez-vous sera affichée au client lors de la confirmation de réservation.
        </p>

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>
          Adresse du RDV
        </label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex. 12 rue de la Paix, 75002 Paris"
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

        <button
          type="button"
          onClick={handleSave}
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
          {saving ? "Enregistrement..." : "Enregistrer l'adresse"}
        </button>

        {error && <p style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>{error}</p>}
        {success && <p style={{ marginTop: "12px", fontSize: "13px", color: "#16a34a" }}>Adresse enregistrée.</p>}
      </div>
    </div>
  );
}
