import { NextResponse } from "next/server";
import { expenseActionSchema } from "@/lib/expenses";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Expenses (B2). Capability manage_expenses (owner only; manager and staff get 403).
// Body: { action: "add" | "void" | "category_add", ... }
//   - The restaurant comes from the login. A different restaurant_id in the body = 403.
//   - add: the category must be one of this restaurant's active categories (the database
//     also refuses a category of another restaurant, migration 0025).
//   - void: never a delete. voided_at + reason + who; an already voided expense = 409.

const fail = (error: string, status: number, details?: string[]) =>
  NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status });

export async function POST(request: Request) {
  const auth = await requireCapability(request, "manage_expenses");
  if (!auth.ok) return auth.response;
  const { restaurantId: rid, staffId } = auth.staff;

  const raw = await request.json().catch(() => null);
  const mismatch = restaurantMismatch(typeof raw?.restaurant_id === "string" ? raw.restaurant_id : null, auth.staff);
  if (mismatch) return mismatch;

  const cur = await supabaseAdmin.from("restaurants").select("currency").eq("id", rid).maybeSingle();
  if (cur.error || !cur.data) return fail("could not load the restaurant", 500);
  const parsed = expenseActionSchema(cur.data.currency).safeParse(raw);
  if (!parsed.success) {
    return fail("invalid expense", 400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }
  const body = parsed.data;

  switch (body.action) {
    case "add": {
      const cat = await supabaseAdmin
        .from("expense_categories")
        .select("id")
        .eq("id", body.category_id)
        .eq("restaurant_id", rid)
        .eq("is_active", true)
        .maybeSingle();
      if (cat.error) return fail("could not save", 500);
      if (!cat.data) return fail("category_not_found", 404);
      const ins = await supabaseAdmin
        .from("expenses")
        .insert({
          restaurant_id: rid,
          expense_date: body.expense_date,
          category_id: body.category_id,
          description: body.description,
          amount: body.amount,
          paid_from: body.paid_from,
          created_by: staffId,
        })
        .select("id")
        .single();
      if (ins.error) {
        console.error("expenses: add failed", ins.error.message);
        return fail("could not save", 500);
      }
      return NextResponse.json({ success: true, id: ins.data.id }, { status: 201 });
    }

    case "void": {
      const upd = await supabaseAdmin
        .from("expenses")
        .update({ voided_at: new Date().toISOString(), void_reason: body.reason, voided_by: staffId })
        .eq("id", body.id)
        .eq("restaurant_id", rid)
        .is("voided_at", null)
        .select("id");
      if (upd.error) return fail("could not save", 500);
      if (upd.data.length === 0) {
        const exists = await supabaseAdmin.from("expenses").select("id").eq("id", body.id).eq("restaurant_id", rid).maybeSingle();
        return exists.data ? fail("already_voided", 409) : fail("not_found", 404);
      }
      return NextResponse.json({ success: true });
    }

    case "category_add": {
      const ins = await supabaseAdmin.from("expense_categories").insert({ restaurant_id: rid, name: body.name }).select("id").single();
      if (ins.error) {
        if (ins.error.code === "23505") return fail("duplicate_name", 409);
        console.error("expenses: category add failed", ins.error.message);
        return fail("could not save", 500);
      }
      return NextResponse.json({ success: true, id: ins.data.id }, { status: 201 });
    }
  }
}
