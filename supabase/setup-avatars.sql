-- ============================================================
-- Script à exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- ============================================================

-- 1) Créer le bucket "avatars" (public pour que les images s'affichent)
-- Si cette requête échoue, crée le bucket à la main : Storage → New bucket → nom "avatars", cocher Public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Politiques Storage : les utilisateurs connectés peuvent uploader dans leur dossier
DROP POLICY IF EXISTS "Users can upload avatar" ON storage.objects;
CREATE POLICY "Users can upload avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Tout le monde peut lire les avatars (affichage)
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- 3) Colonne avatar_url sur profiles (si elle n'existe pas)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url text;

-- 4) Droit de mettre à jour sa propre ligne profiles (pour avatar_url)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
