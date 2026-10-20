import { useState, type FormEvent } from "react";
import { Mail, MessageCircle, Phone, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings, useSupportContact } from "@/app/SettingsProvider";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * Support contact page. No message is stored or "sent" by this page — the
 * form composes a mail draft in the visitor's own mail client, which keeps the
 * page honest about what actually happens.
 */
export function ContactPage() {
  const settings = useSiteSettings();
  const support = useSupportContact();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);

  const buildMailto = (event: FormEvent) => {
    event.preventDefault();
    if (subject.trim().length < 3 || message.trim().length < 10) {
      setError("Add a short subject and at least a couple of lines describing your question.");
      return;
    }
    setError(null);
    if (!support.email) return;
    const url = `mailto:${support.email}?subject=${encodeURIComponent(
      `[${settings.brandName}] ${subject.trim()}`,
    )}&body=${encodeURIComponent(`${message.trim()}\n\n—\nSent from the contact page`)}`;
    window.location.href = url;
    setPrepared(true);
  };

  const supportItems = [
    support.phone && support.phoneHref
      ? {
          icon: Phone,
          label: "Call support",
          value: support.phone,
          href: support.phoneHref,
          hint: "Fastest for payment and deposit issues.",
        }
      : null,
    support.whatsappUrl
      ? {
          icon: MessageCircle,
          label: "WhatsApp",
          value: "Chat with the support desk",
          href: support.whatsappUrl,
          hint: "Never share your OTP or bank password here.",
        }
      : null,
    support.email
      ? {
          icon: Mail,
          label: "Email",
          value: support.email,
          href: `mailto:${support.email}`,
          hint: "Best for document or account disputes.",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        icon={Phone}
        title="Talk to the festival support desk"
        description="Payment issues, deposit status, ticket problems and account questions all reach a human here. Support will never ask for your OTP."
        crumbs={[{ label: "Home", to: "/" }, { label: "Contact" }]}
      />

      <div className="page grid gap-6 py-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Reach us directly" description="Details below come from the live site settings." />
            <CardBody className="grid gap-3">
              {!supportItems.length ? (
                <EmptyState title="Support contacts have not been published yet" description="The organiser has not configured a support phone or email. Please check back shortly." />
              ) : null}
              {supportItems.map((item) => {
                const body = (
                  <span className="flex items-start gap-3 rounded-xl border border-line bg-ivory/60 p-4 transition hover:border-gold">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                      <item.icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        {item.label}
                      </span>
                      <span className="block break-words text-[14px] font-semibold text-ink">
                        {item.value}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                        {item.hint}
                      </span>
                    </span>
                  </span>
                );
                return item.href ? (
                  <a
                    key={item.label}
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                  >
                    {body}
                  </a>
                ) : (
                  <div key={item.label}>{body}</div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Before you write" />
            <CardBody className="space-y-2.5 text-[13px] leading-relaxed text-muted">
              <p>
                • Have your order ID, deposit ID or UTR reference ready — it is the fastest way to
                locate a request.
              </p>
              <p>
                • Deposits are credited only after verification, so a wallet update can take time
                even after a successful payment.
              </p>
              <p>
                • Results appear on the{" "}
                <Link to="/winners" className="font-semibold text-brand hover:underline">
                  winners page
                </Link>{" "}
                only after they are formally published.
              </p>
              <p>
                Need a quick answer first?{" "}
                <Link to="/faqs" className="font-semibold text-brand hover:underline">
                  Read the FAQs
                </Link>
                .
              </p>
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader
            icon={Send}
            title="Write to us"
            description="This form prepares an email in your own mail app. Nothing is submitted or stored by this website."
          />
          <CardBody>
            <form className="space-y-4" onSubmit={buildMailto} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="contact-subject" required>
                  Subject
                </Label>
                <Input
                  id="contact-subject"
                  placeholder="e.g. Deposit dep_1234 not credited"
                  value={subject}
                  invalid={Boolean(error)}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-message" required hint="Include your IDs">
                  Message
                </Label>
                <Textarea
                  id="contact-message"
                  rows={7}
                  placeholder={
                    "Describe the issue, mention the order/deposit reference and the date involved."
                  }
                  value={message}
                  invalid={Boolean(error)}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </div>

              {error ? (
                <Alert tone="danger" title="Check the message">
                  {error}
                </Alert>
              ) : null}

              {prepared ? (
                <Alert tone="success" title="Your mail app should have opened">
                  If nothing opened, email us directly at{" "}
                  <strong>{support.email}</strong>.
                </Alert>
              ) : null}

              <Button type="submit" block disabled={!support.email} iconLeft={<Mail className="size-4" aria-hidden />}>
                Open email draft
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
