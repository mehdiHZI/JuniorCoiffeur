"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FeedPost = {
  id: number;
  content: string;
  created_at: string;
};

export default function BarberFeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = async () => {
    const { data, error: err } = await supabase
      .from("feed_posts")
      .select("id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (err) {
      setError(err.message);
      setPosts([]);
      return;
    }
    setPosts((data as FeedPost[]) ?? []);
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
      await loadPosts();
      setLoading(false);
    };
    run();
  }, [router]);

  const handlePost = async () => {
    const text = content.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setPosting(false);
      return;
    }
    const { error: err } = await supabase.from("feed_posts").insert({
      content: text,
      created_by: authData.user.id,
    });
    if (err) {
      setError(err.message);
      setPosting(false);
      return;
    }
    setContent("");
    await loadPosts();
    setPosting(false);
  };

  const handleDelete = async (id: number) => {
    const { error: err } = await supabase.from("feed_posts").delete().eq("id", id);
    if (!err) setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
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
        <div style={{ marginBottom: "20px" }}>
          <Link
            href="/barber"
            style={{
              fontSize: "14px",
              color: "#6b7280",
              textDecoration: "none",
            }}
          >
            ← Retour au scan
          </Link>
        </div>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "#111",
          }}
        >
          Actualités
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "16px" }}>
          Publie des actualités visibles sur l&apos;accueil des clients (genre
          tweet).
        </p>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Écris une actualité..."
          maxLength={500}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            padding: "12px",
            fontSize: "14px",
            resize: "vertical",
            marginBottom: "10px",
          }}
        />
        <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "12px" }}>
          {content.length}/500
        </div>
        <button
          type="button"
          onClick={handlePost}
          disabled={posting || !content.trim()}
          style={{
            width: "100%",
            backgroundColor: "#111",
            color: "#fff",
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            fontSize: "15px",
            fontWeight: 500,
            cursor: posting ? "not-allowed" : "pointer",
            opacity: posting || !content.trim() ? 0.7 : 1,
          }}
        >
          {posting ? "Publication..." : "Publier"}
        </button>

        {error && (
          <p style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>
            {error}
          </p>
        )}

        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginTop: "24px",
            marginBottom: "10px",
            color: "#111",
          }}
        >
          Publications récentes
        </h2>
        {posts.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#6b7280" }}>
            Aucune actualité pour l&apos;instant.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {posts.map((p) => (
              <li
                key={p.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#9ca3af",
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
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    style={{
                      fontSize: "12px",
                      color: "#dc2626",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
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
