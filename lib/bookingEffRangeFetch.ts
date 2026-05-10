import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 500;

/** Cast sécurisé pour les réponses `.select()` dynamiques (string de colonnes). */
function rowsFromSelect<T>(data: unknown): T[] {
  return (data ?? []) as unknown as T[];
}

function utcBounds(fromYmd: string, toYmd: string) {
  return {
    fromIso: `${fromYmd}T00:00:00.000Z`,
    toIso: `${toYmd}T23:59:59.999Z`,
  };
}

/**
 * Reproduit la date « métier » utilisée dans l’UI :
 * slot_date si présent, sinon jour calendaire du timestamp (created_at / cancelled_at).
 * Deux requêtes sans COALESCE côté SQL : lignes avec slot_date dans [from,to],
 * puis lignes sans slot_date dont le timestamp tombe dans la même plage UTC.
 */
export async function fetchOutcomesByEffDateRange<T extends { id: number }>(
  supabase: SupabaseClient,
  params: {
    barberUserId: string;
    fromYmd: string;
    toYmd: string;
    select: string;
  }
): Promise<{ data: T[]; error: string | null }> {
  const { fromIso, toIso } = utcBounds(params.fromYmd, params.toYmd);
  const byId = new Map<number, T>();

  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("booking_outcomes")
      .select(params.select)
      .eq("barber_user_id", params.barberUserId)
      .not("slot_date", "is", null)
      .gte("slot_date", params.fromYmd)
      .lte("slot_date", params.toYmd)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    const chunk = rowsFromSelect<T>(data);
    chunk.forEach((row) => byId.set(row.id, row));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("booking_outcomes")
      .select(params.select)
      .eq("barber_user_id", params.barberUserId)
      .is("slot_date", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    const chunk = rowsFromSelect<T>(data);
    chunk.forEach((row) => byId.set(row.id, row));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  return { data: [...byId.values()], error: null };
}

export async function fetchCancellationsByEffDateRange<T extends { id: number }>(
  supabase: SupabaseClient,
  params: {
    cancelledBy: string;
    fromYmd: string;
    toYmd: string;
    select: string;
  }
): Promise<{ data: T[]; error: string | null }> {
  const { fromIso, toIso } = utcBounds(params.fromYmd, params.toYmd);
  const byId = new Map<number, T>();

  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("booking_cancellations")
      .select(params.select)
      .eq("cancelled_by", params.cancelledBy)
      .not("slot_date", "is", null)
      .gte("slot_date", params.fromYmd)
      .lte("slot_date", params.toYmd)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    const chunk = rowsFromSelect<T>(data);
    chunk.forEach((row) => byId.set(row.id, row));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("booking_cancellations")
      .select(params.select)
      .eq("cancelled_by", params.cancelledBy)
      .is("slot_date", null)
      .gte("cancelled_at", fromIso)
      .lte("cancelled_at", toIso)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    const chunk = rowsFromSelect<T>(data);
    chunk.forEach((row) => byId.set(row.id, row));
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  return { data: [...byId.values()], error: null };
}

/** Charge tout l’historique (pagination complète) — à utiliser uniquement si nécessaire. */
export async function fetchAllOutcomesForBarber<T extends { id: number }>(
  supabase: SupabaseClient,
  barberUserId: string,
  select: string
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("booking_outcomes")
      .select(select)
      .eq("barber_user_id", barberUserId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    const chunk = rowsFromSelect<T>(data);
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }
  return { data: all, error: null };
}

export async function fetchAllCancellationsForBarber<T extends { id: number }>(
  supabase: SupabaseClient,
  cancelledBy: string,
  select: string
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("booking_cancellations")
      .select(select)
      .eq("cancelled_by", cancelledBy)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    const chunk = rowsFromSelect<T>(data);
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }
  return { data: all, error: null };
}
