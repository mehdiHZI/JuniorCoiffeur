"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ShopItem = {
  id: number;
  title: string;
  description: string;
  points: number;
  is_coupe_offerte: boolean;
};

export default function BarberShopPage() {
  const router = useRouter();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState(100);
  const [isCoupeOfferte, setIsCoupeOfferte] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async () => {
    const { data, error: err } = await supabase
      .from("shop_items")
      .select("id, title, description, points, is_coupe_offerte")
      .order("id", { ascending: true });
    if (err) {
      setError(err.message);
      setItems([]);
      return;
    }
    setItems((data as ShopItem[]) ?? []);
  };

  useEffect(() => {
    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.push("/auth");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      if ((profile as { role?: string } | null)?.role !== "barber") {
        router.push("/barber");
        return;
      }
      await loadItems();
      setLoading(false);
    };
    run();
  }, [router]);

  const handleAdd = async () => {
    const t = title.trim();
    if (!t || points < 1) {
      setError("Intitulé et points (≥ 1) requis.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data: authData } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("shop_items").insert({
      title: t,
      description: description.trim(),
      points,
      is_coupe_offerte: isCoupeOfferte,
      created_by: authData.user?.id ?? null,
    });
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    setTitle("");
    setDescription("");
    setPoints(100);
    setIsCoupeOfferte(false);
    await loadItems();
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    const { error: err } = await supabase.from("shop_items").delete().eq("id", id);
    if (!err) setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#050608",
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
          Shop
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
          Crée des objets visibles côté client. Ils pourront les acheter avec leurs points. La &quot;Coupe gratuite&quot; est un objet (coche la case si c’est une coupe offerte).
        </p>

        <input
          type="text"
          placeholder="Intitulé"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            padding: "10px 12px",
            marginBottom: "10px",
            fontSize: "14px",
          }}
        />
        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            padding: "10px 12px",
            marginBottom: "10px",
            fontSize: "14px",
            resize: "vertical",
          }}
        />
        <input
          type="number"
          min={1}
          placeholder="Points"
          value={points}
          onChange={(e) => setPoints(Number(e.target.value) || 0)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            padding: "10px 12px",
            marginBottom: "10px",
            fontSize: "14px",
          }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", fontSize: "14px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isCoupeOfferte}
            onChange={(e) => setIsCoupeOfferte(e.target.checked)}
          />
          Coupe offerte (une seule en attente par client)
        </label>
        <button
          type="button"
          onClick={handleAdd}
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
          {saving ? "Ajout..." : "Ajouter l'objet"}
        </button>

        {error && <p style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>{error}</p>}

        <h2 style={{ fontSize: "16px", fontWeight: 600, marginTop: "24px", marginBottom: "10px", color: "#111" }}>
          Objets du shop
        </h2>
        {items.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#6b7280" }}>Aucun objet. Les clients voient la liste ici.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((i) => (
              <li
                key={i.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>{i.title}</div>
                {i.description && (
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>{i.description}</div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                  <span style={{ fontSize: "13px", color: "#4b5563" }}>{i.points} points</span>
                  {i.is_coupe_offerte && (
                    <span style={{ fontSize: "12px", color: "#b45309", backgroundColor: "#fef3c7", padding: "2px 8px", borderRadius: "6px" }}>
                      Coupe offerte
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(i.id)}
                    style={{ fontSize: "12px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
