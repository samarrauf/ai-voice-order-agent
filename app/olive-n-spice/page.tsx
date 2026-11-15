import { cityLine, site } from "@/data/sites/olive-n-spice/config";
import { PageHero } from "./_components/page-hero";

// Home page. (Temporary: the interactive hero and the sections below it are
// added in the next steps.)
export default function OliveHomePage() {
  return (
    <PageHero
      eyebrow={cityLine}
      title={site.name}
      intro={site.tagline}
    />
  );
}
