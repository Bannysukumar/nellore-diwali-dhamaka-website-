import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Cog,
  Layers,
  Package,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { UNCONFIGURED_SETTINGS, useSettings } from "@/app/SettingsProvider";
import { contentService } from "@/services/contentService";
import { adminService } from "@/services/adminService";
import { DEFAULT_SHARE_MESSAGE, renderShareMessage, rewardService } from "@/services/rewardService";
import { describeStoreError, store } from "@/lib/backend";
import type { SiteSettings, TicketPackage } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  FieldError,
  FormRow,
  Input,
  Label,
  LoadErrors,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, parseRupeesToPaise } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";
import { newId } from "@/utils/id";

interface SettingsDraft {
  brandName: string;
  tagline: string;
  supportPhone: string;
  supportEmail: string;
  minDepositRupees: string;
  maxDepositRupees: string;
  allowMultiTicketPurchase: boolean;
  maxTicketsPerOrder: string;
  allowPaidDraws: boolean;
  refundWindowHours: string;
  minAge: string;
  legalDisclaimer: string;
  referralShareMessage: string;
}

function toDraft(settings: SiteSettings): SettingsDraft {
  return {
    brandName: settings.brandName,
    tagline: settings.tagline,
    supportPhone: settings.supportPhone,
    supportEmail: settings.supportEmail,
    minDepositRupees: (settings.minDepositPaise / 100).toString(),
    maxDepositRupees: (settings.maxDepositPaise / 100).toString(),
    allowMultiTicketPurchase: settings.allowMultiTicketPurchase,
    maxTicketsPerOrder: String(settings.maxTicketsPerOrder),
    allowPaidDraws: settings.allowPaidDraws,
    refundWindowHours: String(settings.refundWindowHours),
    minAge: String(settings.minAge),
    legalDisclaimer: settings.legalDisclaimer,
    referralShareMessage: settings.referralShareMessage ?? DEFAULT_SHARE_MESSAGE,
  };
}

type Section = "general" | "money" | "compliance" | "packages";

export function AdminSettingsPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const { settings, reload, loading: settingsLoading, error: settingsError } = useSettings();
  const unconfigured = !settingsLoading && !settingsError && !settings;
  const base = settings ?? (unconfigured ? UNCONFIGURED_SETTINGS : null);

  const [section, setSection] = useState<Section>("general");
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const packages = useAsync(() => contentService.allPackages(), []);
  const [packageDraft, setPackageDraft] = useState<TicketPackage[]>([]);
  const [removingPackage, setRemovingPackage] = useState<TicketPackage | null>(null);

  useEffect(() => {
    if (base && !draft) setDraft(toDraft(base));
  }, [base, draft]);

  useEffect(() => {
    if (packages.data) setPackageDraft(packages.data);
  }, [packages.data]);

  const current = draft ?? (base ? toDraft(base) : null);

  const update = (patch: Partial<SettingsDraft>) => {
    if (!current) return;
    setDraft({ ...current, ...patch });
  };

  const saveSettings = async () => {
    if (!current) return;
    setError(null);

    const minDepositPaise = parseRupeesToPaise(current.minDepositRupees || "0");
    const maxDepositPaise = parseRupeesToPaise(current.maxDepositRupees || "0");
    const maxTicketsPerOrder = Number(current.maxTicketsPerOrder);
    const refundWindowHours = Number(current.refundWindowHours);
    const minAge = Number(current.minAge);

    if (current.brandName.trim().length < 2) return setError("Enter the brand name.");
    if (!Number.isFinite(minDepositPaise) || minDepositPaise <= 0) return setError("Enter a minimum deposit.");
    if (!Number.isFinite(maxDepositPaise) || maxDepositPaise < minDepositPaise) {
      return setError("The maximum deposit must be at least the minimum.");
    }
    if (!Number.isInteger(maxTicketsPerOrder) || maxTicketsPerOrder < 1) {
      return setError("Maximum tickets per order must be at least 1.");
    }
    if (!Number.isInteger(refundWindowHours) || refundWindowHours < 0) {
      return setError("Enter a valid refund window in hours.");
    }
    if (!Number.isInteger(minAge) || minAge < 1) return setError("Enter a valid minimum age.");
    if (current.legalDisclaimer.trim().length < 20) {
      return setError("The compliance disclaimer must be at least 20 characters.");
    }

    setSaving(true);
    try {
      const next: SiteSettings = {
        brandName: current.brandName.trim(),
        tagline: current.tagline.trim(),
        supportPhone: current.supportPhone.trim(),
        supportEmail: current.supportEmail.trim(),
        minDepositPaise,
        maxDepositPaise,
        allowMultiTicketPurchase: current.allowMultiTicketPurchase,
        maxTicketsPerOrder,
        allowPaidDraws: current.allowPaidDraws,
        refundWindowHours,
        minAge,
        legalDisclaimer: current.legalDisclaimer.trim(),
        referralShareMessage: current.referralShareMessage.trim() || DEFAULT_SHARE_MESSAGE,
        updatedAt: new Date().toISOString(),
      };

      await store.set("siteSettings", "general", next as never);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "settings.update",
        entity: "siteSettings",
        entityId: "general",
        note:
          settings && settings.allowPaidDraws !== next.allowPaidDraws
            ? `Paid draws ${next.allowPaidDraws ? "ENABLED" : "disabled"}`
            : "General settings updated",
        before: settings ? { allowPaidDraws: settings.allowPaidDraws } : undefined,
        after: { allowPaidDraws: next.allowPaidDraws },
      });

      toast.success("Settings saved", "Changes reach open sessions immediately.");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const savePackages = async () => {
    setError(null);
    for (const item of packageDraft) {
      if (item.name.trim().length < 2) return setError("Every package needs a name.");
      if (item.ticketCount < 1) return setError(`“${item.name}” must include at least one ticket.`);
      if (item.pricePaise <= 0) return setError(`“${item.name}” needs a price above zero.`);
    }
    setSaving(true);
    try {
      await contentService.savePackages(packageDraft);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "packages.update",
        entity: "siteSettings",
        entityId: "packages",
        note: `${packageDraft.length} package(s) saved`,
      });
      toast.success("Packages saved", "The booking page now offers these packages.");
      packages.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Packages could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const addPackage = () => {
    setPackageDraft((currentPackages) => [
      ...currentPackages,
      {
        id: newId("pkg"),
        name: "New package",
        pricePaise: 49900,
        ticketCount: 1,
        benefits: [],
        enabled: true,
        sortOrder: currentPackages.length,
      },
    ]);
  };

  const updatePackage = (id: string, patch: Partial<TicketPackage>) => {
    setPackageDraft((currentPackages) =>
      currentPackages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const confirmRemovePackage = () => {
    if (!removingPackage) return;
    setPackageDraft((currentPackages) => currentPackages.filter((p) => p.id !== removingPackage.id));
    setRemovingPackage(null);
    toast.info("Package removed", "Save the list to apply the change.");
  };

  if (settingsError) {
    return (
      <>
        <PageHeader eyebrow="System" icon={Cog} title="Settings" />
        <ErrorState
          className="mt-5"
          title="Settings could not be loaded"
          description={describeStoreError(settingsError)}
          onRetry={reload}
        />
      </>
    );
  }

  if (!current) {
    return (
      <>
        <PageHeader eyebrow="System" icon={Cog} title="Settings" />
        <Skeleton className="mt-5 h-96" rounded="lg" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="System"
        icon={Cog}
        title="Settings"
        description="Platform configuration, deposit limits, compliance controls and the marketing ticket packages shown on the booking page."
      />

      {unconfigured ? (
        <Alert tone="warning" className="mt-4" title="Settings have not been saved yet">
          The site is running on restrictive defaults: no support contacts, deposits disabled and paid draws
          off. Fill in each section and save to create the configuration.
        </Alert>
      ) : null}

      <LoadErrors className="mt-4" sources={[packages]} />

      <Alert
        tone={current.allowPaidDraws ? "warning" : "info"}
        className="mt-4"
        title={current.allowPaidDraws ? "Paid draws are ENABLED" : "Paid draws are disabled"}
      >
        {current.allowPaidDraws ? (
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-deep" aria-hidden />
            Ticket purchasing is active. Only enable this once your legal and compliance review is complete
            and the published terms match how the draw actually operates.
          </span>
        ) : (
          "Customers cannot purchase tickets. This is the safe default until the operator completes its legal and compliance review."
        )}
      </Alert>

      <Tabs
        className="mt-5"
        ariaLabel="Settings sections"
        items={[
          { value: "general", label: "General" },
          { value: "money", label: "Money" },
          { value: "compliance", label: "Compliance" },
          { value: "packages", label: "Ticket packages" },
        ]}
        value={section}
        onChange={setSection}
      />

      {error ? <FieldError>{error}</FieldError> : null}

      {section === "general" ? (
        <Card className="mt-4">
          <CardHeader icon={Building2} title="Brand" description="Shown across the public site and in messages." />
          <CardBody className="space-y-4">
            <FormRow columns={2}>
              <div>
                <Label htmlFor="set-brand" required>
                  Brand name
                </Label>
                <Input
                  id="set-brand"
                  value={current.brandName}
                  onChange={(event) => update({ brandName: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="set-tagline">Tagline</Label>
                <Input
                  id="set-tagline"
                  value={current.tagline}
                  onChange={(event) => update({ tagline: event.target.value })}
                />
              </div>
            </FormRow>
            <FormRow columns={2}>
              <div>
                <Label htmlFor="set-phone">Support phone</Label>
                <Input
                  id="set-phone"
                  value={current.supportPhone}
                  onChange={(event) => update({ supportPhone: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="set-email">Support email</Label>
                <Input
                  id="set-email"
                  type="email"
                  value={current.supportEmail}
                  onChange={(event) => update({ supportEmail: event.target.value })}
                />
              </div>
            </FormRow>
            <FormRow columns={2}>
              <div>
                <Label htmlFor="set-share" hint="{code}, {link} and {brand} are filled in">
                  WhatsApp referral message
                </Label>
                <Textarea
                  id="set-share"
                  rows={6}
                  maxLength={1000}
                  value={current.referralShareMessage}
                  onChange={(event) => update({ referralShareMessage: event.target.value })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-ink">Preview</p>
                <p className="whitespace-pre-wrap rounded-xl border border-line bg-ivory/60 p-3 text-[13px] leading-relaxed text-ink">
                  {renderShareMessage(current.referralShareMessage, {
                    code: "NDD1234",
                    link: rewardService.referralLink("NDD1234"),
                    brand: current.brandName.trim() || "Nellore Diwali Dhamaka",
                  })}
                </p>
              </div>
            </FormRow>
            <div className="flex justify-end">
              <Button onClick={() => void saveSettings()} loading={saving} iconLeft={<Save className="size-4" aria-hidden />}>
                Save settings
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {section === "money" ? (
        <Card className="mt-4">
          <CardHeader icon={Wallet} title="Deposits & orders" description="Limits applied during checkout and deposit review." />
          <CardBody className="space-y-4">
            <FormRow columns={2}>
              <div>
                <Label htmlFor="set-min" required hint="Rupees">
                  Minimum deposit
                </Label>
                <Input
                  id="set-min"
                  inputMode="decimal"
                  prefix="₹"
                  value={current.minDepositRupees}
                  onChange={(event) =>
                    update({ minDepositRupees: event.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
              <div>
                <Label htmlFor="set-max" required hint="Rupees">
                  Maximum deposit
                </Label>
                <Input
                  id="set-max"
                  inputMode="decimal"
                  prefix="₹"
                  value={current.maxDepositRupees}
                  onChange={(event) =>
                    update({ maxDepositRupees: event.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
            </FormRow>

            <div className="grid gap-2 rounded-xl border border-line bg-ivory/50 p-3 text-[12.5px] text-muted">
              <p>
                Customers may deposit between{" "}
                <strong className="text-ink">
                  {formatINR(parseRupeesToPaise(current.minDepositRupees || "0") || 0)}
                </strong>{" "}
                and{" "}
                <strong className="text-ink">
                  {formatINR(parseRupeesToPaise(current.maxDepositRupees || "0") || 0)}
                </strong>{" "}
                per request.
              </p>
            </div>

            <FormRow columns={2}>
              <div>
                <Label htmlFor="set-max-order" required hint="Per order">
                  Maximum tickets per order
                </Label>
                <Input
                  id="set-max-order"
                  inputMode="numeric"
                  value={current.maxTicketsPerOrder}
                  onChange={(event) =>
                    update({ maxTicketsPerOrder: event.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
              <div>
                <Label htmlFor="set-refund" hint="Hours">
                  Refund window
                </Label>
                <Input
                  id="set-refund"
                  inputMode="numeric"
                  value={current.refundWindowHours}
                  onChange={(event) =>
                    update({ refundWindowHours: event.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
            </FormRow>

            <div className="rounded-xl border border-line bg-ivory/50 p-3">
              <Switch
                checked={current.allowMultiTicketPurchase}
                onChange={(value) => update({ allowMultiTicketPurchase: value })}
                label="Allow buying more than one ticket at a time"
                description="When off, customers must complete a separate purchase for each number."
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => void saveSettings()} loading={saving} iconLeft={<Save className="size-4" aria-hidden />}>
                Save settings
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {section === "compliance" ? (
        <Card className="mt-4">
          <CardHeader
            icon={ShieldCheck}
            title="Compliance controls"
            description="The single switch that allows chance-based ticket sales to operate."
          />
          <CardBody className="space-y-4">
            <div
              className={
                current.allowPaidDraws
                  ? "rounded-xl border border-gold/50 bg-gold-soft/20 p-3"
                  : "rounded-xl border border-line bg-ivory/50 p-3"
              }
            >
              <Switch
                checked={current.allowPaidDraws}
                onChange={(value) => update({ allowPaidDraws: value })}
                label="Allow paid chance-based draws"
                description="While disabled, purchaseTickets is rejected server-side with a compliance error."
              />
            </div>

            <FormRow columns={2}>
              <div>
                <Label htmlFor="set-age" required>
                  Minimum age
                </Label>
                <Input
                  id="set-age"
                  inputMode="numeric"
                  value={current.minAge}
                  onChange={(event) => update({ minAge: event.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="flex items-end">
                <Badge tone={current.allowPaidDraws ? "warning" : "emerald"}>
                  {current.allowPaidDraws ? "Draws live" : "Draws blocked"}
                </Badge>
              </div>
            </FormRow>

            <div>
              <Label htmlFor="set-disclaimer" required hint="Shown wherever draws are described">
                Compliance disclaimer
              </Label>
              <Textarea
                id="set-disclaimer"
                value={current.legalDisclaimer}
                onChange={(event) => update({ legalDisclaimer: event.target.value })}
                className="min-h-28"
              />
            </div>

            <Alert tone="warning" title="Enabling this is a real change">
              Turning paid draws on allows customers to spend wallet balance on chance-based tickets. Do it
              only after the terms, refund policy and eligibility rules reflect what the platform actually
              does. The before/after state of this switch is written to the audit log.
            </Alert>

            <div className="flex justify-end">
              <Button onClick={() => void saveSettings()} loading={saving} iconLeft={<Save className="size-4" aria-hidden />}>
                Save settings
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {section === "packages" ? (
        <Card className="mt-4">
          <CardHeader
            icon={Package}
            title="Ticket packages"
            description="Marketing presets shown on the booking page. Prices and ticket counts are stated separately and never replace the draw's authoritative price."
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addPackage} iconLeft={<Plus className="size-3.5" aria-hidden />}>
                  Add package
                </Button>
                <Button size="sm" onClick={() => void savePackages()} loading={saving} iconLeft={<Save className="size-3.5" aria-hidden />}>
                  Save packages
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-3">
            {packages.loading ? (
              <Skeleton className="h-56" rounded="lg" />
            ) : packageDraft.length ? (
              packageDraft.map((item) => (
                <div key={item.id} className="rounded-xl border border-line bg-ivory/50 p-3.5">
                  <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                    <div>
                      <Label htmlFor={`pkg-name-${item.id}`}>Name</Label>
                      <Input
                        id={`pkg-name-${item.id}`}
                        value={item.name}
                        onChange={(event) => updatePackage(item.id, { name: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`pkg-price-${item.id}`} hint="Rupees">
                        Price
                      </Label>
                      <Input
                        id={`pkg-price-${item.id}`}
                        inputMode="decimal"
                        prefix="₹"
                        value={(item.pricePaise / 100).toString()}
                        onChange={(event) =>
                          updatePackage(item.id, {
                            pricePaise: parseRupeesToPaise(event.target.value.replace(/[^\d.]/g, "") || "0") || 0,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`pkg-count-${item.id}`} hint="Tickets">
                        Tickets included
                      </Label>
                      <Input
                        id={`pkg-count-${item.id}`}
                        inputMode="numeric"
                        value={String(item.ticketCount)}
                        onChange={(event) =>
                          updatePackage(item.id, {
                            ticketCount: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end gap-1.5">
                      <Button
                        size="sm"
                        variant={item.enabled ? "primary" : "outline"}
                        onClick={() => updatePackage(item.id, { enabled: !item.enabled })}
                      >
                        {item.enabled ? "Live" : "Off"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemovingPackage(item)}
                        aria-label="Remove package"
                      >
                        <Trash2 className="size-3.5 text-brand" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <div>
                      <Label htmlFor={`pkg-badge-${item.id}`}>Badge</Label>
                      <Input
                        id={`pkg-badge-${item.id}`}
                        value={item.badge ?? ""}
                        onChange={(event) => updatePackage(item.id, { badge: event.target.value || undefined })}
                        placeholder="e.g. Most popular"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`pkg-reward-${item.id}`}>Reward note</Label>
                      <Input
                        id={`pkg-reward-${item.id}`}
                        value={item.rewardDescription ?? ""}
                        onChange={(event) =>
                          updatePackage(item.id, { rewardDescription: event.target.value || undefined })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <Label htmlFor={`pkg-benefits-${item.id}`} hint="One per line">
                      Benefits
                    </Label>
                    <Textarea
                      id={`pkg-benefits-${item.id}`}
                      className="min-h-20"
                      value={item.benefits.join("\n")}
                      onChange={(event) =>
                        updatePackage(item.id, {
                          benefits: event.target.value.split("\n").map((b) => b.trim()).filter(Boolean),
                        })
                      }
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Layers className="size-3.5" aria-hidden />
                      {formatNumber(item.ticketCount)} ticket(s) for {formatINR(item.pricePaise)}
                    </span>
                    <span>
                      Effective per ticket:{" "}
                      <strong className="text-ink">
                        {formatINR(Math.round(item.pricePaise / Math.max(1, item.ticketCount)))}
                      </strong>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-[13px] text-muted">
                No packages configured — the booking page will show only the direct draw pricing.
              </p>
            )}

            <Alert tone="info" title="Packages never change the price">
              At checkout the server re-prices every ticket from the draw document. A package is only a
              convenient selection preset and can never discount or inflate what a customer actually pays.
            </Alert>
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>{settings ? `Last updated ${formatDateTime(settings.updatedAt)}` : "Not saved yet"}</span>
        <span className="flex items-center gap-2">
          <Badge tone="neutral">Server-verified settings</Badge>
        </span>
      </div>

      <ConfirmDialog
        open={Boolean(removingPackage)}
        onClose={() => setRemovingPackage(null)}
        onConfirm={confirmRemovePackage}
        tone="danger"
        title={removingPackage ? `Remove “${removingPackage.name}”?` : "Remove package"}
        description="The package will be removed when you save the list. Existing tickets are unaffected."
        confirmLabel="Remove package"
      />
    </>
  );
}
