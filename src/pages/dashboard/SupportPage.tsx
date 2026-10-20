import { useState } from "react";
import { LifeBuoy, Mail, MessageCircle, ShieldCheck, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useSupportContact } from "@/app/SettingsProvider";
import { CONTACT_TOPICS } from "@/services/contactTopics";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormRow,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * Support is deliberately honest: this page composes an email draft in the
 * user's own mail client rather than pretending to submit and store a message.
 */
export function SupportPage() {
  const { profile } = useAuth();
  const support = useSupportContact();

  const [topic, setTopic] = useState<string>(CONTACT_TOPICS[0]);
  const [subject, setSubject] = useState("");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");

  const supportEmail = support.email;

  const mailto = () => {
    const body = [
      `Name: ${profile?.fullName ?? ""}`,
      `Phone: ${profile?.phoneMasked ?? ""}`,
      `Account: ${profile?.uid ?? ""}`,
      reference ? `Reference ID: ${reference}` : null,
      "",
      message,
    ]
      .filter(Boolean)
      .join("\n");
    const params = new URLSearchParams({
      subject: subject || `[${topic}] Support request`,
      body,
    });
    return supportEmail ? `mailto:${supportEmail}?${params.toString()}` : undefined;
  };

  return (
    <>
      <PageHeader
        eyebrow="Support"
        icon={LifeBuoy}
        title="Get help with your account"
        description="Raise a request about a deposit, a ticket purchase, a draw or a reward. Include your reference ID so we can find it quickly."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Support" },
        ]}
        actions={
          support.whatsappUrl ? (
            <a href={support.whatsappUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="gold" iconLeft={<MessageCircle className="size-4" aria-hidden />}>
              WhatsApp support
            </Button>
          </a>
          ) : undefined
        }
      />

      <div className="page mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            icon={Mail}
            title="Compose a support request"
            description="This opens your own mail app with the details filled in — nothing is sent or stored from here."
          />
          <CardBody className="space-y-4">
            <FormRow>
              <div>
                <Label htmlFor="support-topic" required>
                  What is this about?
                </Label>
                <Select id="support-topic" value={topic} onChange={(event) => setTopic(event.target.value)}>
                  {CONTACT_TOPICS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="support-subject" required>
                  Subject
                </Label>
                <Input
                  id="support-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Short summary"
                />
              </div>
            </FormRow>

            <div>
              <Label htmlFor="support-ref" hint="Optional">
                Reference ID (order, deposit or ticket)
              </Label>
              <Input
                id="support-ref"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. dep_… or ord_…"
                className="font-mono text-[12.5px]"
              />
            </div>

            <div>
              <Label htmlFor="support-message" required>
                Your message
              </Label>
              <Textarea
                id="support-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Describe the issue, what you expected and what happened. Do not include your OTP, UPI PIN or bank password."
                className="min-h-40"
              />
            </div>

            <Alert tone="info" title="Keep this out of support requests">
              Never share your one-time password, UPI PIN, bank password or a screenshot showing those.
              Support will never ask for them.
            </Alert>

            <div className="flex flex-wrap gap-2">
              <a href={message.trim() ? mailto() : undefined} aria-disabled={!message.trim() || !supportEmail}>
                <Button disabled={!message.trim() || !supportEmail} iconLeft={<Mail className="size-4" aria-hidden />}>
                  Open email draft
                </Button>
              </a>
              {support.whatsappUrl ? (
                <a href={support.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" iconLeft={<MessageCircle className="size-4" aria-hidden />}>
                  Chat on WhatsApp
                </Button>
                </a>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Contact details" />
            <CardBody className="space-y-3 text-[13px]">
              <div className="flex items-start gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="font-semibold text-ink">Phone / WhatsApp</p>
                  <p className="text-muted">{support.phone ?? "Not published yet"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="font-semibold text-ink">Email</p>
                  <p className="break-all text-muted">{supportEmail ?? "Not published yet"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
                <div>
                  <p className="font-semibold text-ink">Verification window</p>
                  <p className="text-muted">
                    Deposits are credited only after an administrator matches them to bank records.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Before you write" />
            <CardBody className="space-y-2 text-[12.5px] leading-relaxed text-muted">
              <p>
                • Deposits awaiting verification show under{" "}
                <Link to="/dashboard/wallet" className="font-semibold text-brand hover:underline">
                  Wallet → Deposit requests
                </Link>
                .
              </p>
              <p>
                • Ticket confirmations and winning numbers live under{" "}
                <Link to="/dashboard/tickets" className="font-semibold text-brand hover:underline">
                  My tickets
                </Link>
                .
              </p>
              <p>
                • Read the{" "}
                <Link to="/legal/refund" className="font-semibold text-brand hover:underline">
                  payment &amp; refund policy
                </Link>{" "}
                and{" "}
                <Link to="/faqs" className="font-semibold text-brand hover:underline">
                  FAQs
                </Link>
                .
              </p>
            </CardBody>
          </Card>

          <Alert tone="warning" title="Reporting a payment problem">
            Include the UTR reference, the amount and the date. Screenshots are helpful — but never send
            one that shows your PIN or password.
          </Alert>
        </div>
      </div>
    </>
  );
}
