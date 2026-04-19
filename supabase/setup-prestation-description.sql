-- Si la table prestations existe déjà sans cette colonne : SQL Editor → Run
ALTER TABLE prestations ADD COLUMN IF NOT EXISTS description text;
