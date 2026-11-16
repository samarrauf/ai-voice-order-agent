"use client";

import Link from "next/link";
import { useSyncExternalStore, type ComponentProps } from "react";
import { siteHref } from "@/lib/hosts";

// A link to another page of the website. Pages are written with their full
// path ("/olive-n-spice/menu"); on olive-n-spice.vercel.app this link shows
// the clean address ("/menu"), on every other domain it is left as written.
// The decision is made with siteHref() in lib/hosts.ts.
//
// The pages are built ahead of time and do not know which domain they will be
// shown on, so the first paint carries the full path (which still works: that
// domain redirects it to the clean one) and the browser switches the link to
// the clean address as soon as the page has loaded.

const subscribe = () => () => {};
const readHost = () => window.location.host;
const serverHost = () => "";

export function useSiteHost(): string {
  return useSyncExternalStore(subscribe, readHost, serverHost);
}

export function SiteLink({ href, ...props }: ComponentProps<typeof Link>) {
  const host = useSiteHost();
  return <Link {...props} href={typeof href === "string" ? siteHref(href, host) : href} />;
}
