-- À exécuter dans Supabase SQL Editor (une fois).
-- Problème : booking_outcomes.booking_id était en ON DELETE CASCADE → la suppression du booking
-- effaçait aussi l'outcome (stats fausses, pas d'historique).
-- Correction : SET NULL sur booking et slot + colonnes snapshot pour l'historique même si les lignes liées sont supprimées.

-- 1) Colonnes snapshot (si la table existe déjà sans ces colonnes)
ALTER TABLE booking_outcomes ADD COLUMN IF NOT EXISTS slot_date date;
ALTER TABLE booking_outcomes ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE booking_outcomes ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE booking_outcomes ADD COLUMN IF NOT EXISTS prestation_title text;

-- 2) Retirer les anciennes FK booking / slot
ALTER TABLE booking_outcomes DROP CONSTRAINT IF EXISTS booking_outcomes_booking_id_fkey;
ALTER TABLE booking_outcomes DROP CONSTRAINT IF EXISTS booking_outcomes_slot_id_fkey;

-- 3) Permettre NULL après suppression du booking / du créneau
ALTER TABLE booking_outcomes ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE booking_outcomes ALTER COLUMN slot_id DROP NOT NULL;

-- 4) Nouvelles FK : ne pas cascader la ligne outcome quand booking ou slot est supprimé
ALTER TABLE booking_outcomes
  ADD CONSTRAINT booking_outcomes_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

ALTER TABLE booking_outcomes
  ADD CONSTRAINT booking_outcomes_slot_id_fkey
  FOREIGN KEY (slot_id) REFERENCES availability_slots(id) ON DELETE SET NULL;

-- Note : UNIQUE(booking_id) reste valide en PostgreSQL (plusieurs NULL autorisés une fois le booking supprimé).
