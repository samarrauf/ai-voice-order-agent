import Image from "next/image";
import type { SitePhoto } from "@/data/sites/olive-n-spice/config";
import { OliveBranch } from "./ornaments";

// A picture frame with a clear place for a REAL photo.
//   - If a photo is set in config.ts (photos.interior, photos.courtyard, ...)
//     it fills the frame.
//   - Until then the frame shows an illustrated panel (gradient, olive
//     branch, a thin gold border) so the page still looks finished.
// No restaurant photos are invented or downloaded.

type Props = {
  photo: SitePhoto | null;
  /** Short caption inside the frame, e.g. "Warm vibes inside". */
  caption?: string;
  /** "arch" = tall with a rounded top, "wide" = landscape. */
  shape?: "arch" | "wide";
  tone?: "olive" | "sage" | "gold";
  /** How wide the photo is on screen (helps the browser pick a small file). */
  sizes?: string;
  className?: string;
};

export function PhotoSlot({ photo, caption, shape = "arch", tone = "olive", sizes = "(min-width: 1024px) 28vw, 80vw", className }: Props) {
  return (
    <figure className={className ? `ons-photo ${className}` : "ons-photo"} data-shape={shape} data-tone={tone}>
      {photo ? (
        <Image src={photo.src} alt={photo.alt} fill sizes={sizes} />
      ) : (
        <div className="ons-photo-art" aria-hidden="true">
          <span className="ons-photo-sun" />
          <OliveBranch />
        </div>
      )}
      {caption && <figcaption className="ons-photo-caption">{caption}</figcaption>}
    </figure>
  );
}
