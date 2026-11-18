import "./print.css";

// Wraps every print page. The "print-root" class is what print.css looks for
// to hide the dashboard header, splash and bottom bar on these pages.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-root">{children}</div>;
}
