-- Si la table profiles existe déjà : SQL Editor -> Run
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS surnom text;
