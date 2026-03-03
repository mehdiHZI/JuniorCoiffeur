# Configuration Supabase pour l’avatar client

Pour que la photo de profil s’enregistre et s’affiche correctement :

## 1. Stockage (Storage)

- Dans le **tableau de bord Supabase** → **Storage** → **New bucket**.
- Nom du bucket : **`avatars`** (exactement).
- Coche **Public bucket** pour que les URLs publiques fonctionnent (affichage de l’image).
- Crée le bucket.

### Politiques RLS sur le bucket `avatars`

Dans **Storage** → **Policies** pour le bucket `avatars`, ajoute :

- **INSERT** : utilisateurs connectés peuvent uploader dans leur dossier.
  - Policy name : `Users can upload avatar`
  - Allowed operation : `INSERT`
  - Target roles : `authenticated`
  - USING : `true`
  - WITH CHECK : `bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text`

- **SELECT** : tout le monde peut lire (pour afficher les avatars).
  - Policy name : `Public read avatars`
  - Allowed operation : `SELECT`
  - Target roles : `public` (ou `anon` + `authenticated`)
  - USING : `bucket_id = 'avatars'`

(Si tu préfères tout autoriser pour tester : USING `true`, WITH CHECK `true` pour INSERT et SELECT.)

## 2. Table `profiles`

La table `profiles` doit avoir une colonne **`avatar_url`** (texte).

Dans **SQL Editor** :

```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url text;
```

Les utilisateurs connectés doivent pouvoir mettre à jour leur propre ligne :

```sql
-- Exemple de politique RLS pour profiles (update de sa propre ligne)
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

Après ça, la sélection d’une photo depuis la galerie doit afficher l’aperçu tout de suite, puis enregistrer l’image dans `avatars` et mettre à jour `profiles.avatar_url`.
