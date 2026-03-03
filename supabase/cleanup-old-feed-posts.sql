-- À exécuter périodiquement (ex. une fois par jour via cron ou manuellement)
-- Supprime les posts de plus de 50 jours (les réactions sont supprimées en CASCADE)
DELETE FROM feed_posts
WHERE created_at < now() - interval '50 days';
