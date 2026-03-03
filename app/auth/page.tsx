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
  const [errorMsg, setErrorMsg] = useState("");

  const handleAuth = async () => {
    setLoading(true);
    setErrorMsg("");

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      const user = data.user;
      if (!user) {
        setErrorMsg("Connexion échouée.");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "barber") router.push("/barber");
      else router.push("/client");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      const user = data.user;

      if (user) {
        await supabase.from("profiles").insert({
          id: user.id,
          full_name: fullName,
          role: "client",
        });

        await supabase.from("customers").insert({
          user_id: user.id,
          qr_token: uuidv4(),
        });
      }

      router.push("/client");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md card-luxe gold-glow rounded-2xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="text-xs tracking-[0.35em] text-gold uppercase">
            Junior Coiffeur
          </div>
          <h1 className="text-2xl font-semibold mt-2">
            {isLogin ? "Connexion" : "Inscription"}
          </h1>
          <div className="hr-gold mt-5" />
        </div>

        {!isLogin && (
          <input
            type="text"
            placeholder="Nom complet"
            className="w-full p-3 mb-3 rounded-xl input-luxe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          className="w-full p-3 mb-3 rounded-xl input-luxe"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Mot de passe"
          className="w-full p-3 mb-4 rounded-xl input-luxe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full py-3 rounded-xl btn-luxe transition"
        >
          {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
        </button>

        <button
          type="button"
          className="mt-4 w-full text-sm text-[rgba(245,245,245,0.75)] hover:text-white transition"
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>

        <div className="mt-6 text-center text-xs text-[rgba(245,245,245,0.55)]">
          Sécurisé • QR fidélité • Expérience premium
        </div>
      </div>
    </div>
  );
}
