import { Briefcase, Cake, Flower2, Heart, Sparkles } from "lucide-react";
import { site } from "@/data/sites/olive-n-spice/config";

// The kinds of events the restaurant hosts, as a small grid of labelled
// icons. The list itself comes from config.ts (content.events.occasions).

const ICONS = [Briefcase, Cake, Flower2, Heart];

export function Occasions({ className }: { className?: string }) {
  return (
    <ul className={className ? `ons-occasions ${className}` : "ons-occasions"}>
      {site.content.events.occasions.map((occasion, i) => {
        const Icon = ICONS[i] ?? Sparkles;
        return (
          <li key={occasion} className="ons-occasion">
            <span className="ons-occasion-icon" aria-hidden="true">
              <Icon size={20} strokeWidth={1.4} />
            </span>
            {occasion}
          </li>
        );
      })}
    </ul>
  );
}
