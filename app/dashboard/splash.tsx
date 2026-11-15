import type { Branding } from "@/lib/branding";

// Full-screen welcome overlay. It is pure CSS (see .splash in globals.css): it
// fades in, the name pulses gently, and after about 2.6 seconds it fades out
// by itself. Because it lives in the layout's HTML, it plays on every full page
// load or refresh. No JavaScript or storage is involved, so it can't "remember"
// that it was already shown.
export function Splash({ branding }: { branding: Branding }) {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-glow" />
      <div className="splash-content">
        <h1 className="splash-name font-serif">{branding.name}</h1>
        {branding.tagline && <p className="splash-tagline">{branding.tagline}</p>}
        {branding.parentGroupName && <p className="splash-by">by {branding.parentGroupName}</p>}
      </div>
    </div>
  );
}
