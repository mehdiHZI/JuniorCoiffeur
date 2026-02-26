"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Html5QrcodeScanner } from "html5-qrcode";

export default function BarberPage() {
  const [token, setToken] = useState("");
  const [points, setPoints] = useState(10);
  const [message, setMessage] = useState("");

  // ✅ Scanner QR
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 5, qrbox: 250 },
      false
    );

    scanner.render(
      (decodedText) => {
        setToken(decodedText);
        scanner.clear();
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, []);

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

    const { error: txErr } = await supabase
      .from("transactions")
      .insert({
        customer_id: customer.id,
        points: Number(points),
        barber_user_id: barber.id,
      });

    if (txErr) {
      setMessage(txErr.message);
      return;
    }

    setMessage("Points ajoutés ✅");
    setToken("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-xl shadow w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Mode Coiffeur</h1>

        {/* Scanner QR */}
        <div id="reader" className="mb-4"></div>

        {/* Input manuel */}
        <input
          type="text"
          placeholder="Colle ici le contenu du QR"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full border p-2 mb-3 rounded"
        />

        <input
          type="number"
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          className="w-full border p-2 mb-3 rounded"
        />

        <button
          onClick={addPoints}
          className="w-full bg-black text-white p-2 rounded"
        >
          Ajouter les points
        </button>

        {message && (
          <div className="mt-4 text-center text-sm">{message}</div>
        )}
      </div>
    </div>
  );
}
