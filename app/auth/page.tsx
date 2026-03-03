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
    <div className="min-h-screen bg-[#0a0c10] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-5xl rounded-2xl overflow-hidden border border-white/10 bg-[#0f131a] shadow-[0_30px_100px_rgba(0,0,0,0.6)]">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* LEFT: branding */}
          <div className="relative p-10 md:p-12 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.09),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.06),transparent_55%)]">
            <div className="text-xs tracking-[0.35em] uppercase text-white/70">
              Junior Coiffeur
            </div>

            <h1 className="mt-4 text-3xl md:text-4xl font-semibold text-white leading-tight">
              Fidélité & actu
              <br />
              pour votre salon
            </h1>

            <p className="mt-4 text-white/60 max-w-sm">
              QR fidélité, annonces du salon, boutique et avantages. Tout au même
              endroit, sur mobile.
            </p>

            <div className="mt-8 space-y-3 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                Scan QR instantané
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                Points & récompenses
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                Actualités du salon
              </div>
            </div>

            <div className="mt-10 text-xs text-white/40">
              © {new Date().getFullYear()} Junior Coiffeur
            </div>
          </div>

          {/* RIGHT: form */}
          <div className="p-8 md:p-12 bg-[#0c0f14]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white text-2xl font-semibold">
                  {isLogin ? "Connexion" : "Inscription"}
                </div>
                <div className="text-white/50 text-sm mt-1">
                  {isLogin
                    ? "Accédez à votre espace."
                    : "Créez un compte client en 30 secondes."}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-white/70 hover:text-white transition"
              >
                {isLogin ? "Créer un compte" : "J’ai déjà un compte"}
              </button>
            </div>

            <div className="mt-8 space-y-5">
              {!isLogin && (
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Nom complet
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 text-white outline-none focus:border-white/25 transition"
                    placeholder="Ex: Mehdi H."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-white/60 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 text-white outline-none focus:border-white/25 transition"
                  placeholder="exemple@email.com"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-2">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 text-white outline-none focus:border-white/25 transition"
                  placeholder="••••••••"
                />
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleAuth}
                disabled={loading}
                className="w-full rounded-xl py-3 font-medium bg-white text-black hover:bg-gray-200 transition disabled:opacity-60"
              >
                {loading
                  ? "Chargement..."
                  : isLogin
                  ? "Se connecter"
                  : "Créer mon compte"}
              </button>

              <div className="text-xs text-white/40">
                En continuant, vous acceptez les conditions d’utilisation.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}