import { HeroIntro } from "./_components/hero/hero-intro";
import { MenuHero } from "./_components/hero/menu-hero";

// Home page: the intro curtain, then the interactive menu hero.
// (The sections below the hero are added in the next step.)
export default function OliveHomePage() {
  return (
    <>
      <HeroIntro />
      <MenuHero />
    </>
  );
}
