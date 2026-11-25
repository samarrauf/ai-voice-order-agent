"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// The Print / Close buttons, and the automatic print dialog when the page opens.
// The buttons are hidden on paper (class "no-print").
// `extra`: more toolbar buttons (B4d WhatsApp thank-you). Inside the toolbar, so never on paper.
export function PrintControls({ otherSize, extra }: { otherSize?: { label: string; href: string }; extra?: ReactNode }) {
  const done = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (done.current) return; // React dev mode runs effects twice; open the dialog once
    done.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  function close() {
    // window.close() only works for a tab the app opened itself; otherwise go back to the dashboard.
    window.close();
    setTimeout(() => {
      router.push("/dashboard");
    }, 200);
  }

  return (
    <div className="print-toolbar no-print">
      <button type="button" className="print-btn print-btn-primary" onClick={() => window.print()}>
        Print
      </button>
      {otherSize && (
        <a className="print-btn" href={otherSize.href}>
          {otherSize.label}
        </a>
      )}
      {extra}
      <button type="button" className="print-btn" onClick={close}>
        Close
      </button>
    </div>
  );
}
