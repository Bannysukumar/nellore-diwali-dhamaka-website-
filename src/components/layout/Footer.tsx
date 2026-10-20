import { Mail, MessageCircle, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings, useSupportContact } from "@/app/SettingsProvider";
import { DiyaMark } from "@/components/brand/Logo";

const QUICK_LINKS = [
  { to: "/draws", label: "Upcoming draws" },
  { to: "/book", label: "Book tickets" },
  { to: "/winners", label: "Winners" },
  { to: "/faqs", label: "FAQs" },
  { to: "/about", label: "About the event" },
  { to: "/contact", label: "Contact & support" },
];

const POLICY_LINKS = [
  { to: "/legal/terms", label: "Terms & conditions" },
  { to: "/legal/privacy", label: "Privacy policy" },
  { to: "/legal/refund", label: "Payment & refund policy" },
  { to: "/legal/eligibility", label: "Eligibility & responsible participation" },
];

export function Footer() {
  const settings = useSiteSettings();
  const support = useSupportContact();
  return (
    <footer className="mt-16 border-t border-line bg-maroon text-ivory">
      <div className="page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <DiyaMark className="size-9" />
            <div>
              <p className="font-display text-[17px] leading-tight font-bold text-ivory">
                {settings.brandName}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-soft">
                Nellore Festival Draws
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ivory/75">{settings.tagline}</p>
          <p className="mt-4 text-[12px] text-ivory/60">{settings.legalDisclaimer}</p>
        </div>

        <nav aria-label="Quick links">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-soft">Explore</h3>
          <ul className="mt-3 space-y-2">
            {QUICK_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-[13.5px] text-ivory/80 transition hover:text-gold-soft"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Policies">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-soft">
            Policies
          </h3>
          <ul className="mt-3 space-y-2">
            {POLICY_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-[13.5px] text-ivory/80 transition hover:text-gold-soft"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-soft">
            Support
          </h3>
          <ul className="mt-3 space-y-2.5 text-[13.5px] text-ivory/80">
            {support.phone && support.phoneHref ? (
              <li className="flex items-center gap-2">
                <Phone className="size-4 text-gold-soft" aria-hidden />
                <a href={support.phoneHref} className="hover:text-gold-soft">
                  {support.phone}
                </a>
              </li>
            ) : null}
            {support.email ? (
              <li className="flex items-center gap-2">
                <Mail className="size-4 text-gold-soft" aria-hidden />
                <a href={`mailto:${support.email}`} className="break-all hover:text-gold-soft">
                  {support.email}
                </a>
              </li>
            ) : null}
            {support.whatsappUrl ? (
              <li>
                <a
                  href={support.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-gold/50 px-3 py-2 font-semibold text-gold-soft transition hover:bg-gold/10"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Chat on WhatsApp
                </a>
              </li>
            ) : null}
            {!support.phone && !support.email ? (
              <li>
                <Link to="/contact" className="hover:text-gold-soft">
                  Contact details
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-ivory/15">
        <div className="page flex flex-col gap-2 py-4 text-[12px] text-ivory/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {settings.brandName}. All rights reserved.
          </p>
          <p>
            Participation restricted to adults aged {settings.minAge}+. Play responsibly.
          </p>
        </div>
      </div>
    </footer>
  );
}
