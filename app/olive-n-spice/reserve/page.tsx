import type { Metadata } from "next";
import { ArrowUpRight, Clock, MapPin, MessageCircle, Phone, Share2 } from "lucide-react";
import { cityLine, phoneHref, routes, site, whatsappHref } from "@/data/sites/olive-n-spice/config";
import { hasDirectContact } from "../_components/contact-actions";
import { PageHero } from "../_components/page-hero";
import { pageMetadata } from "../_lib/seo";

// Reserve & Contact. Bookings are taken by phone or WhatsApp; there is NO
// online booking system connected here (that comes later). Every detail is
// read from config.ts, and anything not known yet says "Coming soon" /
// "To be confirmed" instead of showing a made-up value.

export const metadata: Metadata = pageMetadata({
  title: "Reserve & Contact",
  description: `Reserve a table at ${site.name}, ${cityLine}. Find our contact details, location and opening hours.`,
  path: routes.reserve,
});

function ActionCard({
  icon,
  title,
  value,
  href,
  cta,
  newTab,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | null;
  href: string | null;
  cta: string;
  newTab?: boolean;
}) {
  return (
    <div className="ons-action-card" data-reveal>
      <span className="ons-action-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h2 className="ons-action-title">{title}</h2>
        <p className="ons-action-value">{value ?? <span className="ons-tbc">Coming soon</span>}</p>
      </div>
      {href ? (
        <a
          href={href}
          className="ons-btn ons-btn-gold"
          {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {cta}
          {newTab && <span className="sr-only">(opens in a new tab)</span>}
        </a>
      ) : (
        <span className="ons-btn" aria-disabled="true">
          {cta} · coming soon
        </span>
      )}
    </div>
  );
}

export default function ReservePage() {
  const { location, openingHours, social } = site;

  return (
    <>
      <PageHero
        eyebrow="Reserve & contact"
        title={
          <>
            Reserve <em>your table.</em>
          </>
        }
        intro={
          hasDirectContact
            ? "Call or WhatsApp us and we will book your table, inside or out in the courtyard."
            : "Table bookings by phone and WhatsApp are opening soon. Our numbers will appear on this page as soon as they are confirmed."
        }
      />

      <section className="ons-section ons-reserve-actions" aria-label="Ways to reserve">
        <div className="ons-container ons-action-grid">
          <ActionCard
            icon={<Phone size={22} strokeWidth={1.4} />}
            title="Call us"
            value={site.contact.phone}
            href={phoneHref()}
            cta="Call now"
          />
          <ActionCard
            icon={<MessageCircle size={22} strokeWidth={1.4} />}
            title="WhatsApp"
            value={site.contact.whatsapp}
            href={whatsappHref(`Hello ${site.name}, I would like to reserve a table.`)}
            cta="Message us"
            newTab
          />
        </div>
      </section>

      <section id="contact" className="ons-section ons-visit" aria-labelledby="visit-title">
        <div className="ons-container">
          <div className="ons-visit-head">
            <p className="ons-eyebrow" data-reveal>
              Visit
            </p>
            <h2 id="visit-title" className="ons-display ons-h2" data-reveal>
              Find us in <em>{location.city}.</em>
            </h2>
          </div>

          <div className="ons-info-grid">
            <ul className="ons-info-list">
              <li className="ons-info-item" data-reveal>
                <span className="ons-info-icon" aria-hidden="true">
                  <MapPin size={20} strokeWidth={1.4} />
                </span>
                <div>
                  <h3 className="ons-info-title">Address</h3>
                  <p>{location.streetAddress ?? <span className="ons-tbc">To be confirmed</span>}</p>
                  <p>{cityLine}</p>
                  {location.mapLinkUrl && (
                    <a href={location.mapLinkUrl} target="_blank" rel="noopener noreferrer" className="ons-inline-link">
                      Get directions <ArrowUpRight size={13} aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </div>
              </li>
              <li className="ons-info-item" data-reveal>
                <span className="ons-info-icon" aria-hidden="true">
                  <Clock size={20} strokeWidth={1.4} />
                </span>
                <div>
                  <h3 className="ons-info-title">Opening hours</h3>
                  {openingHours ? (
                    <dl className="ons-hours">
                      {openingHours.map((row) => (
                        <div key={row.days}>
                          <dt>{row.days}</dt>
                          <dd>{row.hours}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="ons-tbc">To be confirmed</p>
                  )}
                </div>
              </li>
              {(social.facebook || social.instagram) && (
                <li className="ons-info-item" data-reveal>
                  <span className="ons-info-icon" aria-hidden="true">
                    <Share2 size={20} strokeWidth={1.4} />
                  </span>
                  <div>
                    <h3 className="ons-info-title">Follow &amp; message</h3>
                    {social.facebook && (
                      <p>
                        <a href={social.facebook.url} target="_blank" rel="noopener noreferrer" className="ons-inline-link">
                          Facebook: {social.facebook.handle} <ArrowUpRight size={13} aria-hidden />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </p>
                    )}
                    {social.instagram && (
                      <p>
                        <a href={social.instagram.url} target="_blank" rel="noopener noreferrer" className="ons-inline-link">
                          Instagram: @{social.instagram.handle} <ArrowUpRight size={13} aria-hidden />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </p>
                    )}
                  </div>
                </li>
              )}
            </ul>

            {/* The map. Paste a Google Maps embed link into config.ts (location.mapEmbedUrl) to switch it on. */}
            <div className="ons-map" data-reveal>
              {location.mapEmbedUrl ? (
                <iframe
                  src={location.mapEmbedUrl}
                  title={`Map showing ${site.name}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="ons-map-empty">
                  <span className="ons-map-pin" aria-hidden="true">
                    <MapPin size={24} strokeWidth={1.4} />
                  </span>
                  <p className="ons-map-title">{cityLine}</p>
                  <p className="ons-tbc">Map coming soon</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
