import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { routes, site } from "@/data/sites/olive-n-spice/config";
import { menuFootnote } from "@/data/sites/olive-n-spice/menu";
import { MenuBrowser } from "../_components/menu-browser";
import { ChefMark, Divider, SpiceMark } from "../_components/ornaments";
import { PageHero } from "../_components/page-hero";
import { pageMetadata } from "../_lib/seo";

// The Menu page. The whole menu text is rendered on the server (good for
// search engines); tabs and search are added on top in the browser.

export const metadata: Metadata = pageMetadata({
  title: "Menu",
  description: `The full ${site.name} menu: starters and soups, pasta and continental, Chinese, pizza and burgers, Mughlai and BBQ, desserts and drinks. Prices in rupees.`,
  path: routes.menu,
});

export default function MenuPage() {
  return (
    <>
      <PageHero
        eyebrow="The menu"
        title={
          <>
            Chinese, Continental, <em>Fast Food &amp; Desi.</em>
          </>
        }
        intro="Everything we serve, with prices in rupees. Tap a category to jump straight to it, or search for a dish."
      >
        {/* What the little marks mean. */}
        <ul className="ons-legend" aria-label="Key to the marks on the menu">
          <li>
            <ChefMark size={15} /> Chef&apos;s special
          </li>
          <li>
            <SpiceMark level={1} /> Mild
          </li>
          <li>
            <SpiceMark level={2} /> Medium
          </li>
          <li>
            <SpiceMark level={3} /> Hot
          </li>
        </ul>
      </PageHero>

      <MenuBrowser />

      <section className="ons-menu-end">
        <div className="ons-container ons-container-narrow">
          <Divider />
          <p className="ons-menu-footnote">{menuFootnote}</p>
          <Link href={routes.reserve} className="ons-btn ons-btn-gold">
            Reserve a table
            <ArrowRight size={16} className="ons-btn-arrow" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
