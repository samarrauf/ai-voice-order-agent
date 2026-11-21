"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, IconButton } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export type EditorItem = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  base_price: number;
  is_available: boolean;
  is_vegetarian: boolean;
  spice_level: number | null;
  aliases: string[];
  sort_order: number;
  image_url: string | null;
  sizes: { name: string; price: number; is_default: boolean; cost_price?: number | null }[];
  options: { group_name: string; name: string; price_delta: number; max_select: number; cost_price?: number | null }[];
  /** Owner only (view_cost): the page adds cost_price only for the owner. */
  cost_price?: number | null;
};
export type EditorArchived = {
  categories: { id: string; name: string }[];
  items: { id: string; name: string; category: string; categoryArchived: boolean }[];
};
export type EditorCategory = { id: string; name: string; visible: boolean; items: EditorItem[] };

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong";
type Msg = { ok: boolean; text: string } | null;

const ERRORS: Record<string, string> = {
  duplicate_name: "That name is already used in this category.",
  forbidden: "You are not allowed to edit the menu.",
  not_found: "That entry no longer exists. Please refresh the page.",
  category_archived: "Restore its category first.",
};

/** Resize in the browser (longest side 1200px) and re-encode as webp, or jpeg where webp is unsupported. */
async function resizePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.8));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("resize failed");
  return new File([blob], blob.type === "image/webp" ? "photo.webp" : "photo.jpg", { type: blob.type });
}

export function MenuEditor({
  categories,
  currency,
  archived,
  showCost = false,
}: {
  categories: EditorCategory[];
  currency: string;
  archived: EditorArchived;
  /** view_cost (owner): show and send the Cost fields. Everyone else never sees or sends them. */
  showCost?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(categories[0]?.id ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<EditorItem | "new" | null>(null);

  const category = categories.find((c) => c.id === selected) ?? categories[0];

  async function send(body: Record<string, unknown>): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/staff/menu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const details = Array.isArray(json.details) ? ` ${json.details.join(" ")}` : "";
        setMsg({ ok: false, text: (ERRORS[String(json.error)] ?? "Could not save.") + details });
        return { ok: false, json };
      }
      router.refresh();
      return { ok: true, json };
    } catch {
      setMsg({ ok: false, text: "Network problem. Nothing was saved." });
      return { ok: false, json: {} };
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const r = await send({ action: "category_add", name: newCat });
    if (r.ok) {
      setNewCat("");
      if (typeof r.json.id === "string") setSelected(r.json.id);
    }
  }
  async function rename(c: EditorCategory) {
    const name = window.prompt("New category name", c.name);
    if (name && name.trim() !== c.name) await send({ action: "category_rename", id: c.id, name });
  }
  async function archiveCategory(c: EditorCategory) {
    if (!window.confirm(`Archive "${c.name}" and its ${c.items.length} dish(es)? Old orders are not changed.`)) return;
    await send({ action: "category_archive", id: c.id });
  }
  async function archiveItem(i: EditorItem) {
    if (!window.confirm(`Archive "${i.name}"? It disappears from the POS and the voice agent. Old orders are not changed.`)) return;
    await send({ action: "item_archive", id: i.id });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card>
        <CardHeader title="Categories" />
        <ul className="grid gap-1.5">
          {categories.map((c, idx) => (
            <li key={c.id} className={`rounded-xl border px-2 py-1.5 ${c.id === category?.id ? "border-brand-line bg-brand/10" : "border-line"}`}>
              <button type="button" className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-sm font-semibold" onClick={() => setSelected(c.id)}>
                <span className={c.visible ? "" : "text-ink-faint line-through"}>{c.name}</span>
                <span className="text-xs text-ink-faint">{c.items.length}</span>
              </button>
              {c.id === category?.id && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <IconButton label="Move up" disabled={busy || idx === 0} onClick={() => send({ action: "category_move", id: c.id, direction: "up" })}>
                    <ArrowUp size={15} />
                  </IconButton>
                  <IconButton label="Move down" disabled={busy || idx === categories.length - 1} onClick={() => send({ action: "category_move", id: c.id, direction: "down" })}>
                    <ArrowDown size={15} />
                  </IconButton>
                  <IconButton label="Rename" disabled={busy} onClick={() => rename(c)}>
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton label={c.visible ? "Hide category" : "Show category"} disabled={busy} onClick={() => send({ action: "category_visibility", id: c.id, visible: !c.visible })}>
                    {c.visible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </IconButton>
                  <IconButton label="Archive category" disabled={busy} onClick={() => archiveCategory(c)}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={addCategory} className="mt-3 flex gap-2">
          <input className={input} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" maxLength={80} aria-label="New category name" />
          <Button type="submit" variant="primary" disabled={busy || !newCat.trim()} aria-label="Add category">
            <Plus size={16} />
          </Button>
        </form>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader
          title={category ? category.name : "Items"}
          action={
            category && (
              <Button variant="primary" disabled={busy} onClick={() => setEditing("new")}>
                <Plus size={16} /> Add item
              </Button>
            )
          }
        />
        {msg && <p role="status" className={`mb-3 rounded-xl border px-3 py-2 text-sm ${msg.ok ? "border-line" : "border-danger/30 bg-danger/12 text-danger"}`}>{msg.text}</p>}

        {editing && category && (
          <ItemForm
            key={editing === "new" ? "new" : editing.id}
            item={editing === "new" ? null : editing}
            categoryId={category.id}
            categories={categories}
            currency={currency}
            showCost={showCost}
            send={send}
            onClose={() => setEditing(null)}
          />
        )}

        {!category ? (
          <EmptyState icon={<Plus size={20} />} title="No categories yet" message="Add a category on the left, then add dishes to it." />
        ) : category.items.length === 0 ? (
          <EmptyState icon={<ImagePlus size={20} />} title="No dishes here yet" message="Use Add item to create the first dish in this category." />
        ) : (
          <ul className="divide-y divide-line">
            {category.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                {i.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small public thumbnails from our own bucket
                  <img src={i.image_url} alt="" className="size-12 rounded-lg object-cover" />
                ) : (
                  <div className="grid size-12 place-items-center rounded-lg border border-line text-ink-faint">
                    <ImagePlus size={16} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {i.name}
                    {!i.is_available && <Badge>Sold out</Badge>}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {i.sizes.length > 0 ? i.sizes.map((s) => `${s.name} ${formatMoney(s.price, currency)}`).join(" · ") : formatMoney(i.base_price, currency)}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={i.is_available} disabled={busy} onChange={(e) => send({ action: "item_availability", id: i.id, available: e.target.checked })} />
                  Available
                </label>
                <IconButton label="Edit" disabled={busy} onClick={() => setEditing(i)}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton label="Archive" disabled={busy} onClick={() => archiveItem(i)}>
                  <Trash2 size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {(archived.categories.length > 0 || archived.items.length > 0) && (
        <Card className="lg:col-span-4">
          <CardHeader title="Archived" hint="Old orders keep their saved names and prices." />
          <ul className="divide-y divide-line">
            {archived.categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <Badge>Category</Badge> <span className="font-semibold">{c.name}</span>
                </span>
                <Button disabled={busy} onClick={() => send({ action: "category_restore", id: c.id })}>
                  Restore
                </Button>
              </li>
            ))}
            {archived.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <Badge>Item</Badge> <span className="font-semibold">{i.name}</span>
                  <span className="text-ink-faint"> in {i.category || "no category"}{i.categoryArchived ? " (archived)" : ""}</span>
                </span>
                <Button disabled={busy || i.categoryArchived} onClick={() => send({ action: "item_restore", id: i.id })}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

type SizeRow = { name: string; price: string; is_default: boolean; cost: string };
type OptionRow = { group_name: string; name: string; price_delta: string; max_select: string; cost: string };

const costText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const costValue = (v: string) => (v.trim() === "" ? null : Number(v));

function ItemForm({
  item,
  categoryId,
  categories,
  currency,
  showCost,
  send,
  onClose,
}: {
  item: EditorItem | null;
  categoryId: string;
  categories: EditorCategory[];
  currency: string;
  showCost: boolean;
  send: (body: Record<string, unknown>) => Promise<{ ok: boolean; json: Record<string, unknown> }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(item?.category_id ?? categoryId);
  const [price, setPrice] = useState(String(item?.base_price ?? ""));
  const [sizes, setSizes] = useState<SizeRow[]>((item?.sizes ?? []).map((s) => ({ name: s.name, price: String(s.price), is_default: s.is_default, cost: costText(s.cost_price) })));
  const [options, setOptions] = useState<OptionRow[]>(
    (item?.options ?? []).map((o) => ({ group_name: o.group_name, name: o.name, price_delta: String(o.price_delta), max_select: String(o.max_select), cost: costText(o.cost_price) })),
  );
  const [cost, setCost] = useState(costText(item?.cost_price));
  const [veg, setVeg] = useState(item?.is_vegetarian ?? false);
  const [spice, setSpice] = useState(item?.spice_level == null ? "" : String(item.spice_level));
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(", "));
  const [sortOrder, setSortOrder] = useState(String(item?.sort_order ?? 0));
  const [available, setAvailable] = useState(item?.is_available ?? true);
  const [photoMsg, setPhotoMsg] = useState<Msg>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await send({
      action: "item_save",
      ...(item ? { id: item.id } : {}),
      item: {
        category_id: category,
        name,
        description,
        base_price: Number(price),
        // Cost fields are sent ONLY by the owner (the API refuses them from anyone else).
        ...(showCost ? { cost_price: costValue(cost) } : {}),
        sizes: sizes.map((s) => ({ name: s.name, price: Number(s.price), is_default: s.is_default, ...(showCost ? { cost_price: costValue(s.cost) } : {}) })),
        options: options.map((o) => ({
          group_name: o.group_name,
          name: o.name,
          price_delta: Number(o.price_delta || 0),
          max_select: Number(o.max_select || 1),
          ...(showCost ? { cost_price: costValue(o.cost) } : {}),
        })),
        is_vegetarian: veg,
        spice_level: spice === "" ? null : Number(spice),
        aliases,
        sort_order: Number(sortOrder || 0),
        is_available: available,
      },
    });
    setSaving(false);
    if (r.ok) onClose();
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !item) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const small = await resizePhoto(file);
      const form = new FormData();
      form.set("item_id", item.id);
      form.set("file", small);
      const res = await fetch("/api/staff/menu/photo", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setPhotoMsg(res.ok ? { ok: true, text: "Photo saved." } : { ok: false, text: json.error ?? "Could not save the photo." });
      if (res.ok) router.refresh();
    } catch {
      setPhotoMsg({ ok: false, text: "That file could not be read as an image." });
    } finally {
      setPhotoBusy(false);
    }
  }
  async function removePhoto() {
    if (!item) return;
    setPhotoBusy(true);
    const res = await fetch("/api/staff/menu/photo", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id: item.id }) });
    setPhotoMsg(res.ok ? { ok: true, text: "Photo removed." } : { ok: false, text: "Could not remove the photo." });
    setPhotoBusy(false);
    if (res.ok) router.refresh();
  }

  const setSize = (i: number, patch: Partial<SizeRow>) => setSizes((l) => l.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const setOption = (i: number, patch: Partial<OptionRow>) => setOptions((l) => l.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const makeDefault = (i: number) => setSizes((l) => l.map((s, k) => ({ ...s, is_default: k === i })));

  return (
    <form onSubmit={save} className="mb-5 grid gap-4 rounded-2xl border border-line-strong bg-raised/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{item ? `Edit ${item.name}` : "New item"}</h3>
        <IconButton label="Close" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Category</span>
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium">Description</span>
          <textarea className={`${input} min-h-20 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Base price ({currency})</span>
          <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
          <span className="text-xs text-ink-faint">Used when the dish has no sizes.</span>
        </label>
        {showCost && (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Cost ({currency}, owner only)</span>
            <input className={input} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Not set" aria-label="Item cost" />
            <span className="text-xs text-ink-faint">What one portion costs you. Used when the dish has no sizes; leave empty if unknown.</span>
          </label>
        )}
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Aliases (comma separated, for the voice agent)</span>
          <input className={input} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="marg, margarita" />
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Sizes</legend>
        {sizes.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={`${input} max-w-40`} placeholder="Name" aria-label="Size name" value={s.name} onChange={(e) => setSize(i, { name: e.target.value })} />
            <input className={`${input} max-w-28`} placeholder="Price" aria-label="Size price" inputMode="decimal" value={s.price} onChange={(e) => setSize(i, { price: e.target.value })} />
            {showCost && (
              <input className={`${input} max-w-28`} placeholder="Cost" aria-label="Size cost" inputMode="decimal" value={s.cost} onChange={(e) => setSize(i, { cost: e.target.value })} />
            )}
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="default-size" checked={s.is_default} onChange={() => makeDefault(i)} /> Default
            </label>
            <IconButton label="Remove size" onClick={() => setSizes((l) => l.filter((_, k) => k !== i))}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button onClick={() => setSizes((l) => [...l, { name: "", price: "", is_default: l.length === 0, cost: "" }])}>
            <Plus size={16} /> Add size
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Extras</legend>
        {showCost && <p className="text-xs text-ink-faint">Cost (owner only): an empty cost means &quot;not set&quot; and the order shows &quot;Cost not set&quot;. Put 0 for an extra that costs you nothing.</p>}
        {options.map((o, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={`${input} max-w-36`} placeholder="Group" aria-label="Extra group" value={o.group_name} onChange={(e) => setOption(i, { group_name: e.target.value })} />
            <input className={`${input} max-w-40`} placeholder="Name" aria-label="Extra name" value={o.name} onChange={(e) => setOption(i, { name: e.target.value })} />
            <input className={`${input} max-w-24`} placeholder="Price +" aria-label="Extra price" inputMode="decimal" value={o.price_delta} onChange={(e) => setOption(i, { price_delta: e.target.value })} />
            <input className={`${input} max-w-20`} placeholder="Max" aria-label="Max select" inputMode="numeric" value={o.max_select} onChange={(e) => setOption(i, { max_select: e.target.value })} />
            {showCost && (
              <input className={`${input} max-w-24`} placeholder="Cost" aria-label="Extra cost" inputMode="decimal" value={o.cost} onChange={(e) => setOption(i, { cost: e.target.value })} />
            )}
            <IconButton label="Remove extra" onClick={() => setOptions((l) => l.filter((_, k) => k !== i))}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button onClick={() => setOptions((l) => [...l, { group_name: "", name: "", price_delta: "0", max_select: "1", cost: "" }])}>
            <Plus size={16} /> Add extra
          </Button>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={veg} onChange={(e) => setVeg(e.target.checked)} /> Vegetarian
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> Available
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Spice level</span>
          <select className={input} value={spice} onChange={(e) => setSpice(e.target.value)}>
            <option value="">Not set</option>
            <option value="0">0 (none)</option>
            <option value="1">1 (mild)</option>
            <option value="2">2 (medium)</option>
            <option value="3">3 (hot)</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Sort order</span>
          <input className={input} inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-semibold">Photo</p>
        {item ? (
          <div className="flex flex-wrap items-center gap-3">
            {item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- preview of our own public photo
              <img src={item.image_url} alt="" className="size-20 rounded-xl object-cover" />
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={(e) => uploadPhoto(e.target.files?.[0])} aria-label="Upload photo" className="text-sm" />
            {item.image_url && (
              <Button disabled={photoBusy} onClick={removePhoto}>
                Remove photo
              </Button>
            )}
            {photoMsg && <span className={`text-sm ${photoMsg.ok ? "text-ink-muted" : "text-danger"}`}>{photoMsg.text}</span>}
          </div>
        ) : (
          <p className="text-xs text-ink-faint">Save the item first, then open it again to add a photo.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving..." : "Save item"}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}
