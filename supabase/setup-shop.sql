-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Permet les achats shop (déduction de points = transaction avec points négatifs).
-- Requis aussi pour que le coiffeur voie la notification "coupe offerte" au scan du QR client.

-- 1) Autoriser les points négatifs (sinon erreur "transactions_points_check")
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_points_check;

-- 2) Optionnel : si l’achat échoue sur barber_user_id, autoriser null pour les achats
ALTER TABLE transactions
ALTER COLUMN barber_user_id DROP NOT NULL;

-- 3) Une seule coupe offerte en attente par client jusqu’au prochain scan du coiffeur
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS pending_coupe_offerte boolean NOT NULL DEFAULT false;

-- 4) RLS : le client peut mettre à jour sa propre ligne (pending_coupe_offerte)
DROP POLICY IF EXISTS "Clients can update own customer row" ON customers;
CREATE POLICY "Clients can update own customer row"
ON customers FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 5) RLS : le coiffeur peut remettre pending_coupe_offerte à false après scan
DROP POLICY IF EXISTS "Barbers can clear pending_coupe_offerte" ON customers;
CREATE POLICY "Barbers can clear pending_coupe_offerte"
ON customers FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'barber')
);

-- 6) RLS : le coiffeur peut LIRE les clients (pour le scan QR et la détection coupe offerte)
DROP POLICY IF EXISTS "Barbers can read customers for scan" ON customers;
CREATE POLICY "Barbers can read customers for scan"
ON customers FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'barber')
);

-- 7) RLS : le coiffeur peut LIRE les transactions (pour détecter une coupe offerte en attente)
DROP POLICY IF EXISTS "Barbers can read transactions" ON transactions;
CREATE POLICY "Barbers can read transactions"
ON transactions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'barber')
);
