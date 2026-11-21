// Lite mode: turns off blur (backdrop-filter) and animations so the dashboard
// stays fast on weak tablets and old phones. Pure module (the decision is a
// function so it can be tested); the browser side lives in the avatar menu.
//
// The user's own choice always wins. With no choice yet, Lite is ON when the
// device looks weak (4 or fewer cores) or asks for reduced motion.

export const LITE_STORAGE_KEY = "dash-lite";
export const WEAK_DEVICE_CORES = 4;

export type LiteInputs = {
  /** "1" / "0" from localStorage, or null if never chosen (or storage unavailable). */
  stored: string | null;
  /** navigator.hardwareConcurrency (may be missing). */
  cores: number | undefined;
  prefersReducedMotion: boolean;
};

export function decideLite({ stored, cores, prefersReducedMotion }: LiteInputs): boolean {
  if (stored === "1") return true;
  if (stored === "0") return false;
  if (prefersReducedMotion) return true;
  return typeof cores === "number" && cores > 0 && cores <= WEAK_DEVICE_CORES;
}

/**
 * Tiny script that runs before the first paint (inlined in <head> via the dashboard
 * layout) so there is no flash. It repeats decideLite()'s rule on purpose: it must
 * work without any bundle. Keep both in sync (tests/lite-mode.pure.test.ts runs it).
 */
export const LITE_INIT_SCRIPT = `(function(){try{var s=null;try{s=localStorage.getItem("${LITE_STORAGE_KEY}")}catch(e){}var lite;if(s==="1")lite=true;else if(s==="0")lite=false;else{var m=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;var c=navigator.hardwareConcurrency;lite=!!m||(typeof c==="number"&&c>0&&c<=${WEAK_DEVICE_CORES})}if(lite)document.documentElement.setAttribute("data-lite","1")}catch(e){}})();`;
