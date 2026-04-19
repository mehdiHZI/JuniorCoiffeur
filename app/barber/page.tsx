"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";

export default function BarberPage() {
  const [token, setToken] = useState("");
  /** Nombre de points à ajouter (positif) ou retirer (négatif), ex. 10 ou -5 */
  const [pointsInput, setPointsInput] = useState("10");
  const [message, setMessage] = useState("");
  const [clientPendingCoupe, setClientPendingCoupe] = useState(false);

  const [scanOn, setScanOn] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playScanBeep = () => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextClass =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // ignore audio errors (permissions / browser support)
    }
  };

  useEffect(() => {
    const t = token.trim();
    if (!t.toUpperCase().startsWith("FIDELITE:")) {
      setClientPendingCoupe(false);
      return;
    }
    const qrToken = t.replace(/^FIDELITE:\s*/i, "").trim();
    if (!qrToken) {
      setClientPendingCoupe(false);
      return;
    }
    // Vérifie si la dernière transaction du client est un achat "coupe offerte" (objet avec is_coupe_offerte)
    void (async () => {
      const { data: customer, error: customerErr } = await supabase
        .from("customers")
        .select("id")
        .eq("qr_token", qrToken)
        .maybeSingle();

      if (customerErr || !customer) {
        setClientPendingCoupe(false);
        return;
      }

      const { data: txs } = await supabase
        .from("transactions")
        .select("points, shop_item_id")
        .eq("customer_id", (customer as { id: number }).id)
        .order("created_at", { ascending: false })
        .limit(1);

      const last = (txs ?? [])[0] as { points: number | null; shop_item_id: number | null } | undefined;
      if (!last || (last.points ?? 0) >= 0) {
        setClientPendingCoupe(false);
        return;
      }
      if (last.shop_item_id == null) {
        setClientPendingCoupe(true);
        return;
      }
      const { data: item } = await supabase
        .from("shop_items")
        .select("is_coupe_offerte")
        .eq("id", last.shop_item_id)
        .maybeSingle();
      setClientPendingCoupe(!!(item as { is_coupe_offerte?: boolean } | null)?.is_coupe_offerte);
    })();
  }, [token]);

  useEffect(() => {
    if (!scanOn) return;

    setMessage("");

    // crée le scanner au moment où on clique "Activer la caméra"
    const scanner = new Html5QrcodeScanner(
      "reader",
      {
        fps: 5,
        qrbox: 250,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      },
      false
    );
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        playScanBeep();
        setToken(String(decodedText || "").trim());
        setScanOn(false); // stop automatique après scan
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, [scanOn]);

  // stop si scanOn repasse à false
  useEffect(() => {
    if (scanOn) return;
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {});
      scannerRef.current = null;
    }
  }, [scanOn]);

  const addPoints = async () => {
    setMessage("");

    if (!token.startsWith("FIDELITE:")) {
      setMessage("QR invalide");
      return;
    }

    const qrToken = token.replace("FIDELITE:", "").trim();

    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .select("id")
      .eq("qr_token", qrToken)
      .single();

    if (customerErr || !customer) {
      setMessage("Client introuvable");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const barber = authData.user;

    if (!barber) {
      setMessage("Non connecté");
      return;
    }

    const raw = pointsInput.trim().replace(",", ".").replace(/\s+/g, "");
    const delta = Number(raw);
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
      setMessage("Indique un nombre entier de points (ex. 10 ou -5).");
      return;
    }
    if (delta === 0) {
      setMessage("Indique un nombre différent de 0 (positif pour ajouter, négatif pour retirer).");
      return;
    }

    const { error: txErr } = await supabase.from("transactions").insert({
      customer_id: customer.id,
      points: delta,
      barber_user_id: barber.id,
    });

    if (txErr) {
      setMessage(txErr.message);
      return;
    }

    await supabase
      .from("customers")
      .update({ pending_coupe_offerte: false })
      .eq("id", customer.id);

    setClientPendingCoupe(false);
    setMessage(delta > 0 ? "Points ajoutés ✅" : "Points retirés ✅");
    setToken("");
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "520px",
    backgroundColor: "#ffffff",
    padding: "28px 24px",
    borderRadius: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  };

  const buttonPrimary: React.CSSProperties = {
    flex: 1,
    backgroundColor: "#111",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "9999px",
    border: "none",
    fontSize: "14px",
    cursor: "pointer",
  };

  const buttonSecondary: React.CSSProperties = {
    flex: 1,
    backgroundColor: "#fff",
    color: "#111",
    padding: "8px 12px",
    borderRadius: "9999px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    cursor: "pointer",
  };

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
          Mode coiffeur
        </h1>

        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "16px" }}>
          Scanne le QR code de ton client ou colle son contenu, puis indique les points à
          ajouter (nombre positif) ou à retirer (nombre négatif, ex.{" "}
          <strong>-10</strong>).
        </p>

        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <button
            onClick={() => setScanOn(true)}
            style={buttonPrimary}
          >
            Activer la caméra
          </button>

          <button
            onClick={() => setScanOn(false)}
            style={buttonSecondary}
          >
            Stop
          </button>
        </div>

        {/* Scanner QR */}
        <div
          id="reader"
          style={{ width: "100%", minHeight: 260, marginBottom: "16px" }}
        />

        {/* Input manuel */}
        <input
          type="text"
          placeholder="Colle ici le contenu du QR"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{
            width: "100%",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            padding: "10px 12px",
            marginBottom: "10px",
            fontSize: "14px",
          }}
        />

        <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#374151", marginBottom: "4px" }}>
          Points (positif = ajout, négatif = retrait)
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Ex. 10 ou -5"
          value={pointsInput}
          onChange={(e) => setPointsInput(e.target.value)}
          style={{
            width: "100%",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            padding: "10px 12px",
            marginBottom: "14px",
            fontSize: "14px",
          }}
        />

        <button
          onClick={addPoints}
          style={{
            width: "100%",
            backgroundColor: "#111",
            color: "#fff",
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            fontSize: "15px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Enregistrer les points
        </button>

        {clientPendingCoupe && (
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
            onClick={() => setClientPendingCoupe(false)}
          >
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "16px",
                padding: "24px",
                maxWidth: "320px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
                textAlign: "center",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#111",
                  marginBottom: "8px",
                }}
              >
                Coupe gratuite
              </p>
              <p
                style={{
                  fontSize: "14px",
                  color: "#4b5563",
                  marginBottom: "20px",
                }}
              >
                Ce client a pris une coupe gratuite dans le shop.
              </p>
              <button
                type="button"
                onClick={() => setClientPendingCoupe(false)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "#111",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}

        {message && (
          <div
            style={{
              marginTop: "14px",
              textAlign: "center",
              fontSize: "13px",
              color: "#111",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
