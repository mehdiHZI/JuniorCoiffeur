"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ClientHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [points, setPoints] = useState<number>(0);
  const [recentVisits, setRecentVisits] = useState<
    { id: number; created_at: string; points: number | null }[]
  >([]);
  const [feedPosts, setFeedPosts] = useState<
    { id: number; content: string; image_url: string | null; audio_url: string | null; created_at: string }[]
  >([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        router.push("/auth");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url as string);
      }

      const { data: existingCustomer, error: customerErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (customerErr) {
        console.error(customerErr.message);
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
          console.error(createErr.message);
          setLoading(false);
          return;
        }

        customer = created as { id: number };
      }

      const { data: txs } = await supabase
        .from("transactions")
        .select("points")
        .eq("customer_id", customer.id);

      const total = (txs ?? []).reduce(
        (acc, t: { points: number | null }) => acc + (t.points ?? 0),
        0
      );
      setPoints(total);

      const { data: lastTxs } = await supabase
        .from("transactions")
        .select("id, points, created_at")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(3);

      setRecentVisits((lastTxs as any) ?? []);

      const { data: posts } = await supabase
        .from("feed_posts")
        .select("id, content, image_url, audio_url, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setFeedPosts((posts as { id: number; content: string; image_url: string | null; audio_url: string | null; created_at: string }[]) ?? []);

      setLoading(false);
    };

    run();
  }, [router]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

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

  const avatarWrapperStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "16px",
    marginBottom: "20px",
  };

  const avatarCircleStyle: React.CSSProperties = {
    width: "96px",
    height: "96px",
    borderRadius: "9999px",
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "32px",
    fontWeight: 600,
    color: "#9ca3af",
  };

  const uploadLabelStyle: React.CSSProperties = {
    marginTop: "8px",
    fontSize: "13px",
    color: "#111",
    cursor: "pointer",
    textDecoration: "underline",
  };

  const handleAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploadError(null);

    // Aperçu immédiat depuis la galerie (la photo s’affiche tout de suite)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;
    setAvatarUrl(previewUrl);

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadErr) {
      setUploadError(
        "Impossible d’enregistrer la photo. Vérifie dans Supabase : bucket « avatars » créé et autorisé en écriture pour les utilisateurs connectés."
      );
      console.error("Upload avatar:", uploadErr.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setAvatarUrl(publicUrl);

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (updateErr) {
      setUploadError(
        "Photo envoyée mais profil non mis à jour. Vérifie que la colonne « avatar_url » existe dans la table profiles."
      );
      console.error("Update profile avatar_url:", updateErr.message);
    }
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
            textAlign: "center",
          }}
        >
          Espace client
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#4b5563",
            marginTop: "8px",
            textAlign: "center",
          }}
        >
          Page d&apos;accueil client. Utilise le menu en haut à gauche pour accéder
          à ton QR code, ton historique ou au shop.
        </p>

        <div style={avatarWrapperStyle}>
          <div style={avatarCircleStyle}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "?"
            )}
          </div>
          <label style={uploadLabelStyle}>
            Changer la photo
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
          </label>
          {uploadError && (
            <p
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "#dc2626",
                textAlign: "center",
                maxWidth: "320px",
              }}
            >
              {uploadError}
            </p>
          )}
          <div
            style={{
              marginTop: "10px",
              fontSize: "14px",
              color: "#4b5563",
            }}
          >
            Points cumulés :{" "}
            <span style={{ fontWeight: 600, color: "#111" }}>{points}</span>
          </div>
        </div>

        <div>
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "6px",
              color: "#111",
            }}
          >
            Dernières visites
          </h2>
          {recentVisits.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              Pas encore de visites enregistrées.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recentVisits.map((v) => (
                <li
                  key={v.id}
                  style={{
                    fontSize: "13px",
                    color: "#4b5563",
                    padding: "4px 0",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  {new Date(v.created_at).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  })}{" "}
                  – {v.points ?? 0} points
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: "24px" }}>
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "10px",
              color: "#111",
            }}
          >
            Actualités
          </h2>
          {feedPosts.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              Aucune actualité pour l&apos;instant.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {feedPosts.map((p) => (
                <li
                  key={p.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  {p.content ? (
                    <p
                      style={{
                        fontSize: "14px",
                        color: "#111",
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {p.content}
                    </p>
                  ) : null}
                  {p.image_url && (
                    <div style={{ marginTop: "6px" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image_url}
                        alt=""
                        style={{
                          maxWidth: "100%",
                          maxHeight: 200,
                          borderRadius: "8px",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  )}
                  {p.audio_url && (
                    <audio
                      controls
                      src={p.audio_url}
                      style={{ width: "100%", marginTop: "6px", height: 36 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#9ca3af",
                      marginTop: "4px",
                      display: "block",
                    }}
                  >
                    {new Date(p.created_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
