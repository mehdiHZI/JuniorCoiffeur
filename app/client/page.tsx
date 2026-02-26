"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

export default function ClientPage() {
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

      // Récupérer le customer
            // Récupérer le customer (0 ou 1 ligne)
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

      // Si pas de customer, on le crée
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
      // Points = somme des transactions
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

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Chargement...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex justify-center">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-2">Espace client</h1>
        <p className="text-gray-600 mb-6">
          Montre ce QR code au coiffeur pour gagner des points.
        </p>

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-500">Points</div>
            <div className="text-3xl font-bold">{points}</div>
          </div>

          <button
            onClick={logout}
            className="px-3 py-2 rounded bg-black text-white"
          >
            Déconnexion
          </button>
        </div>

        <div className="border rounded-lg p-4 flex items-center justify-center">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
          ) : (
            <div>QR en cours...</div>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-500 break-all">
          Token: {qrToken}
        </div>
      </div>
    </div>
  );
}
