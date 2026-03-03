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
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm">

        {/* Title */}
        <h1 className="text-2xl font-semibold text-center text-gray-900 mb-8">
          {isLogin ? "Vous avez déjà utilisé Planity ?" : "Nouveau sur Planity ?"}
        </h1>

        {/* Full name (signup only) */}
        {!isLogin && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Nom complet *
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder-gray-400"
              placeholder="Nom complet"
            />
          </div>
        )}

        {/* Email */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder-gray-400"
            placeholder="Email"
          />
        </div>

        {/* Password */}
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Mot de passe *
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder-gray-400"
              placeholder="Mot de passe"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.956 9.956 0 012.293-3.95M6.634 6.634A9.956 9.956 0 0112 5c4.477 0 8.268 2.943 9.542 7a9.97 9.97 0 01-4.176 5.166M3 3l18 18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Forgot password */}
        {isLogin && (
          <div className="mb-6">
            <button
              type="button"
              className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900 transition"
            >
              Mot de passe oublié ?
            </button>
          </div>
        )}

        {/* Error */}
        {err && (
          <div className="mb-4 text-sm text-red-600">
            {err}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded-lg text-sm font-medium hover:bg-gray-900 transition disabled:opacity-60"
        >
          {loading
            ? "Chargement..."
            : isLogin
            ? "Se connecter"
            : "Créer mon compte"}
        </button>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="mx-4 text-xs text-gray-400 uppercase tracking-widest">ou</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Switch mode title */}
        <h2 className="text-xl font-semibold text-center text-gray-900 mb-4">
          {isLogin ? "Nouveau sur Planity ?" : "Vous avez déjà un compte ?"}
        </h2>

        {/* Switch button */}
        <button
          type="button"
          onClick={() => { setIsLogin(!isLogin); setErr(""); }}
          className="w-full border border-gray-300 py-3 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 transition"
        >
          {isLogin ? "Créer mon compte" : "Se connecter"}
        </button>

      </div>
    </div>
  );
}
