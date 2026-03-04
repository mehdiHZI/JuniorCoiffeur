"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type ShopItem = {
  id: number;
  title: string;
  description: string;
  points: number;
  is_coupe_offerte: boolean;
};

export default function ClientShopPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [points, setPoints] = useState(0);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [pendingCoupeOfferte, setPendingCoupeOfferte] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
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

      const { data: existingCustomer, error: customerErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (customerErr) {
        setMessage("Erreur chargement client : " + customerErr.message);
        setLoading(false);
        return;
      }

      let customer = existingCustomer as { id: number } | null;
      if (!customer) {
        const newToken = crypto.randomUUID();
        const { data: created, error: createErr } = await supabase
          .from("customers")
          .insert({ user_id: user.id, qr_token: newToken })
          .select("id")
          .single();
        if (createErr) {
          setMessage("Erreur création client : " + createErr.message);
          setLoading(false);
          return;
        }
        customer = created as { id: number };
      }

      setCustomerId(customer.id);

      const { data: txs, error: txErr } = await supabase
        .from("transactions")
        .select("points, shop_item_id")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });

      if (txErr) {
        setMessage("Erreur chargement points : " + txErr.message);
        setLoading(false);
        return;
      }

      const list = txs ?? [];
      const total = list.reduce(
        (acc: number, t: { points: number | null }) => acc + (t.points ?? 0),
        0
      );
      setPoints(total);

      const last = list[0] as { points: number | null; shop_item_id: number | null } | undefined;

      const { data: shopItems, error: itemsErr } = await supabase
        .from("shop_items")
        .select("id, title, description, points, is_coupe_offerte")
        .order("id", { ascending: true });

      if (itemsErr) {
        setMessage("Erreur chargement shop : " + itemsErr.message);
        setLoading(false);
        return;
      }
      const itemList = (shopItems as ShopItem[]) ?? [];
      setItems(itemList);

      let hasPendingCoupe = false;
      if (last && (last.points ?? 0) < 0) {
        if (last.shop_item_id == null) hasPendingCoupe = true;
        else {
          const bought = itemList.find((i) => i.id === last.shop_item_id);
          hasPendingCoupe = !!bought?.is_coupe_offerte;
        }
      }
      setPendingCoupeOfferte(hasPendingCoupe);

      setLoading(false);
    };

    run();
  }, [router]);

  const openConfirm = (item: ShopItem) => {
    if (item.is_coupe_offerte && pendingCoupeOfferte) return;
    if (points < item.points) return;
    setSelectedItem(item);
    setConfirmOpen(true);
  };

  const handleBuy = async () => {
    if (!customerId || !selectedItem) return;
    if (points < selectedItem.points) return;
    if (selectedItem.is_coupe_offerte && pendingCoupeOfferte) return;

    setBuying(true);
    setMessage(null);

    const { error: txError } = await supabase.from("transactions").insert({
      customer_id: customerId,
      points: -selectedItem.points,
      barber_user_id: null,
      shop_item_id: selectedItem.id,
    });

    if (txError) {
      setBuying(false);
      setConfirmOpen(false);
      setMessage("Erreur : " + txError.message);
      return;
    }

    setBuying(false);
    setConfirmOpen(false);
    setSelectedItem(null);
    setPoints((p) => p - selectedItem.points);
    if (selectedItem.is_coupe_offerte) setPendingCoupeOfferte(true);
    setMessage(
      selectedItem.is_coupe_offerte
        ? "Coupe offerte achetée ! Présente-toi chez le coiffeur pour l'utiliser."
        : "Achat enregistré."
    );
  };

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
        <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: "8px", color: "#111" }}>
          Shop
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "24px" }}>
          Tes points : <strong>{points}</strong>
        </p>

        {items.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Aucun objet au shop pour l&apos;instant.</p>
        ) : (
          items.map((item) => {
            const isCoupePending = item.is_coupe_offerte && pendingCoupeOfferte;
            const canBuy = points >= item.points && !isCoupePending;
            return (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "20px",
                  marginBottom: "12px",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 600, color: "#111" }}>{item.title}</div>
                {item.description && (
                  <div style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>{item.description}</div>
                )}
                <div style={{ fontSize: "14px", color: "#4b5563", marginTop: "6px" }}>{item.points} points</div>
                {isCoupePending ? (
                  <p
                    style={{
                      marginTop: "14px",
                      fontSize: "13px",
                      color: "#b45309",
                      backgroundColor: "#fef3c7",
                      padding: "10px 12px",
                      borderRadius: "8px",
                    }}
                  >
                    Vous avez déjà une coupe offerte en attente. Présentez-vous chez le coiffeur pour l&apos;utiliser.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => openConfirm(item)}
                    disabled={!canBuy}
                    style={{
                      marginTop: "14px",
                      padding: "10px 20px",
                      borderRadius: "10px",
                      border: "none",
                      backgroundColor: canBuy ? "#111" : "#d1d5db",
                      color: "#fff",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: canBuy ? "pointer" : "not-allowed",
                    }}
                  >
                    Acheter
                  </button>
                )}
              </div>
            );
          })
        )}

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

      {confirmOpen && selectedItem && (
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
            <p style={{ fontSize: "16px", fontWeight: 500, color: "#111", marginBottom: "8px" }}>
              Acheter « {selectedItem.title} » pour {selectedItem.points} points ?
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
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
