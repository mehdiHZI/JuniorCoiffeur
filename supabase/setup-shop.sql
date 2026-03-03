-- Optionnel : autoriser les achats shop (déduction de points sans coiffeur).
-- Les achats insèrent une transaction avec points < 0 et barber_user_id = null.
-- Si la colonne barber_user_id est en NOT NULL, exécute ceci dans SQL Editor :
ALTER TABLE transactions
ALTER COLUMN barber_user_id DROP NOT NULL;
