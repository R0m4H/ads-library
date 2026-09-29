-- The "authenticated" role's default statement_timeout (commonly ~8s on
-- Supabase) is short enough that a sync's ad upsert can hit it even after
-- optimizing the RLS policies in 0008 — the ads table's generated
-- search_vector column and its GIN index add real per-row write cost on
-- top of whatever else is happening, and 8s isn't much headroom for a
-- batch write. Raise it specifically for this role rather than globally.

alter role authenticated set statement_timeout = '30s';
