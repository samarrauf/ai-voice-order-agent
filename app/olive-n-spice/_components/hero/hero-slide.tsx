import Image from "next/image";
import { memo } from "react";
import type { HeroSlide } from "@/data/sites/olive-n-spice/hero";
import type { MenuGroup } from "@/data/sites/olive-n-spice/menu";
import { FoodArt } from "../food-art";

// One group on the hero strip: three dishes with a soft shadow on the
// ground under each, and the group's name in big serif type with its
// categories on one small line.
//
// This file only describes the pieces. It does not move anything: the
// engine in use-hero-track.ts finds these pieces by their class names and
// positions them as the strip moves:
//   .ons-cluster       the three dishes together (slides, shrinks, fades, blurs)
//   .ons-cluster-item  one dish (its own speed, turn, lean and lift = depth)
//   .ons-shadow-wrap   the shadow under a dish (shrinks when the dish lifts)
//   .ons-slide-text    the name and category line (fades and slides)
// The gentle "floating" while nothing moves is plain CSS (see olive.css).
//
// THE `images` SLOT: if the slide has `images` (see hero.ts), each real
// photo replaces the illustration in the same position. Nothing else in
// the code needs to change.

const POSITIONS = ["left", "center", "right"] as const;

type Props = {
  slide: HeroSlide;
  group: MenuGroup;
  index: number;
  total: number;
  /** True for the group in the middle. The others are scenery: screen readers and the Tab key skip them. */
  active: boolean;
  onExplore: (groupId: string) => void;
};

// `memo` = React leaves a piece alone unless its own details change. The
// three dishes (the heavy part: the drawings) never change, so they are
// skipped completely when a different group becomes the middle one. That
// keeps the strip from stuttering as it passes from one group to the next.
const SlideDishes = memo(function SlideDishes({ slide, first }: { slide: HeroSlide; first: boolean }) {
  return (
    <>
      {POSITIONS.map((position, i) => {
        const image = slide.images?.[i];
        return (
          <span key={position} className="ons-cluster-item" data-pos={position} style={{ "--i": i } as React.CSSProperties}>
            <span className="ons-float">
              {image ? (
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={640}
                  height={640}
                  sizes="(min-width: 768px) 320px, 40vw"
                  priority={first}
                  draggable={false}
                />
              ) : (
                <FoodArt name={slide.art[i]} />
              )}
            </span>
            <span className="ons-shadow-wrap" aria-hidden="true">
              <span className="ons-shadow" />
            </span>
          </span>
        );
      })}
    </>
  );
});

export const HeroSlideView = memo(function HeroSlideView({ slide, group, index, total, active, onExplore }: Props) {
  const number = String(index + 1).padStart(2, "0");

  return (
    <div
      className="ons-slide"
      data-tone={slide.tone}
      data-active={active ? "" : undefined}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}: ${group.name}`}
      aria-hidden={!active}
    >
      {/*
        Only the middle group's dishes open the panel. A side group is hidden from
        screen readers (aria-hidden above) and skipped by the Tab key (tabIndex -1);
        a click on it is handled by the strip, which brings that group to the middle.
      */}
      <button
        type="button"
        className="ons-cluster"
        tabIndex={active ? undefined : -1}
        onClick={active ? () => onExplore(group.id) : undefined}
        aria-label={`Explore ${group.name}`}
      >
        <SlideDishes slide={slide} first={index === 0} />
      </button>

      <div className="ons-slide-text">
        <p className="ons-slide-count" aria-hidden="true">
          {number} <span>/</span> {String(total).padStart(2, "0")}
        </p>
        <h2 className="ons-slide-title">{group.name}</h2>
        <p className="ons-slide-cats">{group.categories.map((c) => c.shortName ?? c.name).join(" · ")}</p>
      </div>
    </div>
  );
});
