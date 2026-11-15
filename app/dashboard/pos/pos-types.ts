// The shapes the POS page (server) hands to the POS screen (browser).
// Prices here are read straight from the menu tables for DISPLAY on tiles and
// in the options popup. Cart totals never use them (see price-preview).

export type PosSize = { name: string; price: number; isDefault: boolean };
export type PosOption = { name: string; priceDelta: number };
export type PosOptionGroup = { name: string; maxSelect: number; options: PosOption[] };

export type PosItem = {
  id: string;
  name: string;
  /** Price on the tile: the default size's price, or the base price if there are no sizes. */
  price: number;
  available: boolean;
  sizes: PosSize[];
  optionGroups: PosOptionGroup[];
  /** Lower-case name + aliases, for the search box. */
  search: string;
};

export type PosCategory = { id: string; name: string; items: PosItem[] };

export type PosTable = {
  id: string;
  number: string;
  seats: number;
  /** The open seating session, if someone is sitting there now. */
  sessionId: string | null;
  partySize: number | null;
};
