import { motion } from "framer-motion";
import { ArrowRight, MessageCircle, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card } from "@/components/ui";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

/** Referral programme explainer with a single clear call to action. */
export function ReferralBanner({ spinsPerReferral }: { spinsPerReferral: number }) {
  const reduced = usePrefersReducedMotion();
  const benefits = [
    {
      icon: Users,
      title: "Share your unique link",
      body: "Every account gets a referral code and a shareable link — one tap to send it on WhatsApp.",
    },
    {
      icon: MessageCircle,
      title: "They sign up with your code",
      body: "Attribution is preserved during registration and verified through mobile OTP.",
    },
    {
      icon: ArrowRight,
      title: "You earn when they qualify",
      body: "A genuinely new, eligible participant completing signup under the published rules unlocks your reward.",
    },
  ];

  return (
    <section className="relative isolate overflow-hidden border-y border-line bg-maroon text-ivory">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-20" aria-hidden />
      <div className="page relative py-14 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <motion.div
            initial={reduced ? false : { opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-soft">
              Referral rewards
            </p>
            <h2 className="mt-2.5 font-display text-[28px] leading-tight text-ivory sm:text-[36px]">
              Bring a friend. Earn a free spin.
            </h2>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ivory/75">
              Qualified referrals currently award{" "}
              <span className="font-semibold text-gold-soft">
                {spinsPerReferral} free spin{spinsPerReferral === 1 ? "" : "s"}
              </span>{" "}
              to the referring account. Self-referrals, duplicate accounts and link opens alone never
              count.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/register">
                <Button size="lg" variant="gold" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Get my referral link
                </Button>
              </Link>
              <Link to="/dashboard/referrals">
                <Button
                  size="lg"
                  variant="ghost"
                  className="border border-ivory/30 text-ivory hover:bg-ivory/10"
                >
                  See how rewards work
                </Button>
              </Link>
            </div>
          </motion.div>

          <div className="grid gap-3">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={reduced ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card className="flex items-start gap-3.5 bg-ivory/95 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                    <benefit.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-display text-[16px] text-ink">
                      {benefit.title}                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{benefit.body}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
