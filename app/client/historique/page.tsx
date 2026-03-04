"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Visit = {
  id: number;
  created_at: string;
  points: number | null;
};

export default function ClientHistoriquePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<Visit[]>([]);

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

      const { data: rows } = await supabase
        .from("transactions")
        .select("id, created_at, points")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });

      setVisits((rows as Visit[]) ?? []);
      setLoading(false);
    };

    run();
  }, [router]);

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#050608",
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
            marginBottom: "6px",
            color: "#111",
          }}
        >
          Historique des visites
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#4b5563",
            marginTop: "4px",
            marginBottom: "20px",
          }}
        >
          Chaque ligne correspond à un passage chez le coiffeur (scan de ton QR
          code).
        </p>

        {visits.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            Aucune visite enregistrée pour le moment.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {visits.map((v) => (
              <li
                key={v.id}
                style={{
                  fontSize: "14px",
                  color: "#374151",
                  padding: "12px 0",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  {new Date(v.created_at).toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span style={{ fontWeight: 600, color: "#111" }}>
                  +{v.points ?? 0} pts
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

