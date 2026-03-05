-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Permet au coiffeur de voir l'email du client qui a réservé (via profiles.email).

-- 1) Colonnes profil de base (email, prénom, nom, téléphone, date de naissance)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS birthdate date;

-- 2) Sync email auth → profiles (insert/update auth.users)
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger AS $$
BEGIN
  UPDATE public.profiles SET email = new.email WHERE id = new.id;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_profile_email_from_auth();

-- 3) Backfill : exécuter une fois pour copier les emails existants (SQL Editor) :
--    SELECT public.backfill_profile_emails();
CREATE OR REPLACE FUNCTION public.backfill_profile_emails()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles p
  SET email = au.email
  FROM auth.users au
  WHERE au.id = p.id AND (p.email IS DISTINCT FROM au.email);
END;
$$;

-- 4) RLS : tout utilisateur connecté peut lire son propre profil (pour la redirection login barber/client)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- 5) RLS : le coiffeur peut lire tous les profils (pour afficher l'email du client qui a réservé)
DROP POLICY IF EXISTS "Barbers can read profiles" ON profiles;
CREATE POLICY "Barbers can read profiles"
ON profiles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role = 'barber'));

-- 6) Si ton compte barber existe déjà dans Auth mais pas en barber dans profiles, exécute une fois (remplace l'email) :
--    UPDATE public.profiles SET role = 'barber' WHERE id = (SELECT id FROM auth.users WHERE email = 'ton-email-barber@exemple.com');
--    Si le profil n'existe pas encore pour ce user : INSERT INTO public.profiles (id, role) SELECT id, 'barber' FROM auth.users WHERE email = 'ton-email-barber@exemple.com' ON CONFLICT (id) DO UPDATE SET role = 'barber';
