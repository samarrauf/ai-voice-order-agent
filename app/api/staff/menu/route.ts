import { NextResponse } from "next/server";
import { restaurantMismatch, requireCapability } from "@/lib/staff-auth";
import { diffItem, menuActionSchema, type Change, type StoredItem } from "@/lib/menu-admin";
import { supabaseAdmin } from "@/lib/supabase/server";

// Menu editor actions (capability menu_edit: owner + manager; staff get 403).
// Body: { action: "category_add" | "category_rename" | "category_move" | "category_visibility" |
//         "category_archive" | "item_save" | "item_availability" | "item_archive", ... }
//   - The restaurant comes from the login. A different restaurant_id in the body = 403.
//   - Prices are validated here (>= 0, 2 decimals, currency limit); nothing is trusted from the browser.
//   - "Delete" is always archive (archived_at): old orders keep their saved names and prices
//     (order_items stores a snapshot), and archived items disappear from the POS and the voice agent.
//   - Every changed field is written to menu_changes (who, what, old -> new).
//   - item_save runs in ONE database function (save_menu_item_tx, migration 0024).

const fail = (error: string, status: number, details?: string[]) =>
  NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status });

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(request: Request) {
  const auth = await requireCapability(request, "menu_edit");
  if (!auth.ok) return auth.response;
  const { restaurantId: rid, staffId } = auth.staff;

  const raw = await request.json().catch(() => null);
  const mismatch = restaurantMismatch(typeof raw?.restaurant_id === "string" ? raw.restaurant_id : null, auth.staff);
  if (mismatch) return mismatch;

  const cur = await supabaseAdmin.from("restaurants").select("currency").eq("id", rid).maybeSingle();
  if (cur.error || !cur.data) {
    console.error("menu: could not read the restaurant currency", cur.error);
    return fail("could not load the menu", 500);
  }
  const parsed = menuActionSchema(cur.data.currency).safeParse(raw);
  if (!parsed.success) {
    return fail("invalid menu change", 400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }
  const body = parsed.data;

  const log = async (entity: string, entityId: string, changes: Change[]) => {
    if (changes.length === 0) return;
    const { error } = await supabaseAdmin.from("menu_changes").insert(
      changes.map((c) => ({
        restaurant_id: rid,
        staff_id: staffId,
        entity,
        entity_id: entityId,
        field: c.field,
        old_value: c.old,
        new_value: c.new,
      })),
    );
    if (error) console.error("menu: change log failed", error);
  };

  const liveCategories = async () => {
    const r = await supabaseAdmin
      .from("menu_categories")
      .select("id, name, sort_order, is_active")
      .eq("restaurant_id", rid)
      .is("archived_at", null)
      .order("sort_order")
      .order("created_at");
    return r.error ? null : r.data;
  };

  switch (body.action) {
    case "category_add": {
      const cats = await liveCategories();
      if (!cats) return fail("could not save", 500);
      if (cats.some((c) => norm(c.name) === norm(body.name))) return fail("duplicate_name", 409);
      const next = cats.reduce((m, c) => Math.max(m, c.sort_order), 0) + 10;
      const ins = await supabaseAdmin
        .from("menu_categories")
        .insert({ restaurant_id: rid, name: body.name, sort_order: next })
        .select("id")
        .single();
      if (ins.error) return fail("could not save", 500);
      await log("category", ins.data.id, [{ field: "name", old: null, new: body.name }]);
      return NextResponse.json({ success: true, id: ins.data.id });
    }

    case "category_rename": {
      const cats = await liveCategories();
      if (!cats) return fail("could not save", 500);
      const cat = cats.find((c) => c.id === body.id);
      if (!cat) return fail("not_found", 404);
      if (cats.some((c) => c.id !== cat.id && norm(c.name) === norm(body.name))) return fail("duplicate_name", 409);
      if (cat.name === body.name) return NextResponse.json({ success: true, changed: [] });
      const upd = await supabaseAdmin.from("menu_categories").update({ name: body.name }).eq("id", cat.id).eq("restaurant_id", rid);
      if (upd.error) return fail("could not save", 500);
      await log("category", cat.id, [{ field: "name", old: cat.name, new: body.name }]);
      return NextResponse.json({ success: true, changed: ["name"] });
    }

    case "category_move": {
      const cats = await liveCategories();
      if (!cats) return fail("could not save", 500);
      const i = cats.findIndex((c) => c.id === body.id);
      if (i < 0) return fail("not_found", 404);
      const j = body.direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= cats.length) return NextResponse.json({ success: true, changed: [] });
      const order = [...cats];
      [order[i], order[j]] = [order[j], order[i]];
      const changes: Change[] = [];
      for (let k = 0; k < order.length; k++) {
        const want = (k + 1) * 10;
        if (order[k].sort_order === want) continue;
        const upd = await supabaseAdmin.from("menu_categories").update({ sort_order: want }).eq("id", order[k].id).eq("restaurant_id", rid);
        if (upd.error) return fail("could not save", 500);
        if (order[k].id === body.id) changes.push({ field: "sort_order", old: String(order[k].sort_order), new: String(want) });
      }
      await log("category", body.id, changes);
      return NextResponse.json({ success: true, changed: ["sort_order"] });
    }

    case "category_visibility": {
      const cats = await liveCategories();
      const cat = cats?.find((c) => c.id === body.id);
      if (!cat) return fail("not_found", 404);
      if (cat.is_active === body.visible) return NextResponse.json({ success: true, changed: [] });
      const upd = await supabaseAdmin.from("menu_categories").update({ is_active: body.visible }).eq("id", cat.id).eq("restaurant_id", rid);
      if (upd.error) return fail("could not save", 500);
      await log("category", cat.id, [{ field: "is_active", old: String(cat.is_active), new: String(body.visible) }]);
      return NextResponse.json({ success: true, changed: ["is_active"] });
    }

    case "category_archive": {
      const cats = await liveCategories();
      const cat = cats?.find((c) => c.id === body.id);
      if (!cat) return fail("not_found", 404);
      const now = new Date().toISOString();
      const upd = await supabaseAdmin.from("menu_categories").update({ archived_at: now }).eq("id", cat.id).eq("restaurant_id", rid);
      if (upd.error) return fail("could not save", 500);
      // The dishes inside go with it.
      const items = await supabaseAdmin
        .from("menu_items")
        .update({ archived_at: now })
        .eq("category_id", cat.id)
        .eq("restaurant_id", rid)
        .is("archived_at", null)
        .select("id");
      await log("category", cat.id, [{ field: "archived", old: "false", new: "true" }]);
      for (const it of items.data ?? []) await log("item", it.id, [{ field: "archived", old: "false", new: "true" }]);
      return NextResponse.json({ success: true, archived_items: items.data?.length ?? 0 });
    }

    case "category_restore": {
      const found = await supabaseAdmin
        .from("menu_categories")
        .select("id, name, archived_at")
        .eq("id", body.id)
        .eq("restaurant_id", rid)
        .not("archived_at", "is", null)
        .maybeSingle();
      if (found.error) return fail("could not save", 500);
      if (!found.data) return fail("not_found", 404);
      const cats = await liveCategories();
      if (!cats) return fail("could not save", 500);
      if (cats.some((c) => norm(c.name) === norm(found.data!.name))) return fail("duplicate_name", 409);
      const next = cats.reduce((m, c) => Math.max(m, c.sort_order), 0) + 10;
      const upd = await supabaseAdmin
        .from("menu_categories")
        .update({ archived_at: null, sort_order: next })
        .eq("id", found.data.id)
        .eq("restaurant_id", rid);
      if (upd.error) return fail("could not save", 500);
      // Only the dishes archived together with the category (same archived_at) come back.
      const items = await supabaseAdmin
        .from("menu_items")
        .update({ archived_at: null })
        .eq("category_id", found.data.id)
        .eq("restaurant_id", rid)
        .eq("archived_at", found.data.archived_at)
        .select("id");
      await log("category", found.data.id, [{ field: "archived", old: "true", new: "false" }]);
      for (const it of items.data ?? []) await log("item", it.id, [{ field: "archived", old: "true", new: "false" }]);
      return NextResponse.json({ success: true, restored_items: items.data?.length ?? 0 });
    }

    case "item_restore": {
      const found = await supabaseAdmin
        .from("menu_items")
        .select("id, name, category_id")
        .eq("id", body.id)
        .eq("restaurant_id", rid)
        .not("archived_at", "is", null)
        .maybeSingle();
      if (found.error) return fail("could not save", 500);
      if (!found.data) return fail("not_found", 404);
      const cat = await supabaseAdmin
        .from("menu_categories")
        .select("id")
        .eq("id", found.data.category_id ?? "")
        .eq("restaurant_id", rid)
        .is("archived_at", null)
        .maybeSingle();
      if (cat.error) return fail("could not save", 500);
      if (!cat.data) return fail("category_archived", 409);
      const same = await supabaseAdmin
        .from("menu_items")
        .select("id, name")
        .eq("restaurant_id", rid)
        .eq("category_id", found.data.category_id)
        .is("archived_at", null);
      if (same.error) return fail("could not save", 500);
      if (same.data.some((i) => norm(i.name) === norm(found.data!.name))) return fail("duplicate_name", 409);
      const upd = await supabaseAdmin.from("menu_items").update({ archived_at: null }).eq("id", found.data.id).eq("restaurant_id", rid);
      if (upd.error) return fail("could not save", 500);
      await log("item", found.data.id, [{ field: "archived", old: "true", new: "false" }]);
      return NextResponse.json({ success: true });
    }

    case "item_availability": {
      const found = await supabaseAdmin
        .from("menu_items")
        .select("id, is_available")
        .eq("id", body.id)
        .eq("restaurant_id", rid)
        .is("archived_at", null)
        .maybeSingle();
      if (found.error) return fail("could not save", 500);
      if (!found.data) return fail("not_found", 404);
      if (found.data.is_available === body.available) return NextResponse.json({ success: true, changed: [] });
      const upd = await supabaseAdmin.from("menu_items").update({ is_available: body.available }).eq("id", body.id).eq("restaurant_id", rid);
      if (upd.error) return fail("could not save", 500);
      await log("item", body.id, [{ field: "is_available", old: String(found.data.is_available), new: String(body.available) }]);
      return NextResponse.json({ success: true, changed: ["is_available"] });
    }

    case "item_archive": {
      const upd = await supabaseAdmin
        .from("menu_items")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("restaurant_id", rid)
        .is("archived_at", null)
        .select("id");
      if (upd.error) return fail("could not save", 500);
      if (!upd.data?.length) return fail("not_found", 404);
      await log("item", body.id, [{ field: "archived", old: "false", new: "true" }]);
      return NextResponse.json({ success: true });
    }

    case "item_save": {
      let old: StoredItem | null = null;
      if (body.id) {
        const r = await supabaseAdmin
          .from("menu_items")
          .select(
            "category_id, name, description, base_price, is_available, is_vegetarian, spice_level, aliases, sort_order, item_sizes ( name, price, is_default, sort_order )",
          )
          .eq("id", body.id)
          .eq("restaurant_id", rid)
          .is("archived_at", null)
          .maybeSingle();
        if (r.error) return fail("could not save", 500);
        if (!r.data) return fail("not_found", 404);
        const opts = await supabaseAdmin
          .from("item_options")
          .select("group_name, name, price_delta, max_select")
          .eq("restaurant_id", rid)
          .eq("menu_item_id", body.id)
          .order("created_at");
        if (opts.error) return fail("could not save", 500);
        const { item_sizes, ...rest } = r.data;
        old = { ...rest, sizes: [...item_sizes].sort((a, b) => a.sort_order - b.sort_order), options: opts.data } as StoredItem;
      }
      const { sizes, options, ...item } = body.item;
      const { data, error } = await supabaseAdmin.rpc("save_menu_item_tx", {
        p_restaurant_id: rid,
        p_staff_id: staffId,
        p_item_id: body.id ?? null,
        p_item: item,
        p_sizes: sizes,
        p_options: options,
        p_changes: diffItem(old, body.item),
      });
      if (error || !data) {
        console.error("menu: item save failed (nothing was saved)", error);
        return fail("could not save", 500);
      }
      const result = data as { ok: boolean; error?: string; id?: string };
      if (!result.ok) {
        if (result.error === "not_allowed") return fail("forbidden", 403);
        if (result.error === "duplicate_name") return fail("duplicate_name", 409);
        if (result.error === "category_not_found" || result.error === "not_found") return fail(result.error, 404);
        return fail("invalid menu change", 400, [result.error ?? "unknown"]);
      }
      return NextResponse.json({ success: true, id: result.id });
    }
  }
}
