"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

export default function ClientQrPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [points, setPoints] = useState<number>(0);

  const qrValue = useMemo(() => {
    return qrToken ? `FIDELITE:${qrToken}` : "";
  }, [qrToken]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push("/auth");
        return;
      }

      const { data: existingCustomer, error: customerErr } = await supabase
        .from("customers")
        .select("id, qr_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (customerErr) {
        alert(customerErr.message);
        setLoading(false);
        return;
      }

      let customer = existingCustomer;

      if (!customer) {
        const newToken = crypto.randomUUID();

        const { data: created, error: createErr } = await supabase
          .from("customers")
          .insert({ user_id: user.id, qr_token: newToken })
          .select("id, qr_token")
          .single();

        if (createErr) {
          alert(createErr.message);
          setLoading(false);
          return;
        }

        customer = created;
      }

      setQrToken(customer!.qr_token);

      const { data: txs } = await supabase
        .from("transactions")
        .select("points")
        .eq("customer_id", customer.id);

      const total = (txs ?? []).reduce((acc, t) => acc + (t.points ?? 0), 0);
      setPoints(total);

      setLoading(false);
    };

    run();
  }, [router]);

  useEffect(() => {
    const gen = async () => {
      if (!qrValue) return;
      const url = await QRCode.toDataURL(qrValue, { margin: 2, scale: 8 });
      setQrDataUrl(url);
    };
    gen();
  }, [qrValue]);

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
            marginBottom: "6px",
            color: "#111",
          }}
        >
          Mon QR code
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
          Montre ce QR code au coiffeur pour gagner des points.
        </p>

        <div style={{ marginBottom: "20px" }}>
          <div
            style={{ fontSize: "12px", color: "#6b7280", marginBottom: "2px" }}
          >
            Points
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700 }}>{points}</div>
        </div>

        <div
          style={{
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR Code"
              style={{ width: "256px", height: "256px" }}
            />
          ) : (
            <div>QR en cours...</div>
          )}
        </div>

        <div
          style={{
            marginTop: "12px",
            fontSize: "12px",
            color: "#6b7280",
            wordBreak: "break-all",
          }}
        >
          Token: {qrToken}
        </div>
      </div>
    </div>
  );
}

