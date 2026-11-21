import {
  CalendarDays,
  KeyRound,
  House,
  LayoutDashboard,
  Armchair,
  MessagesSquare,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/lib/nav";

// lucide-react is already a dependency, so no hand-drawn SVGs are needed.
// One map from lib/nav.ts icon names to the real icons.
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  home: House,
  orders: ReceiptText,
  overview: LayoutDashboard,
  bookings: CalendarDays,
  calls: MessagesSquare,
  customers: Users,
  tables: Armchair,
  menu: UtensilsCrossed,
  expenses: Wallet,
  staff: UserCog,
  settings: Settings,
  password: KeyRound,
};
