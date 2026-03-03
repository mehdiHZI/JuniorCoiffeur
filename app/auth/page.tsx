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
    <div className="min-h-screen bg-[#07080b] text-[#0e0f12] flex items-center justify-center px-4 py-10">
      {/* subtle top wave */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.10),rgba(255,255,255,0)_60%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.06),rgba(0,0,0,0)_40%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.05),rgba(0,0,0,0)_45%)]" />

      <div className="w-full max-w-3xl">
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
          {/* header bar */}
          <div className="bg-[#0b0c10] border-b border-white/10 px-6 py-5 text-white">
            <div className="text-center">
              <div className="text-sm tracking-wide text-white/70">
                Junior Coiffeur
              </div>
              <h1 className="mt-2 text-3xl font-semibold">
                {isLogin ? "Connexion" : "Inscription"}
              </h1>
              <p className="mt-2 text-sm text-white/60">
                Sécurisé • QR fidélité • Expérience premium
              </p>
            </div>
          </div>

          {/* form */}
          <div className="bg-white px-6 py-7 md:px-10 md:py-10">
            <div className="max-w-xl mx-auto">
              {!isLogin && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-[#2a2e36]">
                    Nom complet <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-[#d7dbe3] bg-[#f6f8fb] px-4 py-3 outline-none focus:border-[#8a94a6] focus:bg-white transition"
                    placeholder="Ex: Mehdi"
                  />
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-[#2a2e36]">
                  Email <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#d7dbe3] bg-[#f6f8fb] px-4 py-3 outline-none focus:border-[#8a94a6] focus:bg-white transition"
                  placeholder="ex: mehdi@mail.com"
                />
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-[#2a2e36]">
                  Mot de passe <span className="text-red-600">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#d7dbe3] bg-[#f6f8fb] px-4 py-3 outline-none focus:border-[#8a94a6] focus:bg-white transition"
                  placeholder="••••••••"
                />
              </div>

              {err && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {err}
                </div>
              )}

              {/* primary button (CAS-like yellow but "platinum" vibe) */}
              <button
                onClick={handleAuth}
                disabled={loading}
                className="w-full rounded-lg py-3 font-semibold tracking-wide text-[#111318]
                           bg-[linear-gradient(180deg,#e7e9ee,#cfd4dd)]
                           shadow-[0_6px_18px_rgba(0,0,0,0.12)]
                           hover:brightness-[0.98] active:brightness-[0.96]
                           disabled:opacity-60"
              >
                {loading
                  ? "Chargement..."
                  : isLogin
                  ? "SE CONNECTER"
                  : "CRÉER MON COMPTE"}
              </button>

              {/* separator like CAS */}
              <div className="my-6 h-px bg-[#e7e9ee]" />

              {/* secondary action */}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="w-full rounded-lg py-3 font-semibold text-white
                           bg-[#0b0c10]
                           shadow-[0_6px_18px_rgba(0,0,0,0.18)]
                           hover:bg-black transition"
              >
                {isLogin ? "Créer un compte" : "Déjà un compte ? Se connecter"}
              </button>

              <p className="mt-6 text-center text-xs text-[#6b7280]">
                Pour des raisons de sécurité, veuillez vous déconnecter lorsque
                vous avez terminé.
              </p>
            </div>
          </div>
        </div>

        {/* small footer */}
        <div className="mt-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Junior Coiffeur
        </div>
      </div>
    </div>
  );
}