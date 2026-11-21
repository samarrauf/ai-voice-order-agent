"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { MAX_BULK, MAX_SEATS } from "@/lib/tables";
import type { Floor, SectionView, TableView } from "@/lib/tables-data";
import { post } from "./post";

// Owner and manager only (capability tables_edit; the page does not render this for staff and
// /api/staff/tables refuses them anyway). Sections, tables, bulk add, switch on / off.

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong";
const label = "mb-1 block text-xs font-medium text-ink-muted";

type Msg = { ok: boolean; text: string } | null;

function SectionSelect({ sections, value, onChange, id }: { sections: SectionView[]; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No section</option>
      {sections.filter((s) => s.is_active).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function TablesEditor({ floor, restaurantId }: { floor: Floor; restaurantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // forms
  const [sectionName, setSectionName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [num, setNum] = useState("");
  const [seats, setSeats] = useState("2");
  const [section, setSection] = useState("");
  const [bulk, setBulk] = useState({ prefix: "", from: "1", to: "10", seats: "2", section: "" });
  const [editing, setEditing] = useState<{ id: string; number: string; seats: string; section: string; notes: string } | null>(null);

  async function act(body: Record<string, unknown>, okText: string, after?: () => void) {
    setBusy(true);
    setMsg(null);
    const r = await post("/api/staff/tables", { restaurant_id: restaurantId, ...body });
    setMsg({ ok: r.ok, text: r.ok ? okText : r.message });
    if (r.ok) {
      after?.();
      router.refresh();
    }
    setBusy(false);
  }

  const sections = [...floor.sections].sort((a, b) => a.sort_order - b.sort_order);
  const move = (index: number, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
    return act({ action: "section_reorder", ids }, "Order saved.");
  };
  const sectionName_ = (id: string | null) => floor.sections.find((s) => s.id === id)?.name ?? "No section";

  const startEdit = (t: TableView) => setEditing({ id: t.id, number: t.number, seats: String(t.seats), section: t.sectionId ?? "", notes: t.notes ?? "" });

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={`rounded-xl border px-3 py-2.5 text-sm lg:col-span-2 ${msg.ok ? "border-status-ready/30 bg-status-ready/12 text-status-ready" : "border-danger/30 bg-danger/12 text-danger"}`}
        >
          {msg.text}
        </p>
      )}

      {/* ---------------------------------------------------------------- sections */}
      <Card>
        <CardHeader title="Sections" hint="Indoor, Terrace, Upstairs..." />
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "section_add", name: sectionName }, "Section added.", () => setSectionName(""));
          }}
        >
          <input aria-label="New section name" className={input} placeholder="New section name" maxLength={40} value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
          <Button type="submit" variant="primary" disabled={busy || !sectionName.trim()}>
            Add
          </Button>
        </form>
        {sections.length === 0 ? (
          <p className="text-sm text-ink-muted">No sections yet. Tables work fine without one.</p>
        ) : (
          <ul className="space-y-2">
            {sections.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-raised/60 p-2">
                {renaming?.id === s.id ? (
                  <>
                    <input aria-label="Section name" className={`${input} flex-1`} maxLength={40} value={renaming.name} onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} />
                    <Button variant="primary" disabled={busy || !renaming.name.trim()} onClick={() => act({ action: "section_rename", id: s.id, name: renaming.name }, "Renamed.", () => setRenaming(null))}>
                      Save
                    </Button>
                    <Button onClick={() => setRenaming(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate px-1 font-semibold">{s.name}</span>
                    {!s.is_active && <Badge tone="done">Off</Badge>}
                    <Button aria-label={`Move ${s.name} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={16} aria-hidden />
                    </Button>
                    <Button aria-label={`Move ${s.name} down`} disabled={busy || i === sections.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={16} aria-hidden />
                    </Button>
                    <Button onClick={() => setRenaming({ id: s.id, name: s.name })}>Rename</Button>
                    <Button disabled={busy} onClick={() => act({ action: "section_set_active", id: s.id, is_active: !s.is_active }, s.is_active ? "Section switched off." : "Section switched on.")}>
                      {s.is_active ? "Switch off" : "Switch on"}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------------------------------------------------------- add */}
      <Card>
        <CardHeader title="Add tables" />
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "table_add", table_number: num, seats: Number(seats), section_id: section || null }, "Table added.", () => setNum(""));
          }}
        >
          <div>
            <label className={label} htmlFor="t-num">Table number or name</label>
            <input id="t-num" className={input} maxLength={20} value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. 12 or Window" />
          </div>
          <div>
            <label className={label} htmlFor="t-seats">Seats</label>
            <input id="t-seats" type="number" min={1} max={MAX_SEATS} inputMode="numeric" className={input} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="t-section">Section</label>
            <SectionSelect id="t-section" sections={floor.sections} value={section} onChange={setSection} />
          </div>
          <Button type="submit" variant="primary" className="col-span-2" disabled={busy || !num.trim() || !(Number(seats) >= 1)}>
            Add table
          </Button>
        </form>

        <hr className="my-4 border-line" />

        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              { action: "table_bulk_add", prefix: bulk.prefix, from: Number(bulk.from), to: Number(bulk.to), seats: Number(bulk.seats), section_id: bulk.section || null },
              "Tables added.",
            );
          }}
        >
          <p className="col-span-2 text-sm font-semibold">Add many at once (at most {MAX_BULK})</p>
          <div>
            <label className={label} htmlFor="b-prefix">Prefix (optional)</label>
            <input id="b-prefix" className={input} maxLength={10} value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} placeholder="e.g. T" />
          </div>
          <div>
            <label className={label} htmlFor="b-seats">Seats each</label>
            <input id="b-seats" type="number" min={1} max={MAX_SEATS} inputMode="numeric" className={input} value={bulk.seats} onChange={(e) => setBulk({ ...bulk, seats: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="b-from">From number</label>
            <input id="b-from" type="number" min={1} inputMode="numeric" className={input} value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="b-to">To number</label>
            <input id="b-to" type="number" min={1} inputMode="numeric" className={input} value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor="b-section">Section</label>
            <SectionSelect id="b-section" sections={floor.sections} value={bulk.section} onChange={(v) => setBulk({ ...bulk, section: v })} />
          </div>
          <Button type="submit" className="col-span-2" disabled={busy || !(Number(bulk.from) >= 1) || !(Number(bulk.to) >= Number(bulk.from)) || !(Number(bulk.seats) >= 1)}>
            Add {Number(bulk.to) >= Number(bulk.from) ? Number(bulk.to) - Number(bulk.from) + 1 : 0} tables
          </Button>
        </form>
      </Card>

      {/* ---------------------------------------------------------------- all tables */}
      <Card className="lg:col-span-2">
        <CardHeader title="All tables" hint="Switching a table off keeps its history; it never deletes it" />
        {floor.tables.length === 0 ? (
          <p className="text-sm text-ink-muted">No tables yet.</p>
        ) : (
          <ul className="space-y-2">
            {floor.tables.map((t) =>
              editing?.id === t.id ? (
                <li key={t.id} className="grid gap-3 rounded-xl border border-brand-line bg-raised/60 p-3 sm:grid-cols-5">
                  <div>
                    <label className={label} htmlFor="e-num">Number or name</label>
                    <input id="e-num" className={input} maxLength={20} value={editing.number} onChange={(e) => setEditing({ ...editing, number: e.target.value })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="e-seats">Seats</label>
                    <input id="e-seats" type="number" min={1} max={MAX_SEATS} inputMode="numeric" className={input} value={editing.seats} onChange={(e) => setEditing({ ...editing, seats: e.target.value })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="e-section">Section</label>
                    <SectionSelect id="e-section" sections={floor.sections} value={editing.section} onChange={(v) => setEditing({ ...editing, section: v })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="e-notes">Note</label>
                    <input id="e-notes" className={input} maxLength={200} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      variant="primary"
                      disabled={busy || !editing.number.trim() || !(Number(editing.seats) >= 1)}
                      onClick={() =>
                        act(
                          { action: "table_update", id: t.id, table_number: editing.number, seats: Number(editing.seats), section_id: editing.section || null, notes: editing.notes },
                          "Table saved.",
                          () => setEditing(null),
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </li>
              ) : (
                <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-raised/60 p-2">
                  <span className="min-w-0 flex-1 px-1">
                    <span className="font-semibold">Table {t.number}</span>
                    <span className="text-sm text-ink-muted"> · {t.seats} seats · {sectionName_(t.sectionId)}{t.notes ? ` · ${t.notes}` : ""}</span>
                  </span>
                  {!t.isActive && <Badge tone="done">Off</Badge>}
                  <Button disabled={busy} onClick={() => startEdit(t)}>Edit</Button>
                  <Button disabled={busy} onClick={() => act({ action: "table_set_active", id: t.id, is_active: !t.isActive }, t.isActive ? "Table switched off." : "Table switched on.")}>
                    {t.isActive ? "Switch off" : "Switch on"}
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}
