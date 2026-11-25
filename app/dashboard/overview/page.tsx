import { redirect } from "next/navigation";

// "Overview" was replaced by Reports (P4). Old links and bookmarks still work.
export default function OverviewPage() {
  redirect("/dashboard/reports");
}
