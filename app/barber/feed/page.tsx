"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FeedPost = {
  id: number;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
};

const BUCKET = "feed-media";
const FEED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];

export default function BarberFeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [reactionsByPost, setReactionsByPost] = useState<
    Record<number, { counts: Record<string, number>; myEmoji: string | null }>
  >({});
  const [userId, setUserId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = async () => {
    const fiftyDaysAgo = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: err } = await supabase
      .from("feed_posts")
      .select("id, content, image_url, audio_url, created_at")
      .gte("created_at", fiftyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    if (err) {
      setError(err.message);
      setPosts([]);
      return;
    }
    const postList = (data as FeedPost[]) ?? [];
    setPosts(postList);

    if (postList.length > 0) {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      const postIds = postList.map((p) => p.id);
      const { data: reactions } = await supabase
        .from("feed_post_reactions")
        .select("post_id, emoji, created_by")
        .in("post_id", postIds);
      const byPost: Record<number, { counts: Record<string, number>; myEmoji: string | null }> = {};
      postList.forEach((p) => {
        byPost[p.id] = { counts: {}, myEmoji: null };
      });
      (reactions ?? []).forEach((r: { post_id: number; emoji: string; created_by: string }) => {
        if (!byPost[r.post_id]) return;
        byPost[r.post_id].counts[r.emoji] = (byPost[r.post_id].counts[r.emoji] ?? 0) + 1;
        if (uid && r.created_by === uid) byPost[r.post_id].myEmoji = r.emoji;
      });
      setReactionsByPost(byPost);
    } else {
      setReactionsByPost({});
    }
  };

  useEffect(() => {
    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.push("/auth");
        return;
      }
      setUserId(authData.user.id);
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

  const setReaction = async (postId: number, emoji: string) => {
    if (!userId) return;
    const current = reactionsByPost[postId]?.myEmoji;
    if (current === emoji) {
      await supabase
        .from("feed_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("created_by", userId);
    } else {
      await supabase.from("feed_post_reactions").upsert(
        { post_id: postId, created_by: userId, emoji },
        { onConflict: "post_id,created_by" }
      );
    }
    const { data: list } = await supabase
      .from("feed_post_reactions")
      .select("post_id, emoji, created_by")
      .eq("post_id", postId);
    const counts: Record<string, number> = {};
    let myEmoji: string | null = null;
    (list ?? []).forEach((r: { emoji: string; created_by: string }) => {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
      if (r.created_by === userId) myEmoji = r.emoji;
    });
    setReactionsByPost((prev) => ({ ...prev, [postId]: { counts, myEmoji } }));
  };

  const handlePost = async () => {
    const text = content.trim();
    if (!text && !imageFile && !audioFile) {
      setError("Ajoute au moins un texte, une image ou un vocal.");
      return;
    }
    setPosting(true);
    setError(null);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setPosting(false);
      return;
    }
    const userId = authData.user.id;

    let imageUrl: string | null = null;
    let audioUrl: string | null = null;

    if (imageFile) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, imageFile, { upsert: false });
      if (uploadErr) {
        setError("Erreur envoi image: " + uploadErr.message);
        setPosting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }

    if (audioFile) {
      const ext = audioFile.name.split(".").pop() || "webm";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, audioFile, { upsert: false });
      if (uploadErr) {
        setError("Erreur envoi vocal: " + uploadErr.message);
        setPosting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      audioUrl = urlData.publicUrl;
    }

    const { error: err } = await supabase.from("feed_posts").insert({
      content: text || "",
      image_url: imageUrl,
      audio_url: audioUrl,
      created_by: userId,
    });
    if (err) {
      setError(err.message);
      setPosting(false);
      return;
    }
    setContent("");
    setImageFile(null);
    setAudioFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
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
          Seul le coiffeur peut publier. Texte, image et/ou vocal : tout s&apos;affiche dans le fil des clients.
        </p>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Texte (optionnel si image ou vocal)..."
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

        <div style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
          <label
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              cursor: "pointer",
              backgroundColor: "#fff",
            }}
          >
            {imageFile ? imageFile.name : "➕ Image"}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
          </label>
          <label
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              cursor: "pointer",
              backgroundColor: "#fff",
            }}
          >
            {audioFile ? audioFile.name : "🎤 Vocal"}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handlePost}
          disabled={
            posting ||
            (!content.trim() && !imageFile && !audioFile)
          }
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
            opacity:
              posting || (!content.trim() && !imageFile && !audioFile) ? 0.7 : 1,
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
                  <a
                    href={p.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", marginTop: "6px" }}
                  >
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
                  </a>
                )}
                {p.audio_url && (
                  <audio
                    controls
                    src={p.audio_url}
                    style={{ width: "100%", marginTop: "6px", height: 36 }}
                  />
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  {FEED_EMOJIS.map((emoji) => {
                    const count = reactionsByPost[p.id]?.counts[emoji] ?? 0;
                    const isMine = reactionsByPost[p.id]?.myEmoji === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setReaction(p.id, emoji)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "8px",
                          border: isMine ? "1px solid #111" : "1px solid #e5e7eb",
                          background: isMine ? "#050608" : "transparent",
                          fontSize: "16px",
                          cursor: "pointer",
                        }}
                        title="Réagir"
                      >
                        {emoji}
                        {count > 0 && (
                          <span style={{ marginLeft: "4px", fontSize: "12px", color: "#6b7280" }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "6px",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "#9ca3af" }}>
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
