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

  const handleAuth = async () => {
    setLoading(true);
    setErr("");

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      const user = data.user;
      if (!user) {
        setErr("Connexion échouée.");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      router.push(profile?.role === "barber" ? "/barber" : "/client");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErr(error.message);
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
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0f1116] shadow-[0_30px_120px_rgba(0,0,0,0.8)]">
        
        {/* Header */}
        <div className="border-b border-white/10 px-8 py-8 text-center">
          <div className="text-sm tracking-widest text-white/60 uppercase">
            Junior Coiffeur
          </div>

          <h1 className="mt-4 text-3xl font-semibold">
            {isLogin ? "Connexion" : "Inscription"}
          </h1>

          <p className="mt-3 text-sm text-white/50">
            Sécurisé • QR fidélité • Expérience premium
          </p>
        </div>

        {/* Form */}
        <div className="px-8 py-8">
          {!isLogin && (
            <div className="mb-6">
              <label className="block text-sm text-white/80 mb-2">
                Nom complet
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white outline-none focus:border-white transition"
                placeholder="Ex: Mehdi"
              />
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm text-white/80 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white outline-none focus:border-white transition"
              placeholder="ex: mehdi@mail.com"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm text-white/80 mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white outline-none focus:border-white transition"
              placeholder="••••••••"
            />
          </div>

          {err && (
            <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-white">
              {err}
            </div>
          )}

          <button
            onClick={handleAuth}
            disabled={loading}
            className="w-full rounded-lg py-3 font-semibold bg-white text-black hover:bg-white/90 transition disabled:opacity-60"
          >
            {loading
              ? "Chargement..."
              : isLogin
              ? "Se connecter"
              : "Créer mon compte"}
          </button>

          <div className="my-6 h-px bg-white/10" />

          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="w-full rounded-lg py-3 font-semibold border border-white/20 hover:bg-white/10 transition"
          >
            {isLogin
              ? "Créer un compte"
              : "Déjà un compte ? Se connecter"}
          </button>

          <p className="mt-6 text-center text-xs text-white/40">
            © {new Date().getFullYear()} Junior Coiffeur
          </p>
        </div>
      </div>
    </div>
  );
}