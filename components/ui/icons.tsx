import {
  CalendarDays,
  KeyRound,
  LayoutDashboard,
  Armchair,
  MessagesSquare,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/lib/nav";

// lucide-react is already a dependency, so no hand-drawn SVGs are needed.
// One map from lib/nav.ts icon names to the real icons.
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  orders: ReceiptText,
  overview: LayoutDashboard,
  bookings: CalendarDays,
  calls: MessagesSquare,
  customers: Users,
  tables: Armchair,
  menu: UtensilsCrossed,
  staff: UserCog,
  settings: Settings,
  password: KeyRound,
};
