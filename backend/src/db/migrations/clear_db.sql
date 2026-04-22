-- ============================================================
-- clear-database.sql
-- Wipes all app data from the proof-reading-engine database.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- App tables (sections first — foreign key child of sessions)
TRUNCATE TABLE sections, sessions RESTART IDENTITY CASCADE;

-- ============================================================
-- Optional: wipe Supabase Auth users
-- WARNING: deletes all accounts and cannot be undone.
-- Uncomment only for a full environment reset.
-- ============================================================
-- DELETE FROM auth.mfa_factors;
-- DELETE FROM auth.refresh_tokens;
-- DELETE FROM auth.sessions;
-- DELETE FROM auth.users;
