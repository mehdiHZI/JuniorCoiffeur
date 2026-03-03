-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Permet les achats shop (déduction de points = transaction avec points négatifs).

-- 1) Autoriser les points négatifs (sinon erreur "transactions_points_check")
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_points_check;

-- 2) Optionnel : si l’achat échoue sur barber_user_id, autoriser null pour les achats
ALTER TABLE transactions
ALTER COLUMN barber_user_id DROP NOT NULL;

-- 3) Une seule coupe offerte en attente par client jusqu’au prochain scan du coiffeur
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS pending_coupe_offerte boolean NOT NULL DEFAULT false;
