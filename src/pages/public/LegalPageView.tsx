import { useMemo } from "react";
import { FileText, Scale } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { contentService } from "@/services/contentService";
import { describeStoreError } from "@/lib/backend";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/utils/format";
import { cn } from "@/utils/cn";

const SLUG_LABELS: Record<string, string> = {
  terms: "Terms & conditions",
  privacy: "Privacy policy",
  refund: "Payment & refund",
  eligibility: "Eligibility & responsible play",
};

/** Renders the small markdown subset used by legal documents. */
function renderInline(text: string, key: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={`${key}-${index}`} className="font-semibold text-ink">
        {part}
      </strong>
    ) : (
      <span key={`${key}-${index}`}>{part}</span>
    ),
  );
}

function DocumentBody({ body }: { body: string }) {
  const blocks = useMemo(() => {
    const lines = body.split("\n");
    const out: Array<
      | { type: "heading"; text: string }
      | { type: "quote"; text: string }
      | { type: "list"; items: string[] }
      | { type: "paragraph"; text: string }
    > = [];
    let buffer: string[] = [];
    let list: string[] = [];

    const flushParagraph = () => {
      if (buffer.length) {
        out.push({ type: "paragraph", text: buffer.join(" ") });
        buffer = [];
      }
    };
    const flushList = () => {
      if (list.length) {
        out.push({ type: "list", items: list });
        list = [];
      }
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }
      if (/^#{1,6}\s+/.test(line)) {
        flushParagraph();
        flushList();
        out.push({ type: "heading", text: line.replace(/^#{1,6}\s+/, "") });
        continue;
      }
      if (line.startsWith("> ")) {
        flushParagraph();
        flushList();
        out.push({ type: "quote", text: line.slice(2) });
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        flushParagraph();
        list.push(line.replace(/^[-*]\s+/, ""));
        continue;
      }
      flushList();
      buffer.push(line.trim());
    }
    flushParagraph();
    flushList();
    return out;
  }, [body]);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        const key = `blk-${index}`;
        if (block.type === "heading") {
          return (
            <h2 key={key} className="pt-2 font-display text-[19px] text-ink">
              {block.text}
            </h2>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={key}
              className="rounded-r-xl border-l-4 border-gold bg-gold-soft/40 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink"
            >
              {renderInline(block.text, key)}
            </blockquote>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={key} className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-muted">
              {block.items.map((item, i) => (
                <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key} className="text-[14px] leading-relaxed text-muted">
            {renderInline(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}

export function LegalPageView() {
  const { slug = "" } = useParams();
  const page = useAsync(() => contentService.legalPage(slug), [slug]);
  const all = useAsync(() => contentService.legalPages(), []);
  const published = all.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Policies"
        icon={Scale}
        title={page.data?.title ?? SLUG_LABELS[slug] ?? "Legal information"}
        description={page.data?.summary ?? "Published policies that apply to every participant."}
        crumbs={[{ label: "Home", to: "/" }, { label: "Legal", to: "/legal/terms" }, { label: SLUG_LABELS[slug] ?? slug }]}
        actions={
          <Badge tone="gold" icon={FileText}>
            Updated {page.data ? formatDate(page.data.updatedAt) : "—"}
          </Badge>
        }
      />

      <div className="page grid gap-6 py-8 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardBody className="px-5 py-6 sm:px-7">
            {page.loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-4 w-full" rounded="sm" />
                ))}
              </div>
            ) : page.error ? (
              <ErrorState
                title="This policy could not be loaded"
                description={describeStoreError(page.error)}
                onRetry={page.reload}
              />
            ) : page.data ? (
              <DocumentBody body={page.data.body} />
            ) : (
              <EmptyState
                title="That policy has not been published yet"
                description={
                  published.length
                    ? "Choose one of the published policies from the list."
                    : "The organiser has not published its policies yet. Do not participate until the terms are available."
                }
                action={
                  published[0] && published[0].slug !== slug ? (
                    <Link to={`/legal/${published[0].slug}`}>
                      <Button variant="outline">{published[0].title}</Button>
                    </Link>
                  ) : undefined
                }
              />
            )}
          </CardBody>
        </Card>

        <div className="side-panel space-y-4">
          <Card>
            <CardHeader title="All published policies" />
            <CardBody className="flex flex-col gap-2">
              {all.loading ? (
                <Skeleton className="h-24" rounded="lg" />
              ) : all.error ? (
                <p className="text-[13px] text-muted">
                  The policy list could not be loaded.{" "}
                  <button type="button" className="font-semibold text-brand hover:underline" onClick={all.reload}>
                    Retry
                  </button>
                </p>
              ) : published.length ? (
                published.map((item) => (
                  <Link
                    key={item.slug}
                    to={`/legal/${item.slug}`}
                    className={cn(
                      "rounded-xl border px-3.5 py-3 text-[13.5px] font-semibold transition",
                      item.slug === slug
                        ? "border-gold bg-gold-soft/40 text-maroon-deep"
                        : "border-line bg-ivory/60 text-ink hover:border-gold",
                    )}
                  >
                    {item.title}
                    <span className="mt-0.5 block text-[11.5px] font-normal text-muted">
                      Updated {formatDate(item.updatedAt)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-[13px] text-muted">No policies have been published yet.</p>
              )}
            </CardBody>
          </Card>

          <Alert tone="warning" title="No professional legal advice">
            These documents describe how the software behaves. They are not legal advice and do not
            grant any licence. Paid chance-based draws stay disabled until the operator obtains its
            own jurisdiction-specific review.
          </Alert>
        </div>
      </div>
    </>
  );
}
