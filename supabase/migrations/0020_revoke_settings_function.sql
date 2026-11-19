-- 0020_revoke_settings_function.sql
-- Paste into the Supabase SQL Editor and run once. Safe to run again. Needs 0019.
--
-- update_restaurant_settings_tx (0019) could still be CALLED by the browser's
-- anon / logged-in roles (Postgres gives every function EXECUTE to PUBLIC by
-- default). It refused them anyway (security invoker + RLS + the owner check
-- inside), but now the door is shut at the first step too: only the server's
-- service_role may execute it.
--
-- This is the only function for Settings, audit or staff accounts; there is no
-- other one to lock. (The older *_tx functions are not touched here.)
-- The one GRANT below is deliberate and asked for by the owner: EXECUTE on this
-- one function, to service_role only. Tables are not touched (CLAUDE.md rule 8).

revoke execute on function public.update_restaurant_settings_tx(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.update_restaurant_settings_tx(uuid, uuid, text, jsonb) to service_role;
