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
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-md">
        
        <h1 className="text-2xl font-semibold text-center mb-8">
          {isLogin ? "Vous avez déjà un compte ?" : "Créer un compte"}
        </h1>

        {!isLogin && (
          <div className="mb-5">
            <label className="block text-sm mb-2">Nom complet *</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Nom complet"
            />
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm mb-2">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="Email"
          />
        </div>

        <div className="mb-3">
          <label className="block text-sm mb-2">Mot de passe *</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="Mot de passe"
          />
        </div>

        {err && (
          <div className="mb-4 text-sm text-red-600">
            {err}
          </div>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-900 transition disabled:opacity-60"
        >
          {loading
            ? "Chargement..."
            : isLogin
            ? "Se connecter"
            : "Créer mon compte"}
        </button>

        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-gray-300" />
          <span className="mx-3 text-sm text-gray-500">OU</span>
          <div className="flex-1 h-px bg-gray-300" />
        </div>

        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="w-full border border-gray-300 py-3 rounded-lg font-medium hover:bg-gray-100 transition"
        >
          {isLogin
            ? "Créer mon compte"
            : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}