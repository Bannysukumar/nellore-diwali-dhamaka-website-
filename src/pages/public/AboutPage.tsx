import { BadgeCheck, CalendarClock, Eye, Layers, ShieldCheck, Ticket } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings, useSupportContact } from "@/app/SettingsProvider";
import { Badge, Button, Card, CardBody, CardHeader, SectionHeading } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { FAQS } from "@/services/contentService";
import { FaqAccordion } from "@/features/home/FaqAccordion";

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Money is server-authoritative",
    body: "Wallet balances live in an append-only ledger. The browser can request a payment, but only backend processes may credit or debit an account.",
  },
  {
    icon: Eye,
    title: "Nothing is fabricated",
    body: "Every availability figure, deposit status and published winner you see is read from the dataset. There are no placeholder payments and no invented winners.",
  },
  {
    icon: CalendarClock,
    title: "Schedules are published up front",
    body: "Sales windows, draw times, prize tiers and quantities are configured before sales open and are visible to everyone — visitors included.",
  },
  {
    icon: BadgeCheck,
    title: "Results need a human",
    body: "A draw is executed and then separately published by an authorised administrator. Nothing appears on the winners page automatically.",
  },
];

export function AboutPage() {
  const settings = useSiteSettings();
  const support = useSupportContact();

  return (
    <>
      <PageHeader
        tone="festival"
        eyebrow="About the event"
        icon={Layers}
        title="A festival draw platform built for Nellore"
        description="Nellore Diwali Dhamaka brings ticket booking, a ledger-backed wallet, referral rewards and published festival draws together in one place — with the honest limitations stated openly."
        crumbs={[{ label: "Home", to: "/" }, { label: "About" }]}
        actions={
          <Link to="/draws">
            <Button variant="gold">Browse the draws</Button>
          </Link>
        }
      />

      <div className="page grid gap-6 py-8 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader icon={Ticket} title="What this platform is" />
          <CardBody className="space-y-4 text-[14px] leading-relaxed text-muted">
            <p>
              {settings.brandName} is a ticketing and rewards platform for festival draws. Each draw
              publishes a fixed range of unique ticket numbers, a ticket price, a sales window, a
              draw time and its prize tiers. Participants browse availability for free, register
              with a verified mobile number, add money to their wallet through a reviewed UPI
              deposit and then reserve the specific numbers they want.
            </p>
            <p>
              Wallet credit happens only after an administrator matches your payment against the
              operator's banking records. A purchase is confirmed in a single backend transaction
              that marks the numbers as booked and debits the exact amount — there is no separate
              "pending payment" state that can silently succeed later.
            </p>
            <p>
              Results become visible on the Winners page only after an authorised administrator
              completes a draw and then separately publishes it. Ticket numbers shown to the public
              and names shown in announcements are partially masked.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">Integer paise ledger</Badge>
              <Badge tone="emerald">Paginated ticket grid</Badge>
              <Badge tone="gold">Published prize tiers</Badge>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Current operating status" />
            <CardBody className="space-y-3 text-[13px] leading-relaxed text-muted">
              <p className="flex items-center gap-2">
                <span
                  className={`size-2.5 rounded-full ${settings.allowPaidDraws ? "bg-emerald" : "bg-status-pending"}`}
                  aria-hidden
                />
                Paid draws are{" "}
                <strong className="text-ink">{settings.allowPaidDraws ? "enabled" : "disabled"}</strong>
                .
              </p>
              <p>{settings.legalDisclaimer}</p>
              <p>
                Participation is restricted to adults aged {settings.minAge}+. Prize odds are never
                presented as a promise of winnings and no monetary return is implied.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Talk to the organisers" />
            <CardBody className="space-y-2.5">
              {support.phone && support.phoneHref ? (
                <a
                  href={support.phoneHref}
                  className="block rounded-xl border border-line bg-ivory/60 p-3.5 text-[13px] transition hover:border-gold"
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Phone
                  </span>
                  <span className="font-semibold text-ink">{support.phone}</span>
                </a>
              ) : null}
              {support.whatsappUrl ? (
                <a
                  href={support.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-line bg-ivory/60 p-3.5 text-[13px] transition hover:border-gold"
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    WhatsApp
                  </span>
                  <span className="font-semibold text-ink">Message the support desk</span>
                </a>
              ) : null}
              <Link to="/contact">
                <Button block variant="outline">
                  Contact &amp; support page
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>

      <section className="border-y border-line bg-ivory/60 py-12">
        <div className="page">
          <SectionHeading
            eyebrow="How we operate"
            title="Principles this build commits to"
            description="These are structural rules of the software, not marketing claims — each one is enforced by how the data layer is written."
          />
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((item) => (
              <Card key={item.title} className="p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3.5 font-display text-[17px]">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{item.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <div className="pt-10" />

      <FaqAccordion
        items={FAQS}
        description="The most common questions about registration, deposits, tickets, referrals and results."
      />
    </>
  );
}
