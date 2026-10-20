import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { SectionHeading } from "@/components/ui";
import { cn } from "@/utils/cn";

export function FaqAccordion({
  items,
  title = "Frequently asked questions",
  description,
}: {
  items: Array<{ q: string; a: string }>;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="page py-14 sm:py-16">
      <SectionHeading eyebrow="Support" title={title} description={description} />
      <div className="mt-7 grid gap-2.5 lg:grid-cols-2">
        {items.map((item, index) => {
          const expanded = open === index;
          return (
            <div
              key={item.q}
              className={cn(
                "overflow-hidden rounded-[var(--radius-card)] border bg-paper transition",
                expanded ? "border-gold/50 shadow-[var(--shadow-card)]" : "border-line",
              )}
            >
              <h3>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : index)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="font-display text-[15px] leading-snug text-ink">{item.q}</span>
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border transition",
                      expanded
                        ? "border-gold bg-gold-soft text-gold-deep"
                        : "border-line-strong text-muted",
                    )}
                  >
                    {expanded ? (
                      <Minus className="size-3.5" aria-hidden />
                    ) : (
                      <Plus className="size-3.5" aria-hidden />
                    )}
                  </span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className="border-t border-line bg-ivory/50 px-4 py-3.5 text-[13px] leading-relaxed text-muted">
                      {item.a}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
