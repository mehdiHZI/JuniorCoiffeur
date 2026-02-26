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
        // 1️⃣ créer profile
        await supabase.from("profiles").insert({
          id: user.id,
          full_name: fullName,
          role: "client",
        });

        // 2️⃣ créer customer avec QR token
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
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {isLogin ? "Connexion" : "Inscription"}
        </h1>

        {!isLogin && (
          <input
            type="text"
            placeholder="Nom complet"
            className="w-full p-2 mb-3 border rounded"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-3 border rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Mot de passe"
          className="w-full p-2 mb-4 border rounded"
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

        <p
          className="mt-4 text-center text-sm cursor-pointer text-blue-600"
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin
            ? "Créer un compte"
            : "Déjà un compte ? Se connecter"}
        </p>
      </div>
    </div>
  );
}
