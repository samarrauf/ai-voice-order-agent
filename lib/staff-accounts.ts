import { z } from "zod";
import { STAFF_ROLES } from "@/lib/permissions";

// Rules for the owner's Staff page (app/dashboard/staff) and its API
// (app/api/staff/accounts). The database function manage_staff_account_tx
// (migration 0023) checks the same rules again and makes each change together
// with its staff_account_events row.

/** New usernames: lower case, 3 to 30 characters, a-z 0-9 - _ (starting with a letter or digit). */
export const NEW_USERNAME = /^[a-z0-9][a-z0-9_-]{2,29}$/;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

const role = z.enum(STAFF_ROLES);
const id = z.guid(); // any 8-4-4-4-12 hex id (seed ids are not RFC v4)
const tenancy = { restaurant_id: z.string().optional() };

export const staffActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), username: z.string().max(100), role, ...tenancy }),
  z.strictObject({ action: z.literal("set_role"), staff_id: id, role, ...tenancy }),
  z.strictObject({ action: z.literal("deactivate"), staff_id: id, ...tenancy }),
  z.strictObject({ action: z.literal("activate"), staff_id: id, ...tenancy }),
  z.strictObject({ action: z.literal("reset_password"), staff_id: id, ...tenancy }),
]);
export type StaffAction = z.infer<typeof staffActionSchema>;

/** Error codes from manage_staff_account_tx -> HTTP status and a message for the owner. */
export const STAFF_ERRORS: Record<string, { status: number; message: string }> = {
  not_allowed: { status: 403, message: "Only an owner can manage staff." },
  not_found: { status: 404, message: "That account was not found." },
  bad_action: { status: 400, message: "Unknown action." },
  bad_username: { status: 400, message: "Username: 3 to 30 characters, a-z, 0-9, - or _ (start with a letter or digit)." },
  bad_role: { status: 400, message: "Choose owner, manager or staff." },
  bad_password_hash: { status: 500, message: "Could not set the password." },
  username_taken: { status: 409, message: "That username is already taken. Try another." },
  last_owner: { status: 409, message: "This is the last active owner: they cannot be switched off or given another role." },
  self: { status: 409, message: "You cannot change your own role, switch yourself off or reset your own password here." },
};

export const passwordChangeSchema = z.strictObject({
  current_password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  new_password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});
