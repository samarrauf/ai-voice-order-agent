import { redirect } from "next/navigation";

// "Stats" was renamed to "Overview". Old links and bookmarks still work.
export default function StatsPage() {
  redirect("/dashboard/overview");
}
