import Image from "next/image";
import type { HeroSlide } from "@/data/sites/olive-n-spice/hero";
import type { MenuGroup } from "@/data/sites/olive-n-spice/menu";
import { FoodArt } from "../food-art";

// One slide of the hero: three dishes floating in the middle (a soft
// shadow under each), and below them the group's name in big serif type
// with its categories on one small line.
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
  /** "active" = on screen; "before"/"after" = waiting off to the left/right. */
  state: "active" | "before" | "after";
  onExplore: () => void;
};

export function HeroSlideView({ slide, group, index, total, state, onExplore }: Props) {
  const active = state === "active";
  const number = String(index + 1).padStart(2, "0");

  return (
    <div
      className="ons-slide"
      data-state={state}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}: ${group.name}`}
      aria-hidden={!active}
      inert={!active}
    >
      <button type="button" className="ons-cluster" onClick={onExplore} aria-label={`Explore ${group.name}`}>
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
                    sizes="(min-width: 768px) 320px, 46vw"
                    priority={index === 0}
                    draggable={false}
                  />
                ) : (
                  <FoodArt name={slide.art[i]} />
                )}
              </span>
              <span className="ons-shadow" aria-hidden="true" />
            </span>
          );
        })}
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
}
