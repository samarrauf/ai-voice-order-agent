// Creates ONE staff login (table staff_accounts, migration 0017).
//
// Run:
//   node --env-file=.env.local scripts/create-staff-account.mjs --restaurant <id or exact name> --username <name> --role owner|staff
//
// It makes a random strong password itself and prints it ONCE in this
// terminal. The password is not saved anywhere (only its scrypt hash goes into
// the database), so copy it into a password manager straight away. Lost it?
// There is no reset yet: delete the account row and create it again.
//
// Uses the service-role key, and only ever INSERTS one row into staff_accounts.

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../lib/passwords.ts";

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message) {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    restaurant: { type: "string" },
    username: { type: "string" },
    role: { type: "string" },
  },
});

const restaurantArg = values.restaurant?.trim();
const username = values.username?.trim().toLowerCase();
const role = values.role?.trim().toLowerCase();

if (!restaurantArg || !username || !role) {
  fail("usage: --restaurant <id or exact name> --username <name> --role owner|staff");
}
if (!USERNAME.test(username)) fail("username must be 3-50 characters: a-z, 0-9, dot, dash or underscore (starting with a letter or number)");
if (role !== "owner" && role !== "staff") fail("role must be 'owner' or 'staff'");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("Supabase keys missing. Run with: node --env-file=.env.local scripts/create-staff-account.mjs ...");
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Find the restaurant: by id, or by its exact name (must match exactly one).
const lookup = UUID.test(restaurantArg)
  ? await db.from("restaurants").select("id, name").eq("id", restaurantArg)
  : await db.from("restaurants").select("id, name").eq("name", restaurantArg);
if (lookup.error) fail(`could not look up the restaurant: ${lookup.error.message}`);
if (lookup.data.length === 0) fail(`no restaurant found for "${restaurantArg}"`);
if (lookup.data.length > 1) fail(`more than one restaurant is called "${restaurantArg}"; use its id instead`);
const restaurant = lookup.data[0];

const taken = await db.from("staff_accounts").select("id").eq("username", username).maybeSingle();
if (taken.error) fail(`could not check the username: ${taken.error.message}`);
if (taken.data) fail(`username "${username}" is already taken`);

// 18 random bytes = 24 characters, about 144 bits: far beyond guessing.
const password = randomBytes(18).toString("base64url");

const insert = await db
  .from("staff_accounts")
  .insert({ restaurant_id: restaurant.id, username, password_hash: await hashPassword(password), role })
  .select("id")
  .single();
if (insert.error) fail(`could not create the account: ${insert.error.message}`);

console.log("");
console.log("  Staff account created");
console.log("  ---------------------");
console.log(`  Restaurant : ${restaurant.name}`);
console.log(`  Username   : ${username}`);
console.log(`  Role       : ${role}`);
console.log(`  Password   : ${password}`);
console.log("");
console.log("  Save this password in your password manager NOW.");
console.log("  It is shown only this once and is not stored anywhere.");
console.log("");
