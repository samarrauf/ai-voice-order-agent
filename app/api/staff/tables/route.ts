import { NextResponse } from "next/server";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { bulkNumbers, tableActionSchema } from "@/lib/tables";
import { tableBlockers, type Blockers } from "@/lib/tables-data";

// Tables & venue (P3a). Capability tables_edit (owner and manager; staff get 403).
// Body: { action: "section_add" | "section_rename" | "section_reorder" | "section_set_active"
//                | "table_add" | "table_bulk_add" | "table_update" | "table_set_active", ... }
//   - The restaurant comes from the login. A different restaurant_id in the body = 403.
//   - A table is never deleted, only switched off, so bookings and seating history stay.
//   - Switching off (or making smaller than a party that is sitting or booked) is refused
//     with a plain message while someone sits there or a confirmed booking is still ahead.
//   - Seating a table and clearing it keep using /api/staff/seat-table and /clear-table.

const fail = (code: string, message: string, status: number, details?: unknown) =>
  NextResponse.json({ success: false, error: code, message, ...(details ? { details } : {}) }, { status });

const SECTION_COLUMNS = "id, name, sort_order, is_active";
const TABLE_COLUMNS = "id, table_number, seats, section_id, is_active, notes";

function blockedMessage(table: string, b: Blockers): string {
  const parts: string[] = [];
  if (b.openSession) parts.push("guests are sitting there now");
  if (b.bookings.length > 0) {
    const first = b.bookings[0];
    const more = b.bookings.length > 1 ? ` (+${b.bookings.length - 1} more)` : "";
    parts.push(`booking ${first.reference} on ${first.date} at ${first.time} is still ahead${more}`);
  }
  return `Table ${table} cannot be switched off: ${parts.join(" and ")}. Clear the table or cancel/move the booking first.`;
}

export async function POST(request: Request) {
  const auth = await requireCapability(request, "tables_edit");
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const raw = await request.json().catch(() => null);
  const mismatch = restaurantMismatch(typeof raw?.restaurant_id === "string" ? raw.restaurant_id : null, auth.staff);
  if (mismatch) return mismatch;

  const parsed = tableActionSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("invalid_body", "Please check the form and try again.", 400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }
  const body = parsed.data;

  /** A section id must be an ACTIVE section of this restaurant (the database also refuses another restaurant's). */
  async function sectionOk(sectionId: string | null | undefined): Promise<boolean> {
    if (!sectionId) return true;
    const r = await supabaseAdmin.from("table_sections").select("id").eq("id", sectionId).eq("restaurant_id", rid).eq("is_active", true).maybeSingle();
    return !!r.data;
  }

  try {
    switch (body.action) {
      // ---------------------------------------------------------------- sections
      case "section_add": {
        const last = await supabaseAdmin.from("table_sections").select("sort_order").eq("restaurant_id", rid).order("sort_order", { ascending: false }).limit(1);
        if (last.error) throw last.error;
        const ins = await supabaseAdmin
          .from("table_sections")
          .insert({ restaurant_id: rid, name: body.name, sort_order: (last.data?.[0]?.sort_order ?? 0) + 1 })
          .select(SECTION_COLUMNS)
          .single();
        if (ins.error?.code === "23505") return fail("section_name_taken", `A section called "${body.name}" already exists.`, 409);
        if (ins.error) throw ins.error;
        return NextResponse.json({ success: true, section: ins.data }, { status: 201 });
      }

      case "section_rename": {
        const upd = await supabaseAdmin.from("table_sections").update({ name: body.name }).eq("id", body.id).eq("restaurant_id", rid).select(SECTION_COLUMNS);
        if (upd.error?.code === "23505") return fail("section_name_taken", `A section called "${body.name}" already exists.`, 409);
        if (upd.error) throw upd.error;
        if (!upd.data?.length) return fail("section_not_found", "Section not found.", 404);
        return NextResponse.json({ success: true, section: upd.data[0] });
      }

      case "section_reorder": {
        const all = await supabaseAdmin.from("table_sections").select("id").eq("restaurant_id", rid);
        if (all.error) throw all.error;
        const have = new Set((all.data ?? []).map((s) => s.id));
        const same = body.ids.length === have.size && new Set(body.ids).size === have.size && body.ids.every((i) => have.has(i));
        if (!same) return fail("section_order_mismatch", "The order must list every section of this restaurant exactly once.", 400);
        const results = await Promise.all(
          body.ids.map((sid, index) => supabaseAdmin.from("table_sections").update({ sort_order: index + 1 }).eq("id", sid).eq("restaurant_id", rid)),
        );
        const bad = results.find((r) => r.error);
        if (bad?.error) throw bad.error;
        return NextResponse.json({ success: true });
      }

      case "section_set_active": {
        if (!body.is_active) {
          const active = await supabaseAdmin
            .from("restaurant_tables")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", rid)
            .eq("section_id", body.id)
            .eq("is_active", true);
          if (active.error) throw active.error;
          if ((active.count ?? 0) > 0) {
            return fail(
              "section_has_active_tables",
              `This section still has ${active.count} active table${active.count === 1 ? "" : "s"}. Move them to another section or switch them off first.`,
              409,
            );
          }
        }
        const upd = await supabaseAdmin.from("table_sections").update({ is_active: body.is_active }).eq("id", body.id).eq("restaurant_id", rid).select(SECTION_COLUMNS);
        if (upd.error) throw upd.error;
        if (!upd.data?.length) return fail("section_not_found", "Section not found.", 404);
        return NextResponse.json({ success: true, section: upd.data[0] });
      }

      // ------------------------------------------------------------------ tables
      case "table_add": {
        if (!(await sectionOk(body.section_id))) return fail("section_not_found", "That section does not exist or is switched off.", 404);
        const ins = await supabaseAdmin
          .from("restaurant_tables")
          .insert({ restaurant_id: rid, table_number: body.table_number, seats: body.seats, section_id: body.section_id ?? null, notes: body.notes ?? null })
          .select(TABLE_COLUMNS)
          .single();
        if (ins.error?.code === "23505") return fail("table_number_taken", `Table "${body.table_number}" already exists (it may be switched off).`, 409);
        if (ins.error?.code === "23503") return fail("section_not_found", "That section does not exist or is switched off.", 404);
        if (ins.error) throw ins.error;
        return NextResponse.json({ success: true, table: ins.data }, { status: 201 });
      }

      case "table_bulk_add": {
        if (!(await sectionOk(body.section_id))) return fail("section_not_found", "That section does not exist or is switched off.", 404);
        const numbers = bulkNumbers(body.prefix, body.from, body.to);
        const existing = await supabaseAdmin.from("restaurant_tables").select("table_number").eq("restaurant_id", rid).in("table_number", numbers);
        if (existing.error) throw existing.error;
        if ((existing.data ?? []).length > 0) {
          const taken = existing.data!.map((t) => t.table_number);
          return fail("table_number_taken", `Nothing was added. These already exist (they may be switched off): ${taken.slice(0, 10).join(", ")}${taken.length > 10 ? "..." : ""}.`, 409, taken);
        }
        // One statement: either every table is created or none.
        const ins = await supabaseAdmin
          .from("restaurant_tables")
          .insert(numbers.map((n) => ({ restaurant_id: rid, table_number: n, seats: body.seats, section_id: body.section_id ?? null })))
          .select("id");
        if (ins.error?.code === "23505") return fail("table_number_taken", "Some of these table numbers already exist. Nothing was added.", 409);
        if (ins.error?.code === "23503") return fail("section_not_found", "That section does not exist or is switched off.", 404);
        if (ins.error) throw ins.error;
        return NextResponse.json({ success: true, created: ins.data?.length ?? 0 }, { status: 201 });
      }

      case "table_update": {
        const cur = await supabaseAdmin.from("restaurant_tables").select(TABLE_COLUMNS).eq("id", body.id).eq("restaurant_id", rid).maybeSingle();
        if (cur.error) throw cur.error;
        if (!cur.data) return fail("table_not_found", "Table not found.", 404);

        const patch: Record<string, unknown> = {};
        if (body.table_number !== undefined) patch.table_number = body.table_number;
        if (body.seats !== undefined) patch.seats = body.seats;
        if (body.notes !== undefined) patch.notes = body.notes;
        if (body.section_id !== undefined) {
          if (body.section_id !== cur.data.section_id && !(await sectionOk(body.section_id))) {
            return fail("section_not_found", "That section does not exist or is switched off.", 404);
          }
          patch.section_id = body.section_id;
        }
        if (Object.keys(patch).length === 0) return fail("nothing_to_change", "Nothing to change.", 400);

        if (body.seats !== undefined && body.seats < cur.data.seats) {
          const b = await tableBlockers(rid, cur.data.id);
          const biggest = Math.max(b.openParty ?? 0, ...b.bookings.map((x) => x.party_size));
          if (biggest > body.seats) {
            return fail("table_too_small", `Table ${cur.data.table_number} must keep at least ${biggest} seats: a party of ${biggest} is sitting or booked there.`, 409);
          }
        }

        const upd = await supabaseAdmin.from("restaurant_tables").update(patch).eq("id", body.id).eq("restaurant_id", rid).select(TABLE_COLUMNS);
        if (upd.error?.code === "23505") return fail("table_number_taken", `Table "${body.table_number}" already exists (it may be switched off).`, 409);
        if (upd.error?.code === "23503") return fail("section_not_found", "That section does not exist or is switched off.", 404);
        if (upd.error) throw upd.error;
        if (!upd.data?.length) return fail("table_not_found", "Table not found.", 404);
        return NextResponse.json({ success: true, table: upd.data[0] });
      }

      case "table_set_active": {
        const cur = await supabaseAdmin.from("restaurant_tables").select(TABLE_COLUMNS).eq("id", body.id).eq("restaurant_id", rid).maybeSingle();
        if (cur.error) throw cur.error;
        if (!cur.data) return fail("table_not_found", "Table not found.", 404);

        if (!body.is_active) {
          const b = await tableBlockers(rid, cur.data.id);
          if (b.openSession || b.bookings.length > 0) {
            return fail("table_in_use", blockedMessage(cur.data.table_number, b), 409, { open_session: b.openSession, bookings: b.bookings });
          }
        } else if (cur.data.section_id && !(await sectionOk(cur.data.section_id))) {
          return fail("section_inactive", "This table's section is switched off. Switch the section on first, or move the table.", 409);
        }

        const upd = await supabaseAdmin.from("restaurant_tables").update({ is_active: body.is_active }).eq("id", body.id).eq("restaurant_id", rid).select(TABLE_COLUMNS);
        if (upd.error) throw upd.error;
        if (!upd.data?.length) return fail("table_not_found", "Table not found.", 404);
        return NextResponse.json({ success: true, table: upd.data[0] });
      }
    }
  } catch (e) {
    console.error("tables: failed", body.action, e instanceof Error ? e.message : e);
    return fail("server_error", "Could not save. Please try again.", 500);
  }
}
