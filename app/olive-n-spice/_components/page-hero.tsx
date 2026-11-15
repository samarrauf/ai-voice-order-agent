import { OliveBranch } from "./ornaments";

// The title band at the top of the inner pages (Menu, Events, Reserve):
// a small label, a big serif heading and one or two lines of intro text,
// with an olive branch drawn faintly in the corner.

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children?: React.ReactNode;
};

export function PageHero({ eyebrow, title, intro, children }: Props) {
  return (
    <section className="ons-page-hero">
      <OliveBranch className="ons-page-hero-branch" />
      <div className="ons-container">
        <div className="ons-page-hero-inner">
          <p className="ons-eyebrow">{eyebrow}</p>
          <h1 className="ons-display ons-h1">{title}</h1>
          {intro && <p className="ons-lead">{intro}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}
