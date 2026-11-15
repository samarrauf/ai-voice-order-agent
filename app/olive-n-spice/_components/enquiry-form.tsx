"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { site } from "@/data/sites/olive-n-spice/config";
import { ContactActions, hasDirectContact } from "./contact-actions";

// The event enquiry form. IMPORTANT: for now it is only the "shell" of a
// form. Pressing Submit does NOT send or save anything anywhere. It shows
// a clear message that online enquiries have not started yet and points
// the guest to phone / WhatsApp (from config.ts) instead.
//
// When a real enquiry system is added later, replace the body of
// `handleSubmit` with the call that sends the form.

export function EnquiryForm() {
  const id = useId();
  const [submitted, setSubmitted] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const { facebook, instagram } = site.social;

  // Move keyboard / screen-reader focus to the message so it is not missed.
  useEffect(() => {
    if (submitted) noticeRef.current?.focus();
  }, [submitted]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // nothing leaves the browser
    setSubmitted(true);
  };

  return (
    <form className="ons-form" onSubmit={handleSubmit} noValidate aria-describedby={`${id}-hint`}>
      <p id={`${id}-hint`} className="ons-form-hint">
        Online enquiries are opening soon. This form does not send anything yet.
      </p>

      <div className="ons-form-row">
        <div className="ons-field">
          <label htmlFor={`${id}-name`}>Your name</label>
          <input id={`${id}-name`} name="name" type="text" autoComplete="name" className="ons-input" />
        </div>
        <div className="ons-field">
          <label htmlFor={`${id}-phone`}>Phone number</label>
          <input id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" className="ons-input" />
        </div>
      </div>

      <div className="ons-field">
        <label htmlFor={`${id}-type`}>Type of event</label>
        <select id={`${id}-type`} name="eventType" className="ons-input" defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {site.content.events.occasions.map((occasion) => (
            <option key={occasion} value={occasion}>
              {occasion}
            </option>
          ))}
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="ons-form-row">
        <div className="ons-field">
          <label htmlFor={`${id}-date`}>Date</label>
          <input id={`${id}-date`} name="date" type="date" className="ons-input" />
        </div>
        <div className="ons-field">
          <label htmlFor={`${id}-guests`}>Number of guests</label>
          <input id={`${id}-guests`} name="guests" type="number" inputMode="numeric" min={1} className="ons-input" />
        </div>
      </div>

      <div className="ons-field">
        <label htmlFor={`${id}-message`}>Message</label>
        <textarea id={`${id}-message`} name="message" rows={4} className="ons-input" />
      </div>

      <button type="submit" className="ons-btn ons-btn-olive w-full sm:w-auto sm:justify-self-start">
        Submit enquiry
      </button>

      {submitted && (
        <div ref={noticeRef} tabIndex={-1} role="status" className="ons-notice">
          <p className="ons-notice-title">Online enquiries have not started yet.</p>
          <p>
            Your details were <strong>not sent</strong>. To plan your event, please contact us by phone or WhatsApp.
          </p>
          <ContactActions whatsappMessage={`Hello ${site.name}, I would like to ask about hosting an event.`} className="ons-notice-actions" />
          {!hasDirectContact && (
            <p>
              Our phone and WhatsApp numbers will be listed here shortly. Until then you can message us on{" "}
              {facebook && (
                <a href={facebook.url} target="_blank" rel="noopener noreferrer" className="ons-inline-link">
                  Facebook <ArrowUpRight size={13} aria-hidden />
                </a>
              )}
              {facebook && instagram && " or "}
              {instagram && (
                <a href={instagram.url} target="_blank" rel="noopener noreferrer" className="ons-inline-link">
                  Instagram <ArrowUpRight size={13} aria-hidden />
                </a>
              )}
              .
            </p>
          )}
        </div>
      )}
    </form>
  );
}
