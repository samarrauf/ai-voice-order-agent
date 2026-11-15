import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cityLine, menuAnchor, routes, site } from "@/data/sites/olive-n-spice/config";
import type { HeroArt } from "@/data/sites/olive-n-spice/hero";
import { formatPriceLine, getChefSpecials } from "@/data/sites/olive-n-spice/menu";
import { ContactActions, hasDirectContact } from "./contact-actions";
import { FoodArt } from "./food-art";
import { Occasions } from "./occasions";
import { ChefMark, Divider, OliveBranch } from "./ornaments";
import { PhotoSlot } from "./photo-slot";

// The sections of the home page that sit below the hero:
//   About  ->  Chef's Specials  ->  Events  ->  Reserve / contact
// Elements marked `data-reveal` fade up gently as they scroll into view.

/** A small drawing for each cuisine in the About section. */
const CUISINE_ART: Record<string, HeroArt> = {
  Chinese: "wok",
  Continental: "steak",
  "Fast Food": "burger",
  Desi: "handi",
};

const delay = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as React.CSSProperties;

export function AboutSection() {
  return (
    <section className="ons-section ons-about" aria-labelledby="about-title">
      <div className="ons-container ons-about-grid">
        <div className="ons-about-copy">
          <p className="ons-eyebrow" data-reveal>
            Welcome to {site.name}
          </p>
          <h2 id="about-title" className="ons-display ons-h2" data-reveal style={delay(80)}>
            Warm vibes inside, <em>a serene courtyard</em> outside.
          </h2>
          <p className="ons-lead" data-reveal style={delay(160)}>
            {site.content.about}
          </p>
          <ul className="ons-cuisines" data-reveal style={delay(240)}>
            {site.cuisines.map((cuisine) => (
              <li key={cuisine} className="ons-cuisine">
                {CUISINE_ART[cuisine] && <FoodArt name={CUISINE_ART[cuisine]} className="ons-cuisine-art" />}
                {cuisine}
              </li>
            ))}
          </ul>
          <div data-reveal style={delay(320)}>
            <Link href={routes.menu} className="ons-btn ons-btn-olive">
              View the menu
              <ArrowRight size={16} className="ons-btn-arrow" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="ons-about-photos">
          <PhotoSlot photo={site.photos.interior} caption="Warm vibes inside" tone="olive" />
          <PhotoSlot photo={site.photos.courtyard} caption="The serene courtyard" tone="sage" className="ons-about-photo-b" />
        </div>
      </div>
    </section>
  );
}

export function SpecialsSection() {
  const specials = getChefSpecials();
  if (specials.length === 0) return null;

  return (
    <section className="ons-section ons-specials ons-on-dark" aria-labelledby="specials-title">
      <OliveBranch className="ons-specials-branch" />
      <div className="ons-container">
        <div className="ons-section-head">
          <p className="ons-eyebrow ons-eyebrow-center" data-reveal>
            Chef&apos;s Specials
          </p>
          <h2 id="specials-title" className="ons-display ons-h2" data-reveal style={delay(80)}>
            Our chef&apos;s <em>signature dishes.</em>
          </h2>
          <Divider />
        </div>
      </div>

      {/* Phones: a row you swipe sideways. Larger screens: a grid. */}
      <ul className="ons-specials-list">
        {specials.map(({ item, category }, i) => (
          <li key={item.id} data-reveal style={delay(i * 70)}>
            <Link href={menuAnchor(category.id)} className="ons-special-card">
              <span className="ons-special-top">
                <span className="ons-special-category">{category.name}</span>
                <ChefMark size={16} />
              </span>
              <span className="ons-special-name">{item.name}</span>
              {item.description && <span className="ons-special-desc">{item.description}</span>}
              <span className="ons-special-foot">
                <span className="ons-special-price">{formatPriceLine(item.prices)}</span>
                <span className="ons-special-more">
                  See on menu <ArrowRight size={14} aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsSection() {
  const { heading, promise } = site.content.events;

  return (
    <section className="ons-section ons-events" aria-labelledby="events-title">
      <div className="ons-container ons-events-grid">
        <PhotoSlot photo={site.photos.events} caption="Private celebrations" shape="wide" tone="gold" sizes="(min-width: 1024px) 44vw, 90vw" />
        <div className="ons-events-copy">
          <p className="ons-eyebrow" data-reveal>
            Events
          </p>
          <h2 id="events-title" className="ons-display ons-h2" data-reveal style={delay(80)}>
            {heading}
          </h2>
          <Occasions />
          <p className="ons-quote" data-reveal>
            {promise}
          </p>
          <div data-reveal>
            <Link href={routes.events} className="ons-btn ons-btn-olive">
              Plan your event
              <ArrowRight size={16} className="ons-btn-arrow" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Shown only once real gallery photos are added to config.ts (photos.gallery). */
export function GallerySection() {
  if (site.photos.gallery.length === 0) return null;
  return (
    <section className="ons-section ons-gallery" aria-label="Gallery">
      <ul className="ons-gallery-list">
        {site.photos.gallery.map((photo) => (
          <li key={photo.src}>
            <PhotoSlot photo={photo} shape="wide" sizes="(min-width: 768px) 33vw, 80vw" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReserveSection() {
  const { facebook, instagram } = site.social;

  return (
    <section className="ons-section ons-reserve-band ons-on-dark" aria-labelledby="reserve-title">
      <OliveBranch className="ons-reserve-branch" />
      <div className="ons-container ons-reserve-inner">
        <p className="ons-eyebrow ons-eyebrow-center" data-reveal>
          {cityLine}
        </p>
        <h2 id="reserve-title" className="ons-display ons-h2" data-reveal style={delay(80)}>
          Reserve <em>your table.</em>
        </h2>
        <p className="ons-lead" data-reveal style={delay(160)}>
          {hasDirectContact
            ? "Call or message us to book your table, inside or out in the courtyard."
            : "Our phone and WhatsApp booking lines will be listed here shortly. Until then, message us on Facebook or Instagram."}
        </p>
        <div data-reveal style={delay(240)}>
          <ContactActions whatsappMessage={`Hello ${site.name}, I would like to reserve a table.`} />
        </div>
        <div className="ons-reserve-links" data-reveal style={delay(320)}>
          <Link href={routes.reserve} className="ons-link">
            Reserve &amp; contact <ArrowRight size={14} aria-hidden />
          </Link>
          {facebook && (
            <a href={facebook.url} target="_blank" rel="noopener noreferrer" className="ons-link">
              Facebook <ArrowUpRight size={14} aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          {instagram && (
            <a href={instagram.url} target="_blank" rel="noopener noreferrer" className="ons-link">
              Instagram <ArrowUpRight size={14} aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
