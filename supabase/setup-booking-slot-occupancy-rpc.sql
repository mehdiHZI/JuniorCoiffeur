-- À exécuter dans Supabase : SQL Editor → Run
-- Problème : les clients ne voient que leurs propres lignes dans `bookings` (RLS),
-- donc les créneaux réservés par d'autres restent affichés comme disponibles.
-- Cette fonction renvoie uniquement les slot_id déjà réservés (sans exposer les autres colonnes via l’API normale).

CREATE OR REPLACE FUNCTION public.get_booked_slot_ids(slot_ids bigint[])
RETURNS TABLE(slot_id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.slot_id
  FROM bookings b
  WHERE b.slot_id = ANY(slot_ids);
$$;

REVOKE ALL ON FUNCTION public.get_booked_slot_ids(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booked_slot_ids(bigint[]) TO authenticated;
