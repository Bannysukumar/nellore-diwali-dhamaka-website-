import { useMemo, useState } from "react";
import { HelpCircle, Search, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { FAQS } from "@/services/contentService";
import { useSupportContact } from "@/app/SettingsProvider";
import { Alert, Button, Card, CardBody, EmptyState, Input } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { FaqAccordion } from "@/features/home/FaqAccordion";

export function FaqsPage() {
  const support = useSupportContact();
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <>
      <PageHeader
        eyebrow="Help centre"
        icon={HelpCircle}
        title="Frequently asked questions"
        description="Straight answers about registration, deposits, tickets, referrals, the spin wheel and how results get published."
        crumbs={[{ label: "Home", to: "/" }, { label: "FAQs" }]}
        actions={
          <Link to="/contact">
            <Button variant="outline" iconLeft={<MessageCircle className="size-4" aria-hidden />}>
              Contact support
            </Button>
          </Link>
        }
      />

      <div className="page pt-8">
        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search questions, e.g. deposit, OTP, refund"
            className="pl-9"
            aria-label="Search frequently asked questions"
          />
        </div>

        <p className="mt-3 text-[12px] text-muted">
          {items.length} of {FAQS.length} questions shown
        </p>
      </div>

      {items.length ? (
        <FaqAccordion
          items={items}
          title={query.trim() ? "Matching questions" : "Everything you asked"}
          description={
            query.trim()
              ? undefined
              : "Answers reflect how the platform actually behaves — not aspirational copy."
          }
        />
      ) : (
        <div className="page py-10">
          <EmptyState
            title="No question matches that search"
            description="Try a shorter keyword, or ask the support desk directly."
            action={
              <Link to="/contact">
                <Button>Contact support</Button>
              </Link>
            }
          />
        </div>
      )}

      <div className="page pb-14">
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-[18px]">Still stuck?</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {support.phone ? `Call ${support.phone} or use the contact page.` : "Use the contact page to reach the support desk."} Support never asks for your OTP,
                password or UPI PIN.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {support.whatsappUrl ? (
                <a href={support.whatsappUrl} target="_blank" rel="noreferrer">
                  <Button variant="success" iconLeft={<MessageCircle className="size-4" aria-hidden />}>
                    WhatsApp
                  </Button>
                </a>
              ) : null}
              <Link to="/contact">
                <Button variant="outline">All contact options</Button>
              </Link>
            </div>
          </CardBody>
        </Card>

        <Alert tone="info" title="Compliance note" className="mt-4">
          Paid, chance-based draws remain disabled until the operator completes its legal and
          compliance review. FAQ answers never promise a win, an odds figure or a monetary return.
        </Alert>
      </div>
    </>
  );
}
