"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { parsePlaceImageUrls } from "@/lib/placeImageUrls";

type RdvRow = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  address: string | null;
  place_image_urls: string[];
  clientName: string;
  clientPhone: string;
  prestationTitle: string | null;
};

export default function BarberRdvPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<RdvRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.push("/auth");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      if ((profile as { role?: string } | null)?.role !== "barber") {
        router.push("/barber");
        return;
      }

      const today = new Date().toISOString().slice(0, 10);

      const { data: slots, error: slotsErr } = await supabase
        .from("availability_slots")
        .select("id, slot_date, start_time, end_time, address, place_image_urls")
        .eq("created_by", authData.user.id)
        .gte("slot_date", today)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (slotsErr || !slots?.length) {
        setList([]);
        setLoading(false);
        return;
      }

      const slotIds = (slots as { id: number }[]).map((s) => s.id);
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, slot_id, customer_id, prestation_id")
        .in("slot_id", slotIds);

      if (!bookings?.length) {
        setList([]);
        setLoading(false);
        return;
      }

      const slotMap: Record<
        number,
        { slot_date: string; start_time: string; end_time: string; address: string | null; place_image_urls: string[] }
      > = {};
      (slots as { id: number; slot_date: string; start_time: string; end_time: string; address: string | null; place_image_urls?: unknown }[]).forEach((s) => {
        slotMap[s.id] = {
          slot_date: s.slot_date,
          start_time: s.start_time,
          end_time: s.end_time,
          address: s.address ?? null,
          place_image_urls: parsePlaceImageUrls(s.place_image_urls),
        };
      });

      const customerIds = [...new Set((bookings as { customer_id: string }[]).map((b) => b.customer_id))];
      const { data: customers } = await supabase
        .from("customers")
        .select("id, user_id")
        .in("id", customerIds);

      const userIds = (customers ?? [])
        .map((c) => (c as { user_id: string }).user_id)
        .filter(Boolean) as string[];

      if (userIds.length === 0) {
        setList([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .in("id", userIds);

      const userToInfo: Record<string, { name: string; phone: string }> = {};
      (profiles ?? []).forEach((p) => {
        const pid = (p as { id: string }).id;
        const fn = (p as { first_name: string | null }).first_name ?? "";
        const ln = (p as { last_name: string | null }).last_name ?? "";
        const name = `${fn} ${ln}`.trim() || "Client";
        const phone = (p as { phone: string | null }).phone ?? "";
        userToInfo[pid] = { name, phone };
      });

      const customerToUser: Record<string, string> = {};
      (customers ?? []).forEach((c) => {
        const cid = (c as { id: string }).id;
        const uid = (c as { user_id: string }).user_id;
        customerToUser[cid] = uid;
      });

      const prestationIds = [...new Set((bookings as { prestation_id: number | null }[]).map((b) => b.prestation_id).filter(Boolean))] as number[];
      let prestationMap: Record<number, string> = {};
      if (prestationIds.length > 0) {
        const { data: prestations } = await supabase
          .from("prestations")
          .select("id, title")
          .in("id", prestationIds);
        (prestations ?? []).forEach((p) => {
          prestationMap[(p as { id: number }).id] = (p as { title: string }).title;
        });
      }

      const rows: RdvRow[] = (bookings as { id: number; slot_id: number; customer_id: string; prestation_id: number | null }[]).map((b) => {
        const slot = slotMap[b.slot_id];
        const userInfo = userToInfo[customerToUser[b.customer_id]];
        return {
          id: b.id,
          slot_date: slot?.slot_date ?? "",
          start_time: slot?.start_time ?? "",
          end_time: slot?.end_time ?? "",
          address: slot?.address ?? null,
          place_image_urls: slot?.place_image_urls ?? [],
          clientName: userInfo?.name ?? "Client",
          clientPhone: userInfo?.phone ?? "",
          prestationTitle: b.prestation_id ? (prestationMap[b.prestation_id] ?? null) : null,
        };
      });

      rows.sort((a, b) => {
        const d = a.slot_date.localeCompare(b.slot_date);
        if (d !== 0) return d;
        return String(a.start_time).localeCompare(String(b.start_time));
      });

      setList(rows);
      setLoading(false);
    };

    run();
  }, [router]);

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "24px 16px",
    paddingTop: "60px",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: "520px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    padding: "28px 24px",
    borderRadius: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: "8px", color: "#111" }}>
          Rendez-vous à venir
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
          Liste des réservations à venir, classées par date et heure.
        </p>

        {error && <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "12px" }}>{error}</p>}

        {list.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Aucun rendez-vous à venir.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {list.map((rdv) => (
              <li
                key={rdv.id}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <span style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>
                      {(() => {
                        const [y, m, d] = rdv.slot_date.split("-").map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
                      })()}
                    </span>
                    <span style={{ fontSize: "15px", color: "#374151", marginLeft: "6px" }}>
                      {String(rdv.start_time).slice(0, 5)} – {String(rdv.end_time).slice(0, 5)}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: "14px", color: "#374151", marginTop: "6px" }}>
                  <strong>Client :</strong> {rdv.clientName}
                  {rdv.clientPhone && <> — {rdv.clientPhone}</>}
                </div>
                {rdv.prestationTitle && (
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                    Prestation : {rdv.prestationTitle}
                  </div>
                )}
                {rdv.address?.trim() && (
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                    Adresse : {rdv.address.trim()}
                  </div>
                )}
                {rdv.place_image_urls.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                    {rdv.place_image_urls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="" style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e5e7eb" }} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
