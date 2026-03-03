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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) alert(error.message);
      else router.push("/client");
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
    <div className="min-h-screen flex items-center justify-center bg-[#050607] px-4">
      {/* fond platine */}
      <div className="absolute inset-0 opacity-80 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.10),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02),rgba(255,255,255,0.06))]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* cadre platine */}
        <div className="rounded-2xl p-[1px] bg-[linear-gradient(135deg,#f5f5f5,#bfc4c9,#7f858c,#e7eaee)] shadow-[0_25px_80px_rgba(0,0,0,0.65)]">
          <div className="rounded-2xl bg-[#0b0d10]/90 backdrop-blur-xl px-7 py-8">
            <div className="text-center mb-6">
              <div className="tracking-[0.35em] text-[11px] text-[#cfd5dc]">
                JUNIOR COIFFEUR
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-white">
                {isLogin ? "Connexion" : "Inscription"}
              </h1>
              <div className="mt-2 text-xs text-[#aab2bb]">
                Sécurisé • QR fidélité • Expérience premium
              </div>
            </div>

            {!isLogin && (
              <input
                type="text"
                placeholder="Nom complet"
                className="w-full rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/40 px-4 py-3 mb-4 outline-none focus:border-white/25"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            )}

            <input
              type="email"
              placeholder="Email"
              className="w-full rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/40 px-4 py-3 mb-4 outline-none focus:border-white/25"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Mot de passe"
              className="w-full rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/40 px-4 py-3 mb-6 outline-none focus:border-white/25"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={handleAuth}
              disabled={loading}
              className="w-full rounded-lg py-3 font-medium text-black bg-[linear-gradient(135deg,#f5f5f5,#c9ced4,#9aa2ab)] hover:brightness-110 transition disabled:opacity-60"
            >
              {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
            </button>

            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="w-full mt-4 rounded-lg py-3 font-medium text-[#e7eaee] border border-white/15 bg-white/5 hover:bg-white/10 transition"
            >
              {isLogin ? "Créer un compte" : "Déjà un compte ? Se connecter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}return (
  <div className="flex min-h-screen items-center justify-center bg-gray-100">
    <div className="bg-white p-8 rounded-xl shadow-md w-96">
      {/* ✅ Titre salon plus gros */}
      <div className="text-center mb-6">
        <div className="text-xs tracking-[0.35em] text-gray-500 uppercase">
          Junior Coiffeur
        </div>
        <h1 className="text-3xl font-bold mt-2">
          {isLogin ? "Connexion" : "Inscription"}
        </h1>
      </div>

      {!isLogin && (
        <input
          type="text"
          placeholder="Nom complet"
          className="w-full p-2 mb-4 border rounded"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      )}

      <input
        type="email"
        placeholder="Email"
        className="w-full p-2 mb-4 border rounded"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {/* ✅ plus d’espace ici */}
      <input
        type="password"
        placeholder="Mot de passe"
        className="w-full p-2 mb-6 border rounded"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        onClick={handleAuth}
        disabled={loading}
        className="w-full bg-black text-white p-2 rounded"
      >
        {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
      </button>

      {/* ✅ bouton “Créer un compte” pas blanc */}
      <button
        type="button"
        className="mt-4 w-full text-sm text-gray-700 hover:text-black underline"
        onClick={() => setIsLogin(!isLogin)}
      >
        {isLogin ? "Créer un compte" : "Déjà un compte ? Se connecter"}
      </button>
    </div>
  </div>
);