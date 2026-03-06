-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Adresse du lieu de RDV : le coiffeur la renseigne lors de la création des créneaux, elle s'affiche dans la confirmation client.

ALTER TABLE availability_slots
ADD COLUMN IF NOT EXISTS address text;
