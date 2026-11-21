"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads the page's server data every `seconds` while the tab is visible (Home's live numbers). Renders nothing. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
