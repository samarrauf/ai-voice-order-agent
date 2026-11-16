import { SiteLink } from "./site-link";
import { ArrowUpRight, Phone } from "lucide-react";
import { cityLine, phoneHref, routes, site } from "@/data/sites/olive-n-spice/config";
import { OliveBranch } from "./ornaments";
import { Wordmark } from "./wordmark";

// The dark band at the bottom of every page: logo, page links, where to
// find us (directions, phone, hours) and social links, all read from
// config.ts. Anything still unknown there (today: the street address)
// shows "To be confirmed" instead of a made-up value.

export function SiteFooter() {
  const { facebook, instagram } = site.social;
  const tel = phoneHref();

  return (
    <footer className="ons-footer ons-on-dark">
      <OliveBranch className="ons-footer-branch" />
      <div className="ons-container relative">
        <div className="ons-footer-top">
          <div className="flex flex-col items-start gap-5">
            <Wordmark size="lg" showGroup />
            <p className="max-w-xs text-[0.95rem] leading-relaxed opacity-80">
              {site.cuisines.slice(0, -1).join(", ")} &amp; {site.cuisines.at(-1)}, with warm vibes inside and a serene
              courtyard.
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="ons-footer-title">Explore</p>
            <ul className="ons-footer-list">
              <li><SiteLink href={routes.home}>Home</SiteLink></li>
              <li><SiteLink href={routes.menu}>Menu</SiteLink></li>
              <li><SiteLink href={routes.events}>Events</SiteLink></li>
              <li><SiteLink href={routes.reserve}>Reserve &amp; Contact</SiteLink></li>
            </ul>
          </nav>

          <div>
            <p className="ons-footer-title">Visit</p>
            <ul className="ons-footer-list">
              <li>{site.location.streetAddress ?? <span className="ons-tbc">Address to be confirmed</span>}</li>
              <li>{cityLine}</li>
              {site.location.mapLinkUrl && (
                <li>
                  <a href={site.location.mapLinkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
                    Get directions <ArrowUpRight size={14} aria-hidden />
                    <span className="sr-only">(opens Google Maps in a new tab)</span>
                  </a>
                </li>
              )}
              {tel && (
                <li>
                  <a href={tel} className="inline-flex items-center gap-1.5">
                    <Phone size={14} aria-hidden />
                    <span className="sr-only">Call </span>
                    {site.contact.phone?.display}
                  </a>
                </li>
              )}
              <li>
                {site.openingHours ? (
                  site.openingHours.map((row) => (
                    <span key={row.days} className="block">
                      {row.days}: {row.hours}
                    </span>
                  ))
                ) : (
                  <span className="ons-tbc">Opening hours to be confirmed</span>
                )}
              </li>
            </ul>
          </div>

          <div>
            <p className="ons-footer-title">Follow</p>
            <ul className="ons-footer-list">
              {facebook && (
                <li>
                  <a href={facebook.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
                    Facebook <ArrowUpRight size={14} aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              )}
              {instagram && (
                <li>
                  <a href={instagram.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
                    Instagram <ArrowUpRight size={14} aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="ons-footer-bottom">
          <p>
            © {site.name} · by {site.parentGroup}
          </p>
          <p>{site.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
