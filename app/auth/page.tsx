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

      if (profile?.role === "barber") router.push("/barber");
      else router.push("/client");
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
    <div className="min-h-screen bg-[#0b0c10] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        <div className="grid md:grid-cols-2">
          {/* Left: Brand panel */}
          <div className="p-8 md:p-10 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02))]">
            <div className="text-xs tracking-[0.35em] uppercase text-white/60">
              Junior Coiffeur
            </div>

            <h1 className="mt-4 text-4xl font-semibold leading-tight">
              Une expérience
              <span className="block text-white/70">premium.</span>
            </h1>

            <p className="mt-5 text-sm text-white/60 leading-relaxed">
              Fidélité par QR, actualités, et boutique. Conçu pour être simple,
              rapide, et élégant.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/60">Fidélité</div>
                <div className="mt-1 text-sm">QR + points</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/60">Actus</div>
                <div className="mt-1 text-sm">Salon live</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/60">Boutique</div>
                <div className="mt-1 text-sm">Points & €</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/60">Support</div>
                <div className="mt-1 text-sm">Inclus</div>
              </div>
            </div>
          </div>

          {/* Right: Form panel */}
          <div className="p-8 md:p-10 bg-[#0b0c10]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs tracking-[0.25em] uppercase text-white/50">
                  Accès
                </div>
                <h2 className="mt-2 text-2xl font-semibold">
                  {isLogin ? "Connexion" : "Créer un compte"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-white/70 hover:text-white transition"
              >
                {isLogin ? "Inscription" : "Connexion"}
              </button>
            </div>

            <div className="mt-8 space-y-5">
              {!isLogin && (
                <div>
                  <label className="text-sm text-white/60">Nom complet</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-white/30 transition"
                    placeholder="Ex: Mehdi"
                  />
                </div>
              )}

              <div>
                <label className="text-sm text-white/60">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-white/30 transition"
                  placeholder="ex: mehdi@mail.com"
                />
              </div>

              <div>
                <label className="text-sm text-white/60">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-white/30 transition"
                  placeholder="••••••••"
                />
              </div>

              {err && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {err}
                </div>
              )}

              <button
                onClick={handleAuth}
                disabled={loading}
                className="w-full rounded-xl bg-white text-black py-3 font-medium hover:bg-white/90 transition disabled:opacity-60"
              >
                {loading
                  ? "Chargement..."
                  : isLogin
                  ? "Se connecter"
                  : "Créer mon compte"}
              </button>

              <div className="text-center text-xs text-white/40">
                En continuant, tu acceptes les conditions d’utilisation.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}