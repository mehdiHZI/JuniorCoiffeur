"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type ContextValue = {
  transactionUpdateVersion: number;
};

const ClientRealtimeContext = createContext<ContextValue>({ transactionUpdateVersion: 0 });

export function useClientRealtime() {
  const ctx = useContext(ClientRealtimeContext);
  return ctx;
}

export function ClientRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [transactionUpdateVersion, setTransactionUpdateVersion] = useState(0);
  const [toast, setToast] = useState<{ message: string; points: number } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!customer) return;

      const customerId = (customer as { id: string }).id;

      channel = supabase
        .channel(`client-transactions-${customerId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "transactions",
            filter: `customer_id=eq.${customerId}`,
          },
          (payload) => {
            const row = payload.new as { points?: number | null };
            const delta = row.points ?? 0;
            if (delta === 0) return;
            setTransactionUpdateVersion((v) => v + 1);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            if (delta > 0) {
              setToast({ message: "Tu viens de recevoir des points chez ton coiffeur.", points: delta });
            } else {
              setToast({ message: "Le salon a retiré des points sur ton compte.", points: delta });
            }
            toastTimeoutRef.current = setTimeout(() => {
              setToast(null);
              toastTimeoutRef.current = null;
            }, 4000);
          }
        )
        .subscribe();
    };

    setup();
    return () => {
      if (channel) void supabase.removeChannel(channel);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const value: ContextValue = { transactionUpdateVersion };

  return (
    <ClientRealtimeContext.Provider value={value}>
      {children}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#111",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            zIndex: 9999,
            maxWidth: "90vw",
            textAlign: "center",
          }}
        >
          {toast.message}{" "}
          <strong>
            {toast.points > 0 ? "+" : ""}
            {toast.points} pts
          </strong>
        </div>
      )}
    </ClientRealtimeContext.Provider>
  );
}
