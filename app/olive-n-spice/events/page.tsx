import type { Metadata } from "next";
import { routes, site } from "@/data/sites/olive-n-spice/config";
import { EnquiryForm } from "../_components/enquiry-form";
import { Occasions } from "../_components/occasions";
import { PageHero } from "../_components/page-hero";
import { PhotoSlot } from "../_components/photo-slot";
import { pageMetadata } from "../_lib/seo";

// The Events page: what kinds of events the restaurant hosts, its promise
// to guests, and an enquiry form (which, for now, does not send anything;
// see enquiry-form.tsx).

const { heading, occasions, promise } = site.content.events;

export const metadata: Metadata = pageMetadata({
  title: "Events",
  description: `${heading} at ${site.name}, ${site.location.city}: ${occasions.join(", ").toLowerCase()}.`,
  path: routes.events,
});

export default function EventsPage() {
  return (
    <>
      <PageHero eyebrow="Events" title={heading} intro={promise} />

      <section className="ons-section" aria-labelledby="occasions-title">
        <div className="ons-container ons-events-grid">
          <PhotoSlot photo={site.photos.events} caption="Private celebrations" shape="wide" tone="gold" sizes="(min-width: 1024px) 44vw, 90vw" />
          <div className="ons-events-copy">
            <p className="ons-eyebrow" data-reveal>
              Occasions
            </p>
            <h2 id="occasions-title" className="ons-display ons-h2" data-reveal>
              Gatherings we <em>love to host.</em>
            </h2>
            <Occasions />
            <p className="ons-lead" data-reveal>
              Celebrate with warm vibes inside or out in our serene courtyard.
            </p>
          </div>
        </div>
      </section>

      <section className="ons-section ons-enquiry" aria-labelledby="enquiry-title">
        <div className="ons-container ons-enquiry-grid">
          <div className="ons-events-copy">
            <p className="ons-eyebrow" data-reveal>
              Enquire
            </p>
            <h2 id="enquiry-title" className="ons-display ons-h2" data-reveal>
              Tell us about <em>your event.</em>
            </h2>
            <p className="ons-lead" data-reveal>
              The occasion, the date and how many guests: a few details are all we need to start planning with you.
            </p>
          </div>
          <div className="ons-card" data-reveal>
            <EnquiryForm />
          </div>
        </div>
      </section>
    </>
  );
}
