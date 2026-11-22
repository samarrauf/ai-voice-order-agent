import { Card, PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireStaffPage } from "@/lib/staff-page";
import { loadFloor, type Floor } from "@/lib/tables-data";
import { AutoRefresh } from "../auto-refresh";
import { TablesEditor } from "./tables-editor";
import { TablesFloor } from "./tables-floor";

// Tables & venue (P3a). Everyone logged in sees the live floor and can seat / clear a table
// (capability seat_table). Only tables_edit (owner and manager) also gets the editor below it;
// /api/staff/tables refuses everyone else with 403. The restaurant comes from the login session.

export default async function TablesPage() {
  const me = await requireStaffPage();
  const rid = me.restaurantId;

  let floor: Floor;
  try {
    floor = await loadFloor(rid);
  } catch (e) {
    console.error("tables page: could not load", e instanceof Error ? e.message : e);
    return (
      <div className="anim-rise">
        <PageHeader title="Tables" />
        <Card>
          <p className="text-sm text-ink-muted">Could not load the tables. Please refresh the page.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="anim-rise">
      <PageHeader title="Tables" subtitle="The dining room right now: who is sitting where, and what is booked soon." />
      <AutoRefresh seconds={30} />
      <TablesFloor floor={floor} restaurantId={rid} canMerge={can(me.role, "merge_tables")}
        canPay={can(me.role, "take_payment")}
        canPrint={can(me.role, "print_bill")}
        canClearUnpaid={can(me.role, "clear_unpaid")}
      />
      {can(me.role, "tables_edit") && <TablesEditor floor={floor} restaurantId={rid} />}
    </div>
  );
}
