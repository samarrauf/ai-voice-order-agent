import { HeroIntro } from "./_components/hero/hero-intro";
import { MenuHero } from "./_components/hero/menu-hero";
import { AboutSection, EventsSection, GallerySection, ReserveSection, SpecialsSection } from "./_components/home-sections";

// Home page, top to bottom: the intro curtain (first visit only), the
// interactive menu hero, then About, Chef's Specials, Events, an optional
// photo gallery (hidden until real photos exist) and Reserve / contact.
export default function OliveHomePage() {
  return (
    <>
      <HeroIntro />
      <MenuHero />
      <AboutSection />
      <SpecialsSection />
      <EventsSection />
      <GallerySection />
      <ReserveSection />
    </>
  );
}
