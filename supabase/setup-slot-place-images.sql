-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Photos du lieu de RDV : le coiffeur peut joindre plusieurs images par créneau (même lot 40 min).

-- 1) Colonne JSON (tableau d'URLs publiques Storage)
ALTER TABLE availability_slots
ADD COLUMN IF NOT EXISTS place_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Bucket public pour les photos du lieu
INSERT INTO storage.buckets (id, name, public)
VALUES ('slot-place-images', 'slot-place-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Upload : le coiffeur ne peut écrire que dans slot-place-images/{son_user_id}/...
DROP POLICY IF EXISTS "Barbers can upload slot place images" ON storage.objects;
CREATE POLICY "Barbers can upload slot place images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'slot-place-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Barbers can update own slot place images" ON storage.objects;
CREATE POLICY "Barbers can update own slot place images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'slot-place-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'slot-place-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Barbers can delete own slot place images" ON storage.objects;
CREATE POLICY "Barbers can delete own slot place images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'slot-place-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Lecture publique (affichage client)
DROP POLICY IF EXISTS "Public read slot place images" ON storage.objects;
CREATE POLICY "Public read slot place images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'slot-place-images');
