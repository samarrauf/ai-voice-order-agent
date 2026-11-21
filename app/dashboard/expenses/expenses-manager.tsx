"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, CircleAlert, Plus, Receipt } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, KpiCard, cn } from "@/components/ui";
import { PAID_FROM, PAID_FROM_LABELS, type PaidFrom } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import type { ProfitSummary } from "@/lib/profit";

// Expenses page (owner only). Add, list (date and category filter), void with a reason,
// and the profit summary for the chosen dates. Every number comes from the server.

export type ExpenseRow = {
  id: string;
  date: string;
  categoryId: string;
  description: string;
  amount: number;
  paidFrom: string;
  voidedAt: string | null;
  voidReason: string | null;
};
type Category = { id: string; name: string; active: boolean };
type Msg = { ok: boolean; text: string } | null;

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong";
const label = "grid gap-1.5 text-sm";

const ERRORS: Record<string, string> = {
  duplicate_name: "That category already exists.",
  category_not_found: "That category no longer exists. Please refresh the page.",
  already_voided: "That expense was already voided.",
  not_found: "That expense no longer exists. Please refresh the page.",
  forbidden: "Only the owner can manage expenses.",
};

const dateLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};

export function ExpensesManager({
  currency,
  categories,
  rows,
  filter,
  summary,
}: {
  currency: string;
  categories: Category[];
  rows: ExpenseRow[];
  filter: { from: string; to: string; category: string | null };
  summary: ProfitSummary;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const active = categories.filter((c) => c.active);
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));

  const [date, setDate] = useState(filter.to);
  const [categoryId, setCategoryId] = useState(active[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidFrom, setPaidFrom] = useState<PaidFrom>("drawer_cash");
  const [newCat, setNewCat] = useState("");

  async function send(body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/staff/expenses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
      if (!res.ok) {
        const details = Array.isArray(json.details) ? ` ${json.details.join(" ")}` : "";
        setMsg({ ok: false, text: (ERRORS[String(json.error)] ?? "Could not save.") + details });
        return false;
      }
      setMsg({ ok: true, text: okText });
      router.refresh();
      return true;
    } catch {
      setMsg({ ok: false, text: "Network problem. Nothing was saved." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await send(
      { action: "add", expense_date: date, category_id: categoryId, description, amount: Number(amount), paid_from: paidFrom },
      "Expense added.",
    );
    if (ok) {
      setDescription("");
      setAmount("");
    }
  }
  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (await send({ action: "category_add", name: newCat }, "Category added.")) setNewCat("");
  }
  async function voidExpense(r: ExpenseRow) {
    const reason = window.prompt(`Why void this expense of ${formatMoney(r.amount, currency)}? (It is kept, marked void.)`);
    if (reason && reason.trim()) await send({ action: "void", id: r.id, reason }, "Expense voided.");
  }

  const live = rows.filter((r) => !r.voidedAt);
  const listTotal = live.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="grid gap-4">
      {/* Summary for the chosen dates */}
      <section aria-label="Profit summary" className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Sales (without tax)" value={money(summary.sales)} tone={1} note={`${summary.orders} orders`} />
          <KpiCard label="Cost of items" value={money(summary.itemCost)} tone={2} note="Saved on each order when sold" />
          <KpiCard label="Gross profit" value={money(summary.grossProfit)} tone={3} note="Food sales after discount, minus item cost" />
          <KpiCard label="Expenses" value={money(summary.expenses)} tone={4} note="Voided expenses not counted" />
          <KpiCard accent label="Net profit" value={money(summary.netProfit)} note="Gross profit minus expenses" />
        </div>
        <p className="text-xs text-ink-faint">
          {dateLabel(filter.from)} to {dateLabel(filter.to)}. Delivery fee, service charge, tax and rounding are not counted as profit; cancelled orders are left out.
        </p>
        {summary.incompleteOrders > 0 && (
          <p role="note" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            {summary.incompleteOrders === 1 ? "1 order's cost is not known" : `${summary.incompleteOrders} orders' cost is not known`} (cost not set on the
            menu, or an old order). Their profit may look higher than it really is.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader title="Add expense" />
          <form onSubmit={add} className="grid gap-3">
            <label className={label}>
              <span className="font-medium">Date</span>
              <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className={label}>
              <span className="font-medium">Category</span>
              <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span className="font-medium">Description</span>
              <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="e.g. October rent" />
            </label>
            <label className={label}>
              <span className="font-medium">Amount ({currency})</span>
              <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0" />
            </label>
            <label className={label}>
              <span className="font-medium">Paid from</span>
              <select className={input} value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as PaidFrom)}>
                {PAID_FROM.map((p) => (
                  <option key={p} value={p}>
                    {PAID_FROM_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="primary" disabled={busy || !categoryId || !amount}>
              <Plus size={16} /> Add expense
            </Button>
          </form>

          <form onSubmit={addCategory} className="mt-5 flex gap-2 border-t border-line pt-4">
            <input className={input} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" maxLength={60} aria-label="New category name" />
            <Button type="submit" disabled={busy || !newCat.trim()} aria-label="Add category">
              <Plus size={16} />
            </Button>
          </form>
          {msg && (
            <p role="status" className={cn("mt-3 rounded-xl border px-3 py-2 text-sm", msg.ok ? "border-line" : "border-danger/30 bg-danger/12 text-danger")}>
              {msg.text}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader title="Expenses" hint={`Total ${money(listTotal)}`} />
          {/* A plain GET form: the filter lives in the URL, the server does the work. */}
          <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <label className={label}>
              <span className="text-xs text-ink-faint">From</span>
              <input type="date" name="from" defaultValue={filter.from} className={input} />
            </label>
            <label className={label}>
              <span className="text-xs text-ink-faint">To</span>
              <input type="date" name="to" defaultValue={filter.to} className={input} />
            </label>
            <label className={label}>
              <span className="text-xs text-ink-faint">Category</span>
              <select name="category" defaultValue={filter.category ?? ""} className={input}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Apply</Button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={<Receipt size={20} />} title="No expenses" message="Nothing recorded for these dates. Add one on the left." />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className={cn("flex flex-wrap items-center gap-3 py-3", r.voidedAt && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {nameOf.get(r.categoryId) ?? "Category"}
                      {r.voidedAt && <Badge>Void</Badge>}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {dateLabel(r.date)} · {PAID_FROM_LABELS[r.paidFrom as PaidFrom] ?? r.paidFrom}
                      {r.description && ` · ${r.description}`}
                      {r.voidReason && ` · Void: ${r.voidReason}`}
                    </p>
                  </div>
                  <span className={cn("text-sm font-bold tabular-nums", r.voidedAt && "line-through")}>{money(r.amount)}</span>
                  {!r.voidedAt && (
                    <Button disabled={busy} onClick={() => voidExpense(r)} aria-label={`Void expense of ${money(r.amount)}`}>
                      <Ban size={14} /> Void
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
