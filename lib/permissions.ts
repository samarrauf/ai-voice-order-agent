// THE one place that says what each staff role may do. Every page, API route
// and nav link asks can(role, capability); none of them checks a role name
// directly. Later stages use these names too: some capabilities below have no
// feature yet (menu editor, cost, refunds, ...), they are listed so the rules
// are decided in one place before the features are built.
//
// Pure module (no server imports): safe for client components such as the nav.

export const STAFF_ROLES = ["owner", "manager", "staff"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);

const OWNER: readonly StaffRole[] = ["owner"];
const OWNER_MANAGER: readonly StaffRole[] = ["owner", "manager"];
const EVERYONE: readonly StaffRole[] = STAFF_ROLES;

export const CAPABILITIES = {
  // Owner only.
  settings_edit: OWNER,
  staff_manage: OWNER,
  view_cost: OWNER,
  view_profit: OWNER,
  manage_expenses: OWNER,

  // Owner + manager.
  menu_edit: OWNER_MANAGER,
  tables_edit: OWNER_MANAGER,
  cancel_order: OWNER_MANAGER,
  refund_payment: OWNER_MANAGER,
  void_item: OWNER_MANAGER,
  merge_tables: OWNER_MANAGER,
  view_reports: OWNER_MANAGER,
  close_shift: OWNER_MANAGER,

  // Everyone. apply_discount stays inside the restaurant's max_discount_percent (unchanged).
  take_order: EVERYONE,
  take_payment: EVERYONE,
  apply_discount: EVERYONE,
  print_bill: EVERYONE,
  print_kot: EVERYONE,
  hold_order: EVERYONE,
  move_table: EVERYONE,
  seat_table: EVERYONE,
  update_order_status: EVERYONE, // not cancelling: that is cancel_order
} as const satisfies Record<string, readonly StaffRole[]>;

export type Capability = keyof typeof CAPABILITIES;
export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

/** True if `role` may do `capability`. Unknown role or capability -> false. */
export function can(role: StaffRole | null | undefined, capability: Capability): boolean {
  if (!role || !Object.hasOwn(CAPABILITIES, capability)) return false;
  return (CAPABILITIES[capability] as readonly StaffRole[]).includes(role);
}

/** Labels for the Staff page. */
export const ROLE_LABELS: Record<StaffRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
