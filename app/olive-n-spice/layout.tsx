import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { routes, site } from "@/data/sites/olive-n-spice/config";
import { JsonLd } from "./_components/json-ld";
import { RevealObserver } from "./_components/reveal-observer";
import { ScrollProgress } from "./_components/scroll-progress";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";
import { pageMetadata } from "./_lib/seo";
import "./olive.css";

// The shared frame for every Olive 'n Spice page: fonts, header, footer, the
// scroll-progress line on the left edge and the search-engine data. These pages are public (no login). The dashboard
// login in proxy.ts only guards /dashboard, so it is not involved here.

// Fonts are downloaded at build time and served from our own site.
// Cormorant Garamond = the elegant serif for headings and the wordmark.
// Jost = the clean sans for everything else.
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-ons-serif",
  display: "swap",
});
const sans = Jost({
  subsets: ["latin"],
  variable: "--font-ons-sans",
  display: "swap",
});

export const metadata: Metadata = pageMetadata({ description: site.description, path: routes.home });

export default function OliveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ons ${serif.variable} ${sans.variable}`}>
      <a href="#content" className="ons-skip">
        Skip to content
      </a>
      <SiteHeader />
      <main id="content" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      <ScrollProgress />
      <RevealObserver />
      <JsonLd />
    </div>
  );
}
