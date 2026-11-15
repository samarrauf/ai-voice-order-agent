import { MessageCircle, Phone } from "lucide-react";
import { phoneHref, site, whatsappHref } from "@/data/sites/olive-n-spice/config";

// The "Call" and "WhatsApp" buttons, used on Home, Events and Reserve.
// They read the numbers from config.ts. While a number is still `null`
// the button is shown as "coming soon" and cannot be pressed, so nobody
// is ever sent to a made-up number.

type Props = {
  /** Text placed in the WhatsApp message box for the guest, e.g. "I would like to reserve a table." */
  whatsappMessage?: string;
  className?: string;
};

export function ContactActions({ whatsappMessage, className }: Props) {
  const tel = phoneHref();
  const whatsapp = whatsappHref(whatsappMessage);

  return (
    <div className={className ? `ons-contact-actions ${className}` : "ons-contact-actions"}>
      {tel ? (
        <a href={tel} className="ons-btn ons-btn-gold">
          <Phone size={16} aria-hidden />
          Call {site.contact.phone?.display}
        </a>
      ) : (
        <span className="ons-btn" aria-disabled="true">
          <Phone size={16} aria-hidden />
          Call · coming soon
        </span>
      )}
      {whatsapp ? (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="ons-btn ons-btn-ghost">
          <MessageCircle size={16} aria-hidden />
          WhatsApp us
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : (
        <span className="ons-btn" aria-disabled="true">
          <MessageCircle size={16} aria-hidden />
          WhatsApp · coming soon
        </span>
      )}
    </div>
  );
}

/** True when there is at least one way to reach the restaurant directly. */
export const hasDirectContact = Boolean(site.contact.phone || site.contact.whatsapp);
