"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  padding: "12px 14px",
  fontSize: "14px",
  color: "#111",
  outline: "none",
  boxSizing: "border-box",
  backgroundColor: "#fff",
};

export default function ClientProfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        router.push("/auth");
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone, birthdate")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        const p = profile as { first_name?: string | null; last_name?: string | null; phone?: string | null; birthdate?: string | null };
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
        setPhone(p.phone ?? "");
        setBirthdate(p.birthdate ? String(p.birthdate).slice(0, 10) : "");
      }
      setLoading(false);
    };
    run();
  }, [router]);

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        birthdate: birthdate || null,
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim() || null,
      })
      .eq("id", userId);

    if (error) {
      setMsg({ type: "err", text: error.message });
    } else {
      setMsg({ type: "ok", text: "Profil enregistré." });
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!email) return;
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "err", text: "Les deux nouveaux mots de passe ne correspondent pas." });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ type: "err", text: "Le nouveau mot de passe doit faire au moins 6 caractères." });
      return;
    }
    setChangingPw(true);
    setPwMsg(null);

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: oldPassword });
    if (signInErr) {
      setPwMsg({ type: "err", text: "Ancien mot de passe incorrect." });
      setChangingPw(false);
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) {
      setPwMsg({ type: "err", text: updateErr.message });
    } else {
      setPwMsg({ type: "ok", text: "Mot de passe modifié." });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPw(false);
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
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
        <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: "24px", color: "#111" }}>
          Mon profil
        </h1>

        <section style={{ marginBottom: "28px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "#374151" }}>
            Informations personnelles
          </h2>
          <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>Email (lecture seule)</label>
          <input
            type="email"
            value={email}
            readOnly
            style={{ ...inputStyle, backgroundColor: "#f9fafb", color: "#6b7280" }}
          />
          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>Prénom</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
                placeholder="Prénom"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>Nom</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
                placeholder="Nom"
              />
            </div>
          </div>
          <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginTop: "12px", marginBottom: "4px" }}>Téléphone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inputStyle}
            placeholder="06 12 34 56 78"
          />
          <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginTop: "12px", marginBottom: "4px" }}>Date de naissance</label>
          <input
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            style={inputStyle}
          />
          {msg && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: msg.type === "err" ? "#dc2626" : "#16a34a" }}>
              {msg.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={saving}
            style={{
              marginTop: "16px",
              padding: "12px 20px",
              backgroundColor: "#111",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </section>

        <section style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "#374151" }}>
            Changer le mot de passe
          </h2>
          <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>Ancien mot de passe</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
          />
          <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginTop: "12px", marginBottom: "4px" }}>Nouveau mot de passe</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
          />
          <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginTop: "12px", marginBottom: "4px" }}>Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
          />
          {pwMsg && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: pwMsg.type === "err" ? "#dc2626" : "#16a34a" }}>
              {pwMsg.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={changingPw}
            style={{
              marginTop: "16px",
              padding: "12px 20px",
              backgroundColor: "#111",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: changingPw ? "not-allowed" : "pointer",
              opacity: changingPw ? 0.7 : 1,
            }}
          >
            {changingPw ? "Modification..." : "Changer le mot de passe"}
          </button>
        </section>
      </div>
    </div>
  );
}
