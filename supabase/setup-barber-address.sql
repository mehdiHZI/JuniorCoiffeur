-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Adresse du lieu de RDV : le coiffeur peut la renseigner, elle s'affiche dans la confirmation client.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS address text;
