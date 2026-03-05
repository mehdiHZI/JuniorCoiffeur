-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Permet au coiffeur de voir l'email du client qui a réservé (via profiles.email).

-- 1) Colonnes profil de base (email, prénom, nom, téléphone, date de naissance)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS birthdate date;

-- 2) À la création d’un user Auth : créer/mettre à jour le profil avec prénom, nom, téléphone, date de naissance (depuis raw_user_meta_data)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger AS $$
DECLARE
  fn text;
  ln text;
  ph text;
  bd date;
  fname text;
BEGIN
  fn := trim(coalesce(new.raw_user_meta_data->>'first_name', ''));
  ln := trim(coalesce(new.raw_user_meta_data->>'last_name', ''));
  ph := trim(coalesce(new.raw_user_meta_data->>'phone', ''));
  IF new.raw_user_meta_data->>'birthdate' IS NOT NULL AND (new.raw_user_meta_data->>'birthdate') <> '' THEN
    bd := (new.raw_user_meta_data->>'birthdate')::date;
  ELSE
    bd := NULL;
  END IF;
  fname := trim(concat(fn, ' ', ln));
  IF fname = '' THEN fname := NULL; END IF;

  INSERT INTO public.profiles (id, role, email, first_name, last_name, phone, birthdate, full_name)
  VALUES (new.id, 'client', new.email, NULLIF(fn,''), NULLIF(ln,''), NULLIF(ph,''), bd, fname)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    birthdate = COALESCE(EXCLUDED.birthdate, profiles.birthdate),
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  INSERT INTO public.customers (user_id, qr_token)
  SELECT new.id, gen_random_uuid()::text
  WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE user_id = new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile();

-- 2b) Sync email uniquement sur UPDATE (changement d’email)
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger AS $$
BEGIN
  UPDATE public.profiles SET email = new.email WHERE id = new.id;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER UPDATE OF email ON auth.users
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

-- 4bis) RLS : tout utilisateur connecté peut créer sa propre ligne profil (signup)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- 5) Rôle du user courant sans récursion RLS (évite "infinite recursion" sur policies profiles)
CREATE OR REPLACE FUNCTION public.get_my_profile_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1; $$;

-- 6) RLS : le coiffeur peut lire tous les profils (pour afficher l'email du client qui a réservé)
DROP POLICY IF EXISTS "Barbers can read profiles" ON profiles;
CREATE POLICY "Barbers can read profiles"
ON profiles FOR SELECT TO authenticated
USING (public.get_my_profile_role() = 'barber');

-- 7) Si ton compte barber existe déjà dans Auth mais pas en barber dans profiles, exécute une fois (remplace l'email) :
--    UPDATE public.profiles SET role = 'barber' WHERE id = (SELECT id FROM auth.users WHERE email = 'ton-email-barber@exemple.com');
--    Si le profil n'existe pas encore pour ce user : INSERT INTO public.profiles (id, role) SELECT id, 'barber' FROM auth.users WHERE email = 'ton-email-barber@exemple.com' ON CONFLICT (id) DO UPDATE SET role = 'barber';
