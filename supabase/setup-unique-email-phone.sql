-- À exécuter dans Supabase : SQL Editor → New query → Coller → Run
-- Empêche plusieurs comptes avec le même email (déjà géré par Auth) ou le même numéro de téléphone.

-- 1) Unicité du numéro de téléphone dans profiles (les NULL et chaînes vides sont autorisés plusieurs fois)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
ON profiles (trim(phone))
WHERE phone IS NOT NULL AND trim(phone) <> '';

-- 2) Trigger : avant de créer le profil, refuser si le téléphone est déjà utilisé par un autre compte
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

  -- Empêcher l'inscription si le numéro de téléphone est déjà utilisé par un autre compte
  IF ph IS NOT NULL AND ph <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE phone IS NOT NULL AND trim(phone) = ph
    ) THEN
      RAISE EXCEPTION 'Ce numéro de téléphone est déjà utilisé par un autre compte.';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, role, email, first_name, last_name, surnom, phone, birthdate, full_name)
  VALUES (new.id, 'client', new.email, NULLIF(fn,''), NULLIF(ln,''), NULL, NULLIF(ph,''), bd, fname)
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

-- Le trigger on_auth_user_created_profile doit déjà exister (créé par setup-profile-email.sql).
-- Si tu exécutes ce script seul, recrée le trigger :
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile();
