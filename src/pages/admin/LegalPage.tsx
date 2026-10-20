import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Plus, Save, Trash2 } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { contentService } from "@/services/contentService";
import { adminService } from "@/services/adminService";
import { store } from "@/lib/backend";
import type { LegalPage } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dialog,
  FieldError,
  Input,
  Label,
  LoadErrors,
  Skeleton,
  Tabs,
  Textarea,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/utils/format";
import { slugify } from "@/utils/id";

interface PageDraft {
  slug: string;
  title: string;
  summary: string;
  body: string;
}

const EMPTY: PageDraft = { slug: "", title: "", summary: "", body: "" };

export function AdminLegalPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const pages = useAsync(() => contentService.legalPages(), []);

  const [activeSlug, setActiveSlug] = useState<string>("");
  const [draft, setDraft] = useState<PageDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<PageDraft>(EMPTY);
  const [removing, setRemoving] = useState<LegalPage | null>(null);

  const rows = useMemo(() => pages.data ?? [], [pages.data]);

  useEffect(() => {
    if (!activeSlug && rows.length) setActiveSlug(rows[0].slug);
  }, [activeSlug, rows]);

  const active = rows.find((p) => p.slug === activeSlug) ?? null;

  useEffect(() => {
    if (active) {
      setDraft({
        slug: active.slug,
        title: active.title,
        summary: active.summary,
        body: active.body,
      });
      setError(null);
    }
  }, [active]);

  const save = async () => {
    if (!active) return;
    setError(null);
    if (draft.title.trim().length < 3) return setError("Enter a page title.");
    if (draft.body.trim().length < 20) return setError("The page body is too short to be useful.");

    setSaving(true);
    try {
      const page: LegalPage = {
        id: active.id,
        slug: active.slug,
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        body: draft.body,
        updatedAt: new Date().toISOString(),
        updatedBy: profile?.fullName ?? "Administrator",
      };
      await contentService.saveLegalPage(page);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "legal.update",
        entity: "legalPages",
        entityId: active.slug,
        note: page.title,
      });
      toast.success("Page saved", `${page.title} updated.`);
      pages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The page could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    setError(null);
    const slug = slugify(newDraft.slug || newDraft.title);
    if (!slug) return setError("Enter a URL slug (letters, numbers and dashes).");
    if (newDraft.title.trim().length < 3) return setError("Enter a page title.");
    if (newDraft.body.trim().length < 20) return setError("Add the page content.");
    if (rows.some((p) => p.slug === slug)) return setError("A page with that slug already exists.");

    setSaving(true);
    try {
      const now = new Date().toISOString();
      await store.set("legalPages", slug, {
        slug,
        title: newDraft.title.trim(),
        summary: newDraft.summary.trim(),
        body: newDraft.body,
        updatedAt: now,
        updatedBy: profile?.fullName ?? "Administrator",
      });
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "legal.create",
        entity: "legalPages",
        entityId: slug,
        note: newDraft.title.trim(),
      });
      toast.success("Page created", "It is reachable at /legal/" + slug);
      setCreating(false);
      setNewDraft(EMPTY);
      setActiveSlug(slug);
      pages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The page could not be created.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await store.remove("legalPages", removing.slug);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "legal.delete",
        entity: "legalPages",
        entityId: removing.slug,
        note: removing.title,
      });
      toast.success("Page deleted", removing.title);
      if (activeSlug === removing.slug) setActiveSlug("");
      setRemoving(null);
      pages.reload();
    } catch (err) {
      toast.error("Could not delete", err instanceof Error ? err.message : "Please retry.");
    }
  };

  const columns: Array<Column<LegalPage>> = [
    {
      key: "title",
      header: "Page",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.title}</p>
          <p className="font-mono text-[11px] text-muted">/legal/{row.slug}</p>
        </div>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      hideBelow: "md",
      render: (row) => <span className="line-clamp-1 text-[12.5px] text-muted">{row.summary}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      hideBelow: "sm",
      render: (row) => <span className="text-muted">{formatDateTime(row.updatedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveSlug(row.slug)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRemoving(row)}
            aria-label="Delete page"
          >
            <Trash2 className="size-3.5 text-brand" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Content"
        icon={BookOpen}
        title="Legal pages"
        description="Terms, privacy policy, refund policy and responsible-play pages. These are rendered publicly at /legal/<slug> and should be reviewed by a qualified adviser before launch."
        actions={
          <Button
            onClick={() => {
              setNewDraft(EMPTY);
              setError(null);
              setCreating(true);
            }}
            iconLeft={<Plus className="size-4" aria-hidden />}
          >
            New page
          </Button>
        }
      />

      <LoadErrors className="mt-4" sources={[pages]} />

      <Alert tone="warning" className="mt-4" title="Not legal advice">
        The application ships with no legal text. Write your own terms, privacy and refund policies and have
        them — especially the refund and chance-based promotion clauses — reviewed by a qualified professional
        in your jurisdiction before enabling paid draws.
      </Alert>

      <div className="mt-5 grid gap-4 xl:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader icon={FileText} title="Pages" description={`${rows.length} configured`} />
          <CardBody className="space-y-3">
            {pages.loading ? (
              <Skeleton className="h-48" rounded="lg" />
            ) : rows.length ? (
              <>
                <Tabs
                  items={rows.map((page) => ({ value: page.slug, label: page.title }))}
                  value={activeSlug}
                  onChange={setActiveSlug}
                  ariaLabel="Legal pages"
                  size="sm"
                />
                <div className="hidden xl:block">
                  <DataTable
                    columns={columns}
                    rows={rows}
                    keyOf={(row) => row.slug}
                    caption="Legal pages"
                    emptyTitle="No pages"
                    emptyDescription="Create a legal page."
                  />
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted">No legal pages configured.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={BookOpen}
            title={active ? `Editing: ${active.title}` : "Select a page"}
            description={active ? `/legal/${active.slug}` : "Choose a page on the left to edit its content."}
            action={
              active ? (
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">
                    Updated {active.updatedBy ? `by ${active.updatedBy}` : "—"}
                  </Badge>
                  <Button
                    onClick={() => void save()}
                    loading={saving}
                    iconLeft={<Save className="size-4" aria-hidden />}
                  >
                    Save
                  </Button>
                </div>
              ) : null
            }
          />
          <CardBody>
            {!active ? (
              <p className="py-12 text-center text-[13px] text-muted">
                Select a legal page to view and edit its content.
              </p>
            ) : (
              <div className="space-y-4">
                {error ? <FieldError>{error}</FieldError> : null}

                <div>
                  <Label htmlFor="legal-title" required>
                    Title
                  </Label>
                  <Input
                    id="legal-title"
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="legal-summary">Summary</Label>
                  <Input
                    id="legal-summary"
                    value={draft.summary}
                    onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                    placeholder="One-line description shown in listings."
                  />
                </div>

                <div>
                  <Label htmlFor="legal-body" required hint="Plain text; blank lines become paragraphs">
                    Body
                  </Label>
                  <Textarea
                    id="legal-body"
                    value={draft.body}
                    onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                    className="min-h-[420px] font-mono text-[12.5px] leading-relaxed"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] text-muted">
                    Last saved {formatDateTime(active.updatedAt)}
                    {active.updatedBy ? ` by ${active.updatedBy}` : ""}.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => void save()}
                      loading={saving}
                      iconLeft={<Save className="size-4" aria-hidden />}
                    >
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        size="lg"
        dismissible={!saving}
        title="Create a legal page"
        description="Give it a slug — it is published at /legal/<slug> immediately after saving."
      >
        <div className="space-y-4">
          {error ? <FieldError>{error}</FieldError> : null}
          <div>
            <Label htmlFor="new-legal-title" required>
              Title
            </Label>
            <Input
              id="new-legal-title"
              value={newDraft.title}
              onChange={(event) => {
                const title = event.target.value;
                setNewDraft((d) => ({
                  ...d,
                  title,
                  slug: d.slug || slugify(title),
                }));
              }}
              placeholder="e.g. Responsible Play Policy"
            />
          </div>
          <div>
            <Label htmlFor="new-legal-slug" required hint="Letters, numbers and dashes">
              Slug
            </Label>
            <Input
              id="new-legal-slug"
              value={newDraft.slug}
              onChange={(event) => setNewDraft({ ...newDraft, slug: slugify(event.target.value) })}
              placeholder="responsible-play"
            />
          </div>
          <div>
            <Label htmlFor="new-legal-summary">Summary</Label>
            <Input
              id="new-legal-summary"
              value={newDraft.summary}
              onChange={(event) => setNewDraft({ ...newDraft, summary: event.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="new-legal-body" required>
              Body
            </Label>
            <Textarea
              id="new-legal-body"
              value={newDraft.body}
              onChange={(event) => setNewDraft({ ...newDraft, body: event.target.value })}
              className="min-h-64"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void create()} loading={saving}>
              Create page
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        tone="danger"
        title={removing ? `Delete “${removing.title}”?` : "Delete page"}
        description="The page and its URL stop being served. Any link to it will show a not-found page."
        confirmLabel="Delete page"
      />
    </>
  );
}
