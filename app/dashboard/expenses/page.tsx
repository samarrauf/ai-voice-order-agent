import { Card, PageHeader } from "@/components/ui";
import { expenseFilter, rangeForDates } from "@/lib/expenses";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { loadProfitSummary } from "@/lib/profit-data";
import { requireCapabilityPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ExpensesManager, type ExpenseRow } from "./expenses-manager";

// Expenses and profit (B2). Capability manage_expenses (owner only, lib/permissions.ts);
// anyone else is sent back to /dashboard. The restaurant comes from the login session.
// Filter (?from=YYYY-MM-DD&to=YYYY-MM-DD&category=<id>) in the restaurant's timezone;
// default = this month so far. The summary covers the chosen dates (all categories).

type Params = { from?: string | string[]; to?: string | string[]; category?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireCapabilityPage("manage_expenses");
  const rid = me.restaurantId;
  const params = await searchParams;

  const restaurant = await supabaseAdmin.from("restaurants").select("currency, timezone").eq("id", rid).maybeSingle();
  const currency = restaurant.data?.currency ?? DEFAULT_CURRENCY;
  const timeZone = restaurant.data?.timezone || "Europe/London";
  const filter = expenseFilter({ from: first(params.from), to: first(params.to), category: first(params.category) }, new Date(), timeZone);

  // First visit: the default categories (once per restaurant; does nothing afterwards).
  const ensured = await supabaseAdmin.rpc("ensure_default_expense_categories", { p_restaurant_id: rid });
  if (ensured.error) console.error("expenses: default categories failed", ensured.error.message);

  let list = supabaseAdmin
    .from("expenses")
    .select("id, expense_date, category_id, description, amount, paid_from, created_at, voided_at, void_reason")
    .eq("restaurant_id", rid)
    .gte("expense_date", filter.from)
    .lte("expense_date", filter.to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter.category) list = list.eq("category_id", filter.category);

  const [cats, expenses, summary] = await Promise.all([
    supabaseAdmin.from("expense_categories").select("id, name, is_active").eq("restaurant_id", rid).order("name"),
    list,
    loadProfitSummary(rid, rangeForDates(filter.from, filter.to, timeZone)).then(
      (s) => ({ data: s, error: null }),
      (e) => ({ data: null, error: e }),
    ),
  ]);

  if (restaurant.error || cats.error || expenses.error || summary.error || !summary.data) {
    console.error("expenses page: could not load", restaurant.error?.message ?? cats.error?.message ?? expenses.error?.message ?? summary.error);
    return (
      <div className="anim-rise">
        <PageHeader title="Expenses" />
        <Card>
          <p className="text-sm text-ink-muted">Could not load the expenses. Please refresh the page.</p>
        </Card>
      </div>
    );
  }

  const rows: ExpenseRow[] = expenses.data.map((e) => ({
    id: e.id,
    date: e.expense_date,
    categoryId: e.category_id,
    description: e.description,
    amount: Number(e.amount),
    paidFrom: e.paid_from,
    voidedAt: e.voided_at,
    voidReason: e.void_reason,
  }));

  return (
    <div className="anim-rise">
      <PageHeader title="Expenses" subtitle="Owner only. What the restaurant spends, and what is left as profit." />
      <ExpensesManager
        currency={currency}
        categories={cats.data.map((c) => ({ id: c.id, name: c.name, active: c.is_active }))}
        rows={rows}
        filter={filter}
        summary={summary.data}
      />
    </div>
  );
}
