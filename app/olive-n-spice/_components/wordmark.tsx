import Image from "next/image";
import { site } from "@/data/sites/olive-n-spice/config";

// The logo. Until the real logo file arrives this is a TEXT wordmark:
//   OLIVE 'n SPICE
//   THE ART OF FINE DINING
//   by Golden Palm
// To use the real logo: put the file in public/brand/olive-n-spice/ and set
// `brand.logoSrc` in data/sites/olive-n-spice/config.ts. Nothing else changes.

type Props = {
  /** "md" for the header, "lg" for the intro and footer. */
  size?: "md" | "lg";
  showTagline?: boolean;
  /** Adds the small "by Golden Palm" line. */
  showGroup?: boolean;
  className?: string;
};

export function Wordmark({ size = "md", showTagline = true, showGroup = false, className }: Props) {
  const classes = className ? `ons-wordmark ${className}` : "ons-wordmark";

  if (site.brand.logoSrc) {
    return (
      <span className={classes} data-size={size}>
        <Image
          src={site.brand.logoSrc}
          alt={site.name}
          width={site.brand.logoWidth}
          height={site.brand.logoHeight}
          className="ons-wordmark-logo"
          priority
        />
        {showGroup && <span className="ons-wordmark-by">by {site.parentGroup}</span>}
      </span>
    );
  }

  // "Olive 'n Spice" -> OLIVE + 'n + SPICE (the 'n is set in italics).
  const parts = site.name.split(/\s+['’]n\s+/i);
  return (
    <span className={classes} data-size={size}>
      <span className="ons-wordmark-name">
        {parts.length === 2 ? (
          <>
            {parts[0].toUpperCase()}
            {" "}
            <span className="ons-wordmark-n">’n</span>{" "}
            {parts[1].toUpperCase()}
          </>
        ) : (
          site.name.toUpperCase()
        )}
      </span>
      {showTagline && <span className="ons-wordmark-tag">{site.tagline}</span>}
      {showGroup && <span className="ons-wordmark-by">by {site.parentGroup}</span>}
    </span>
  );
}
