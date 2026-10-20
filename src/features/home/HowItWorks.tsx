import { motion } from "framer-motion";
import {
  BadgeIndianRupee,
  ClipboardCheck,
  QrCode,
  Smartphone,
  Ticket,
  Trophy,
} from "lucide-react";
import { SectionHeading } from "@/components/ui";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

const STEPS = [
  {
    icon: Smartphone,
    title: "Register with your mobile",
    body: "Verify your 10-digit Indian mobile number with a one-time password. Your profile and referral code are created automatically.",
  },
  {
    icon: QrCode,
    title: "Add money using the payment QR",
    body: "Pay the displayed UPI QR from any UPI app, upload the payment screenshot and enter the UTR reference.",
  },
  {
    icon: ClipboardCheck,
    title: "Wait for payment verification",
    body: "An administrator matches your payment against the banking records and credits your wallet exactly once.",
  },
  {
    icon: Ticket,
    title: "Purchase your tickets",
    body: "Pick the ticket numbers you want in an open draw. The price is debited from your wallet in a single transaction.",
  },
  {
    icon: BadgeIndianRupee,
    title: "View your ticket numbers",
    body: "Confirmed tickets appear instantly in My Tickets with the draw date and order reference.",
  },
  {
    icon: Trophy,
    title: "Follow the published results",
    body: "Winners appear on the Winners page only after an authorised administrator completes and publishes the draw.",
  },
];

/** Six-step explanation of the customer journey. */
export function HowItWorks() {
  const reduced = usePrefersReducedMotion();
  return (
    <section className="page py-14 sm:py-16">
      <SectionHeading
        eyebrow="How it works"
        title="From mobile number to published results"
        description="A short, transparent journey. Nothing is confirmed until the backend transaction completes."
      />
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <motion.li
            key={step.title}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-[var(--radius-card)] border border-line bg-paper p-4 shadow-[var(--shadow-card)]"
          >
            <span className="absolute -top-3 left-4 grid size-7 place-items-center rounded-full bg-brand font-display text-[13px] font-bold text-ivory shadow-[var(--shadow-gold)]">
              {index + 1}
            </span>
            <span className="mt-2 grid size-10 place-items-center rounded-xl bg-ivory text-brand">
              <step.icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-3 font-display text-[16px] text-ink">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{step.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
