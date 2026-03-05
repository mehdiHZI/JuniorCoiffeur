"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  const handleAuth = async () => {
    setLoading(true);
    setErr("");
    setInfo("");

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErr(error.message); setLoading(false); return; }
      const user = data.user;
      if (!user) { setErr("Connexion échouée."); setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      router.push(profile?.role === "barber" ? "/barber" : "/client");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { setErr(error.message); setLoading(false); return; }
      const user = data.user;
      if (user) {
        await supabase.from("profiles").insert({ id: user.id, full_name: fullName, role: "client", email: user.email ?? undefined });
        await supabase.from("customers").insert({ user_id: user.id, qr_token: uuidv4() });
      }
      router.push("/client");
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setErr("");
    setInfo("");

    if (!email) {
      setErr("Veuillez saisir votre adresse email.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setErr(error.message);
      return;
    }

    setInfo("Un email de réinitialisation de mot de passe vous a été envoyé.");
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f3f4f6",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 16px",
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "440px",
        backgroundColor: "#ffffff",
        padding: "40px 36px",
        borderRadius: "16px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}>

        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chriscut-logo.png"
            alt="Logo Chriscut"
            style={{ height: "90px", objectFit: "contain" }}
          />
        </div>

        {/* Title */}
        <h1 style={{ fontSize: "22px", fontWeight: 600, textAlign: "center", color: "#111", marginBottom: "12px" }}>
          {isResetMode
            ? "Réinitialiser votre mot de passe"
            : isLogin
              ? "Vous avez déjà utilisé chriscut ?"
              : "Nouveau chez chriscut ?"}
        </h1>

        {isResetMode && (
          <p style={{ fontSize: "13px", color: "#555", textAlign: "center", marginBottom: "24px" }}>
            Entrez l'adresse email associée à votre compte pour recevoir un lien de réinitialisation.
          </p>
        )}

        {/* Full name (signup only) */}
        {!isResetMode && !isLogin && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#222", marginBottom: "6px" }}>
              Nom complet *
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nom complet"
              style={inputStyle}
            />
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#222", marginBottom: "6px" }}>
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={inputStyle}
          />
        </div>

        {/* Password (hidden in reset mode) */}
        {!isResetMode && (
          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#222", marginBottom: "6px" }}>
              Mot de passe *
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                style={{ ...inputStyle, paddingRight: "48px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "#999", padding: 0,
                  display: "flex", alignItems: "center",
                }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.956 9.956 0 012.293-3.95M6.634 6.634A9.956 9.956 0 0112 5c4.477 0 8.268 2.943 9.542 7a9.97 9.97 0 01-4.176 5.166M3 3l18 18" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Forgot password / back to login */}
        {isLogin && !isResetMode && (
          <div style={{ marginBottom: "24px" }}>
            <button
              type="button"
              onClick={() => { setIsResetMode(true); setErr(""); setInfo(""); }}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontSize: "13px", color: "#333", textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Mot de passe oublié ?
            </button>
          </div>
        )}
        {isResetMode && (
          <div style={{ marginBottom: "16px", textAlign: "center" }}>
            <button
              type="button"
              onClick={() => { setIsResetMode(false); setErr(""); setInfo(""); }}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontSize: "13px", color: "#555", textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Retour à la connexion
            </button>
          </div>
        )}

        {/* Messages */}
        {err && (
          <div style={{ marginBottom: "14px", fontSize: "13px", color: "#dc2626" }}>
            {err}
          </div>
        )}
        {info && (
          <div style={{ marginBottom: "14px", fontSize: "13px", color: "#16a34a" }}>
            {info}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={isResetMode ? handleForgotPassword : handleAuth}
          disabled={loading}
          style={{
            width: "100%", backgroundColor: "#111", color: "#fff",
            padding: "14px", borderRadius: "10px", border: "none",
            fontSize: "15px", fontWeight: 500, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1, transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = "#333"; }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.backgroundColor = "#111"; }}
        >
          {loading
            ? "Chargement..."
            : isResetMode
              ? "Envoyer le lien de réinitialisation"
              : isLogin
                ? "Se connecter"
                : "Créer mon compte"}
        </button>

        {!isResetMode && (
          <>
            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", margin: "24px 0" }}>
              <div style={{ flex: 1, height: "1px", backgroundColor: "#e5e7eb" }} />
              <span style={{ margin: "0 14px", fontSize: "11px", color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase" }}>ou</span>
              <div style={{ flex: 1, height: "1px", backgroundColor: "#e5e7eb" }} />
            </div>

            {/* Switch section */}
            <h2 style={{ fontSize: "20px", fontWeight: 600, textAlign: "center", color: "#111", marginBottom: "16px" }}>
              {isLogin ? "Nouveau chez chriscut?" : "Vous avez déjà un compte ?"}
            </h2>

            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setErr(""); }}
              style={{
                width: "100%", backgroundColor: "#fff", color: "#111",
                padding: "14px", borderRadius: "10px", border: "1px solid #d1d5db",
                fontSize: "15px", fontWeight: 500, cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.backgroundColor = "#f9fafb"; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.backgroundColor = "#fff"; }}
            >
              {isLogin ? "Créer mon compte" : "Se connecter"}
            </button>
          </>
        )}

      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  padding: "13px 16px",
  fontSize: "14px",
  color: "#111",
  outline: "none",
  boxSizing: "border-box",
  backgroundColor: "#fff",
};
