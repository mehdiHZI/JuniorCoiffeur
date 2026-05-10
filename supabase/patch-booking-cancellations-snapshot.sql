-- À exécuter dans Supabase SQL Editor (une fois).
-- Conserve l'historique des annulations coiffeur même si le créneau est supprimé plus tard,
-- et permet d'afficher date du créneau + prestation sans dépendre du booking supprimé.

ALTER TABLE booking_cancellations ADD COLUMN IF NOT EXISTS slot_date date;
ALTER TABLE booking_cancellations ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE booking_cancellations ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE booking_cancellations ADD COLUMN IF NOT EXISTS prestation_title text;

ALTER TABLE booking_cancellations DROP CONSTRAINT IF EXISTS booking_cancellations_slot_id_fkey;

ALTER TABLE booking_cancellations ALTER COLUMN slot_id DROP NOT NULL;

ALTER TABLE booking_cancellations
  ADD CONSTRAINT booking_cancellations_slot_id_fkey
  FOREIGN KEY (slot_id) REFERENCES availability_slots(id) ON DELETE SET NULL;
