import "server-only";

/*
 * SERVER-ONLY SUPABASE CLIENT — READ BEFORE USING
 *
 * This client uses SUPABASE_SERVICE_ROLE_KEY (the Supabase "secret" key).
 * That key BYPASSES ROW LEVEL SECURITY ENTIRELY: every query can read,
 * change or delete any row in any table, no matter what RLS policies say.
 *
 * - Only import this from server code (API routes, server actions).
 * - Never import it into a "use client" component. The `import "server-only"`
 *   line above makes `npm run build` FAIL if that ever happens, so the key
 *   can never be shipped to a browser.
 * - Never send this key, or raw data you didn't mean to expose, back to the
 *   caller.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    // Server code has no user session to store or refresh.
    persistSession: false,
    autoRefreshToken: false,
  },
});
