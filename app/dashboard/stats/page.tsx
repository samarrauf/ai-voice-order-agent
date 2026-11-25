import { redirect } from "next/navigation";

// "Stats" became "Overview", which became Reports (P4). Old links and bookmarks still work.
export default function StatsPage() {
  redirect("/dashboard/reports");
}
