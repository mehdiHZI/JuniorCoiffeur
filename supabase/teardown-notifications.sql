-- À exécuter dans Supabase uniquement si tu avais déjà exécuté setup-notifications.sql
-- Supprime les triggers et la table notifications.

DROP TRIGGER IF EXISTS on_shop_item_created_notify ON shop_items;
DROP TRIGGER IF EXISTS on_transaction_points_notify ON transactions;
DROP TABLE IF EXISTS notifications;
