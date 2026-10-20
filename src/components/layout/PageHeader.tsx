import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

export interface Crumb {
  label: string;
  to?: string;
}

/** Consistent page banner: breadcrumb, title, description and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs,
  actions,
  icon: Icon,
  tone = "ivory",
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  icon?: LucideIcon;
  tone?: "ivory" | "festival";
  children?: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <section
      className={cn(
        "border-b",
        tone === "festival"
          ? "gradient-hero border-maroon-deep text-ivory"
          : "border-line bg-paper",
      )}
    >
      <div className="page py-6 sm:py-9">
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-1 text-[12px]">
              {crumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {crumb.to ? (
                    <>
                      <Link
                        to={crumb.to}
                        className={cn(
                          "transition",
                          tone === "festival"
                            ? "text-ivory/70 hover:text-gold-soft"
                            : "text-muted hover:text-ink",
                        )}
                      >
                        {crumb.label}
                      </Link>
                      <ChevronRight
                        className={cn(
                          "size-3.5",
                          tone === "festival" ? "text-ivory/40" : "text-line-strong",
                        )}
                        aria-hidden
                      />
                    </>
                  ) : (
                    <span className={tone === "festival" ? "text-gold-soft" : "text-muted"}>
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl"
          >
            {eyebrow ? (
              <p
                className={cn(
                  "mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em]",
                  tone === "festival" ? "text-gold-soft" : "text-brand",
                )}
              >
                {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={cn(
                "font-display text-[26px] leading-tight sm:text-[34px]",
                tone === "festival" ? "text-ivory" : "text-ink",
              )}
            >
              {title}
            </h1>
            {description ? (
              <p
                className={cn(
                  "mt-2.5 max-w-2xl text-[14px] leading-relaxed",
                  tone === "festival" ? "text-ivory/80" : "text-muted",
                )}
              >
                {description}
              </p>
            ) : null}
            {children}
          </motion.div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
