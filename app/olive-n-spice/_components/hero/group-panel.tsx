"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { menuAnchor, routes } from "@/data/sites/olive-n-spice/config";
import { formatPriceLine, formatRs, type MenuGroup } from "@/data/sites/olive-n-spice/menu";
import { ChefMark, SpiceMark } from "../ornaments";

// The panel that opens from the hero ("Explore" or a tap on the dishes).
// On phones it slides up from the bottom as a sheet; on larger screens it
// slides in from the right. Top: the group's categories as chips. Below:
// that category's dishes and prices (straight from menu.ts), then a link
// to the same section of the full menu page.
//
// It is a native <dialog>, which gives us the important accessibility
// behaviour for free: focus stays inside the panel, Esc closes it, and
// focus returns to the button that opened it.

type Props = {
  /** The group to show. Kept while closing so the content does not vanish mid-animation. */
  group: MenuGroup | null;
  open: boolean;
  onClose: () => void;
};

export function GroupPanel({ group, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="ons-panel"
      aria-labelledby="ons-panel-title"
      onClose={onClose}
      // A click on the dimmed area outside the panel lands on the <dialog> itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {group && <PanelContent key={group.id} group={group} onClose={onClose} />}
    </dialog>
  );
}

function PanelContent({ group, onClose }: { group: MenuGroup; onClose: () => void }) {
  const [categoryId, setCategoryId] = useState(group.categories[0].id);
  const category = group.categories.find((c) => c.id === categoryId) ?? group.categories[0];

  return (
    <div className="ons-panel-inner">
      <span className="ons-panel-grip" aria-hidden="true" />
      <header className="ons-panel-head">
        <div>
          <p className="ons-eyebrow">The menu</p>
          <h2 id="ons-panel-title" className="ons-display ons-panel-title">
            {group.name}
          </h2>
        </div>
        <button type="button" className="ons-panel-close" aria-label="Close panel" onClick={onClose}>
          <X size={20} strokeWidth={1.5} aria-hidden />
        </button>
      </header>

      <div className="ons-chips" role="group" aria-label={`${group.name} categories`}>
        {group.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ons-chip"
            aria-pressed={c.id === category.id}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="ons-panel-body">
        <h3 className="sr-only">{category.name}</h3>
        {(category.priceLabels || category.note || category.sideOptions) && (
          <p className="ons-panel-note">
            {[
              category.priceLabels && `Prices: ${category.priceLabels.join(" / ")}`,
              category.note,
              category.sideOptions && `Side options: ${category.sideOptions.join(" | ")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <ul className="ons-panel-list">
          {category.items.map((item) => (
            <li key={item.id} className="ons-panel-item">
              <span className="ons-panel-item-name">
                {item.name}
                {item.serving && <span className="ons-panel-item-serving">{item.serving}</span>}
                {item.chefSpecial && <ChefMark />}
                <SpiceMark level={item.spiceLevel} />
              </span>
              <span className="ons-panel-item-price">{formatPriceLine(item.prices)}</span>
            </li>
          ))}
        </ul>
        {category.extras?.map((extra) => (
          <p key={extra.name} className="ons-panel-note">
            {extra.label ? `${extra.label}: ${extra.name}` : extra.name}: {extra.prices.map((p) => (p.label ? `${p.label} ${formatRs(p.amount)}` : formatRs(p.amount))).join(" / ")}
          </p>
        ))}
      </div>

      <footer className="ons-panel-foot">
        <Link href={menuAnchor(category.id)} className="ons-btn ons-btn-olive flex-1" onClick={onClose}>
          View full menu
          <ArrowRight size={16} className="ons-btn-arrow" aria-hidden />
        </Link>
        <Link href={routes.reserve} className="ons-btn ons-btn-gold" onClick={onClose}>
          Reserve
        </Link>
      </footer>
    </div>
  );
}
