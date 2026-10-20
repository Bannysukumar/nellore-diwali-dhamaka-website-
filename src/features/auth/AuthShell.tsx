import type { LucideIcon } from "lucide-react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Shared frame for the sign-in and registration screens: a festive brand
 * panel beside a focused form card on desktop, a compact banner above the
 * card on phones.
 */
export function AuthShell({
  icon: Icon,
  eyebrow,
  title,
  description,
  points,
  crumb,
  children,
  aside,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  points: string[];
  crumb: string;
  /** The form card. */
  children: ReactNode;
  /** Extra notes shown under the points on desktop and under the card on phones. */
  aside?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden gradient-hero text-ivory">
      <div
        className="pattern-rangoli pointer-events-none absolute inset-0 opacity-25"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-gold/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 size-[380px] rounded-full bg-saffron/10 blur-3xl"
        aria-hidden
      />

      <div className="page relative grid items-center gap-8 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-16 lg:py-16">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex items-center gap-1 text-[12px] text-ivory/70">
              <li>
                <Link to="/" className="transition hover:text-gold-soft">
                  Home
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="size-3.5 text-ivory/40" />
              </li>
              <li className="text-gold-soft">{crumb}</li>
            </ol>
          </nav>

          <p className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-soft">
            <Icon className="size-3.5" aria-hidden />
            {eyebrow}
          </p>
          <h1 className="mt-4 font-display text-[30px] leading-[1.08] tracking-[-0.01em] sm:text-[42px] lg:text-[52px]">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ivory/80 sm:text-[16px]">
            {description}
          </p>

          <ul className="mt-7 hidden max-w-xl gap-3 sm:grid sm:grid-cols-2">
            {points.map((point) => (
              <li
                key={point}
                className="flex items-start gap-2.5 rounded-2xl border border-ivory/15 bg-ivory/10 p-3 text-[13.5px] leading-snug text-ivory/90 backdrop-blur-sm"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-gold"
                  aria-hidden
                />
                {point}
              </li>
            ))}
          </ul>

          {aside ? (
            <div className="mt-6 hidden max-w-xl space-y-3 lg:block">
              {aside}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 text-ink">
          {children}
          {aside ? (
            <div className="mt-4 space-y-3 lg:hidden">{aside}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
