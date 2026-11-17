-- Rebrand to Workatent (already applied to the hosted database).
-- It rewrote the database functions that still carried the previous brand name and moved existing
-- API connections to the `workatent_api` provider id. The earlier migrations were edited in place,
-- so a fresh database already has the new name and this version is a no-op kept for history.
select 1;
