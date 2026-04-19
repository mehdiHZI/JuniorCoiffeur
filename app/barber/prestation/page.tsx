"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageCompression";
import { removeStorageFile } from "@/lib/storageCleanup";

const BUCKET = "prestations";

type Prestation = {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  price_eur: number;
  price_points: number;
  created_at: string;
};

export default function BarberPrestationPage() {
  const router = useRouter();
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceEur, setPriceEur] = useState("");
  const [pricePoints, setPricePoints] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrestations = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data, error: err } = await supabase
      .from("prestations")
      .select("id, title, description, image_url, price_eur, price_points, created_at")
      .eq("barber_id", authData.user.id)
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setPrestations([]);
      return;
    }
    setPrestations((data as Prestation[]) ?? []);
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
      await loadPrestations();
      setLoading(false);
    };
    run();
  }, [router]);

  const handleAdd = async () => {
    const t = title.trim();
    if (!t) {
      setError("L'intitulé est obligatoire.");
      return;
    }
    const eur = parseFloat(priceEur.replace(",", "."));
    if (isNaN(eur) || eur < 0) {
      setError("Prix en euros invalide.");
      return;
    }
    if (pricePoints < 0) {
      setError("Le prix en points doit être ≥ 0.");
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setSaving(true);
    setError(null);

    const desc = description.trim();
    const { data: inserted, error: insertErr } = await supabase
      .from("prestations")
      .insert({
        barber_id: authData.user.id,
        title: t,
        description: desc.length > 0 ? desc : null,
        price_eur: eur,
        price_points: pricePoints,
      })
      .select("id")
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    const id = (inserted as { id: number }).id;
    let imageUrl: string | null = null;

    if (imageFile) {
      let imageBlob: Blob;
      try {
        imageBlob = await compressImage(imageFile, { maxDimension: 1000, quality: 0.8 });
      } catch {
        setError("Impossible de compresser l'image.");
        setSaving(false);
        return;
      }
      const path = `${authData.user.id}/${id}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, imageBlob, { upsert: true });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        imageUrl = urlData.publicUrl;
        await supabase.from("prestations").update({ image_url: imageUrl }).eq("id", id);
      }
    }

    setTitle("");
    setDescription("");
    setPriceEur("");
    setPricePoints(0);
    setImageFile(null);
    await loadPrestations();
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    const prestation = prestations.find((p) => p.id === id);
    if (prestation?.image_url) await removeStorageFile(prestation.image_url);
    const { error: err } = await supabase.from("prestations").delete().eq("id", id);
    if (!err) setPrestations((prev) => prev.filter((p) => p.id !== id));
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
          Prestations
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
          Ajoute les coupes et prestations que tu proposes (intitulé, détails visibles par le client au moment de la
          réservation, photo optionnelle, prix en € et en points).
        </p>

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Intitulé *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. Coupe homme, Barbe..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "12px",
            fontSize: "14px",
          }}
        />

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>
          Prestation (texte pour le client)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex. durée estimée, style, produits utilisés, consignes avant le RDV…"
          rows={4}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "12px",
            fontSize: "14px",
            fontFamily: "inherit",
            resize: "vertical",
            minHeight: "88px",
          }}
        />

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Photo (optionnel)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          style={{ marginBottom: "12px", fontSize: "14px" }}
        />

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Prix (€)</label>
        <input
          type="text"
          inputMode="decimal"
          value={priceEur}
          onChange={(e) => setPriceEur(e.target.value)}
          placeholder="0.00"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "12px",
            fontSize: "14px",
          }}
        />

        <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#374151" }}>Prix (points)</label>
        <input
          type="number"
          min={0}
          value={pricePoints}
          onChange={(e) => setPricePoints(parseInt(e.target.value, 10) || 0)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            marginBottom: "16px",
            fontSize: "14px",
          }}
        />

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
          {saving ? "Ajout..." : "Ajouter la prestation"}
        </button>

        {error && <p style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>{error}</p>}

        <h2 style={{ fontSize: "16px", fontWeight: 600, marginTop: "24px", marginBottom: "10px", color: "#111" }}>
          Mes prestations
        </h2>
        {prestations.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#6b7280" }}>Aucune prestation pour l&apos;instant.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {prestations.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  padding: "12px 0",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt=""
                    style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "8px" }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "15px", fontWeight: 500, color: "#111" }}>{p.title}</span>
                  <p style={{ fontSize: "13px", color: "#6b7280", margin: "4px 0 0" }}>
                    {Number(p.price_eur)} € — {p.price_points} pts
                  </p>
                  {p.description?.trim() && (
                    <p style={{ fontSize: "12px", color: "#4b5563", margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                      {p.description.trim()}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  style={{ fontSize: "12px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
