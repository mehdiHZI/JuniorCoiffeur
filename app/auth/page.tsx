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

  const handleAuth = async () => {
    setLoading(true);

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      const user = data.user;

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "barber") {
        router.push("/barber");
      } else {
        router.push("/client");
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        alert(error.message);
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
    <div className="min-h-screen flex items-center justify-center bg-[#0d0f12] px-4">
      <div className="w-full max-w-md bg-[#161a20] rounded-2xl shadow-2xl p-8 border border-white/10">
        
        {/* Titre Salon */}
        <div className="text-center mb-8">
          <h2 className="text-lg tracking-[0.4em] text-gray-400 uppercase">
            Junior Coiffeur
          </h2>

          <h1 className="text-3xl font-bold text-white mt-3">
            {isLogin ? "Connexion" : "Inscription"}
          </h1>

          <p className="text-sm text-gray-400 mt-2">
            Sécurisé • QR fidélité • Expérience premium
          </p>
        </div>

        {/* Nom complet (si inscription) */}
        {!isLogin && (
          <input
            type="text"
            placeholder="Nom complet"
            className="w-full p-3 mb-4 rounded-lg bg-[#1f242b] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}

       {/* Email */}
<div className="mb-6">
  <label className="block text-sm text-gray-300 mb-2">
    Email
  </label>
  <input
    type="email"
    placeholder="votre@email.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    className="
      w-full px-5 py-4
      rounded-full
      bg-white/10
      border border-white/15
      text-white placeholder-white/40
      shadow-[0_8px_30px_rgba(0,0,0,0.35)]
      backdrop-blur-md
      focus:outline-none
      focus:border-white/35
      focus:bg-white/12
      focus:shadow-[0_0_0_4px_rgba(255,255,255,0.08),0_12px_40px_rgba(0,0,0,0.45)]
      transition
    "
  />
</div>

{/* Mot de passe */}
<div className="mb-8">
  <label className="block text-sm text-gray-300 mb-2">
    Mot de passe
  </label>
  <input
    type="password"
    placeholder="••••••••"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    className="
      w-full px-5 py-4
      rounded-full
      bg-white/10
      border border-white/15
      text-white placeholder-white/40
      shadow-[0_8px_30px_rgba(0,0,0,0.35)]
      backdrop-blur-md
      focus:outline-none
      focus:border-white/35
      focus:bg-white/12
      focus:shadow-[0_0_0_4px_rgba(255,255,255,0.08),0_12px_40px_rgba(0,0,0,0.45)]
      transition
    "
  />
</div>

        {/* Bouton principal */}
        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full py-3 rounded-lg font-semibold bg-white text-black hover:bg-gray-200 transition disabled:opacity-50"
        >
          {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
        </button>

        {/* Bouton secondaire */}
        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="w-full mt-4 py-3 rounded-lg border border-white/20 text-gray-300 hover:bg-white/5 transition"
        >
          {isLogin ? "Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}