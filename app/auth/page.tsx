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
    <div className="min-h-screen flex items-center justify-center bg-[#0f1115] px-4">
      <div className="w-full max-w-md bg-[#1a1d23] rounded-xl p-8 shadow-xl border border-white/5">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-xs tracking-[0.3em] uppercase text-gray-400">
            Junior Coiffeur
          </h2>

          <h1 className="text-2xl font-semibold text-white mt-3">
            {isLogin ? "Connexion" : "Inscription"}
          </h1>
        </div>

        {/* Nom complet */}
        {!isLogin && (
          <div className="mb-5">
            <label className="block text-sm text-gray-400 mb-2">
              Nom complet
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#22262d] border border-white/10 text-white focus:outline-none focus:border-white/30 transition"
            />
          </div>
        )}

        {/* Email */}
        <div className="mb-5">
          <label className="block text-sm text-gray-400 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[#22262d] border border-white/10 text-white focus:outline-none focus:border-white/30 transition"
          />
        </div>

        {/* Mot de passe */}
        <div className="mb-7">
          <label className="block text-sm text-gray-400 mb-2">
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[#22262d] border border-white/10 text-white focus:outline-none focus:border-white/30 transition"
          />
        </div>

        {/* Bouton principal */}
        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-white text-black font-medium hover:bg-gray-200 transition disabled:opacity-60"
        >
          {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
        </button>

        {/* Switch login/signup */}
        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="w-full mt-4 text-sm text-gray-400 hover:text-white transition"
        >
          {isLogin ? "Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}