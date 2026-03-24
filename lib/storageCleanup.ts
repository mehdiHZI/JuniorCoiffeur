/**
 * Utilitaire pour supprimer les fichiers Supabase Storage à partir de leur URL publique.
 * Utilisé pour libérer de l'espace quand on change/supprime une photo ou un post.
 */

import { supabase } from "@/lib/supabaseClient";

/**
 * Extrait le bucket et le chemin du fichier à partir d'une URL publique Supabase Storage.
 * Ex: https://xxx.supabase.co/storage/v1/object/public/avatars/userId/file.jpg
 *     -> { bucket: "avatars", path: "userId/file.jpg" }
 */
export function getStoragePathFromPublicUrl(publicUrl: string): { bucket: string; path: string } | null {
  if (!publicUrl || typeof publicUrl !== "string") return null;
  const match = publicUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], path: match[2] };
}

/**
 * Supprime un fichier du Storage à partir de son URL publique.
 * Ne fait rien si l'URL n'est pas une URL Supabase Storage (ex. object URL locale).
 */
export async function removeStorageFile(publicUrl: string): Promise<void> {
  const parsed = getStoragePathFromPublicUrl(publicUrl);
  if (!parsed) return;
  await supabase.storage.from(parsed.bucket).remove([parsed.path]);
}

/**
 * Supprime plusieurs fichiers à partir de leurs URLs publiques.
 * Ignore les URLs invalides.
 */
export async function removeStorageFiles(publicUrls: (string | null | undefined)[]): Promise<void> {
  const pathsByBucket: Record<string, string[]> = {};
  for (const url of publicUrls) {
    if (!url) continue;
    const parsed = getStoragePathFromPublicUrl(url);
    if (!parsed) continue;
    if (!pathsByBucket[parsed.bucket]) pathsByBucket[parsed.bucket] = [];
    pathsByBucket[parsed.bucket].push(parsed.path);
  }
  for (const [bucket, paths] of Object.entries(pathsByBucket)) {
    if (paths.length) await supabase.storage.from(bucket).remove(paths);
  }
}

/**
 * Retourne true si l'URL ressemble à une URL Supabase Storage (pour éviter de supprimer une preview locale).
 */
export function isSupabaseStorageUrl(url: string): boolean {
  return typeof url === "string" && url.includes("supabase") && url.includes("/storage/");
}
