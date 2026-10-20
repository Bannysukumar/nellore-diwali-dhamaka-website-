import { useEffect, useMemo, useState } from "react";
import { Gift, Package, Pencil, Plus, Save, Settings2, Sparkles, Trash2 } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { rewardService } from "@/services/rewardService";
import { adminService } from "@/services/adminService";
import type { Reward, RewardType, SpinConfig, WheelSegment } from "@/types";
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
  FormRow,
  Input,
  Label,
  LoadErrors,
  Select,
  Skeleton,
  Switch,
  Textarea,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, parseRupeesToPaise } from "@/utils/money";
import { formatNumber } from "@/utils/format";
import { newId } from "@/utils/id";

const TYPE_LABEL: Record<RewardType, string> = {
  coupon: "Coupon",
  gift: "Gift",
  wallet_credit: "Wallet credit",
  free_ticket: "Free ticket",
  no_prize: "No prize",
};

const TYPE_TONE: Record<RewardType, "gold" | "brand" | "emerald" | "warning" | "muted"> = {
  coupon: "gold",
  gift: "brand",
  wallet_credit: "emerald",
  free_ticket: "brand",
  no_prize: "muted",
};

interface RewardDraft {
  name: string;
  description: string;
  type: RewardType;
  valueRupees: string;
  couponCode: string;
  inventory: string;
  validDays: string;
  active: boolean;
}

/** Starting point when `siteSettings/spin` does not exist yet: wheel off, tight limits. */
const UNCONFIGURED_SPIN: SpinConfig = {
  enabled: false,
  spinsPerReferral: 1,
  referralQualification: "signup",
  referralClaimWindowHours: 72,
  maxSpinsPerUser: 5,
  dailySpinLimit: 3,
  maxRewardsPerReferrer: 10,
  rewardValidDays: 30,
  minAge: 18,
  maxReferralsPerAccount: 1,
  segments: [],
  updatedAt: "",
};

const QUALIFICATION_LABEL: Record<NonNullable<SpinConfig["referralQualification"]>, string> = {
  signup: "Completes OTP-verified registration",
  verified_deposit: "Has a deposit approved by an administrator",
  ticket_purchase: "Completes a ticket purchase",
};

interface CampaignDraft {
  enabled: boolean;
  spinsPerReferral: string;
  referralQualification: NonNullable<SpinConfig["referralQualification"]>;
  referralClaimWindowHours: string;
  maxSpinsPerUser: string;
  dailySpinLimit: string;
  maxRewardsPerReferrer: string;
  maxReferralsPerAccount: string;
  rewardValidDays: string;
  minAge: string;
  spinPriceRupees: string;
  campaignStart: string;
  campaignEnd: string;
}

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toCampaignDraft(config: SpinConfig): CampaignDraft {
  return {
    enabled: config.enabled,
    spinsPerReferral: String(config.spinsPerReferral),
    referralQualification: config.referralQualification ?? "signup",
    referralClaimWindowHours: String(config.referralClaimWindowHours ?? 72),
    maxSpinsPerUser: String(config.maxSpinsPerUser),
    dailySpinLimit: String(config.dailySpinLimit),
    maxRewardsPerReferrer: String(config.maxRewardsPerReferrer),
    maxReferralsPerAccount: String(config.maxReferralsPerAccount),
    rewardValidDays: String(config.rewardValidDays),
    minAge: String(config.minAge),
    spinPriceRupees: String(Math.round((config.spinPricePaise ?? 0) / 100)),
    campaignStart: toLocalInput(config.campaignStart),
    campaignEnd: toLocalInput(config.campaignEnd),
  };
}

const EMPTY_REWARD: RewardDraft = {
  name: "",
  description: "",
  type: "coupon",
  valueRupees: "",
  couponCode: "",
  inventory: "100",
  validDays: "30",
  active: true,
};

export function AdminRewardsPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const rewards = useAsync(() => rewardService.rewards(), []);
  const config = useAsync(() => rewardService.spinConfig(), []);

  const [editing, setEditing] = useState<Reward | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RewardDraft>(EMPTY_REWARD);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Reward | null>(null);

  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [savingSegments, setSavingSegments] = useState(false);
  const [campaign, setCampaign] = useState<CampaignDraft | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [savingCampaign, setSavingCampaign] = useState(false);

  /** Null while loading or after a failed read — never save over an unknown document. */
  const baseConfig: SpinConfig | null = config.loading || config.error ? null : (config.data ?? UNCONFIGURED_SPIN);
  const spinUnconfigured = !config.loading && !config.error && !config.data;

  useEffect(() => {
    if (config.data) setSegments(config.data.segments ?? []);
  }, [config.data]);

  useEffect(() => {
    if (baseConfig && !campaign) setCampaign(toCampaignDraft(baseConfig));
  }, [baseConfig, campaign]);

  const allRewards = useMemo(() => rewards.data ?? [], [rewards.data]);

  const openCreate = () => {
    setDraft(EMPTY_REWARD);
    setEditing(null);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (reward: Reward) => {
    setDraft({
      name: reward.name,
      description: reward.description,
      type: reward.type,
      valueRupees: reward.valuePaise ? (reward.valuePaise / 100).toString() : "",
      couponCode: reward.couponCode ?? "",
      inventory: String(reward.inventory),
      validDays: String(reward.validDays ?? 30),
      active: reward.active,
    });
    setEditing(reward);
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (draft.name.trim().length < 3) return setFormError("Give the reward a name of at least 3 characters.");
    if (draft.description.trim().length < 5) return setFormError("Describe what the reward actually is.");
    const inventory = Number(draft.inventory);
    if (!Number.isInteger(inventory) || inventory < 0) return setFormError("Inventory must be a whole number.");

    let valuePaise: number | undefined;
    if (draft.type === "wallet_credit") {
      valuePaise = parseRupeesToPaise(draft.valueRupees || "0");
      if (!Number.isFinite(valuePaise) || valuePaise <= 0) {
        return setFormError("A wallet credit reward needs a positive value.");
      }
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editing) {
        const payload: Reward = {
          ...editing,
          name: draft.name.trim(),
          description: draft.description.trim(),
          type: draft.type,
          valuePaise,
          couponCode: draft.couponCode.trim() || undefined,
          inventory,
          remaining: Math.min(editing.remaining, inventory),
          validDays: Number(draft.validDays) || 30,
          active: draft.active,
          updatedAt: now,
        };
        await rewardService.saveReward(payload);
        await adminService.log({
          actorUid: profile?.uid ?? "",
          actorName: profile?.fullName ?? "Administrator",
          action: "reward.update",
          entity: "rewards",
          entityId: editing.id,
          note: payload.name,
        });
        toast.success("Reward updated", payload.name);
      } else {
        const id = newId("rw");
        const payload: Reward = {
          id,
          name: draft.name.trim(),
          description: draft.description.trim(),
          type: draft.type,
          valuePaise,
          couponCode: draft.couponCode.trim() || undefined,
          inventory,
          remaining: inventory,
          validDays: Number(draft.validDays) || 30,
          active: draft.active,
          createdAt: now,
          updatedAt: now,
        };
        await rewardService.saveReward(payload);
        await adminService.log({
          actorUid: profile?.uid ?? "",
          actorName: profile?.fullName ?? "Administrator",
          action: "reward.create",
          entity: "rewards",
          entityId: id,
          note: payload.name,
        });
        toast.success("Reward created", "Add it to the wheel to make it winnable.");
      }
      setOpen(false);
      setEditing(null);
      rewards.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The reward could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await rewardService.removeReward(removing.id);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "reward.delete",
        entity: "rewards",
        entityId: removing.id,
        note: removing.name,
      });
      toast.success("Reward deleted", removing.name);
      setRemoving(null);
      rewards.reload();
    } catch (error) {
      toast.error("Could not delete", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const updateSegment = (id: string, patch: Partial<WheelSegment>) => {
    setSegments((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addSegment = () => {
    const rewardId = allRewards[0]?.id ?? "";
    setSegments((current) => [
      ...current,
      { id: newId("seg"), rewardId, label: "New segment", color: "#D4AF37", weight: 10, active: true },
    ]);
  };

  const removeSegment = (id: string) => {
    setSegments((current) => current.filter((s) => s.id !== id));
  };

  const saveCampaign = async () => {
    if (!baseConfig || !campaign) return;
    setCampaignError(null);
    const whole = (value: string, label: string, min: number) => {
      const n = Number(value);
      if (!Number.isInteger(n) || n < min) throw new Error(`${label} must be a whole number of at least ${min}.`);
      return n;
    };
    let next: SpinConfig;
    try {
      const campaignStart = campaign.campaignStart ? new Date(campaign.campaignStart).toISOString() : undefined;
      const campaignEnd = campaign.campaignEnd ? new Date(campaign.campaignEnd).toISOString() : undefined;
      if (campaignStart && campaignEnd && campaignStart >= campaignEnd) {
        throw new Error("The campaign must end after it starts.");
      }
      next = {
        ...baseConfig,
        enabled: campaign.enabled,
        spinsPerReferral: whole(campaign.spinsPerReferral, "Spins per referral", 1),
        referralQualification: campaign.referralQualification,
        referralClaimWindowHours: whole(campaign.referralClaimWindowHours, "Referral claim window", 1),
        maxSpinsPerUser: whole(campaign.maxSpinsPerUser, "Maximum spins per account", 1),
        dailySpinLimit: whole(campaign.dailySpinLimit, "Daily spin limit", 1),
        maxRewardsPerReferrer: whole(campaign.maxRewardsPerReferrer, "Maximum referral spins per referrer", 1),
        maxReferralsPerAccount: whole(campaign.maxReferralsPerAccount, "Maximum qualified referrals per referrer", 1),
        rewardValidDays: whole(campaign.rewardValidDays, "Reward validity", 1),
        minAge: whole(campaign.minAge, "Minimum age", 18),
        spinPricePaise: whole(campaign.spinPriceRupees || "0", "Price per paid spin", 0) * 100,
        campaignStart,
        campaignEnd,
        updatedAt: new Date().toISOString(),
      };
      if (next.enabled && !next.segments.some((s) => s.active && s.weight > 0)) {
        throw new Error("Save at least one active wheel segment before enabling the wheel.");
      }
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Check the campaign values.");
      return;
    }
    setSavingCampaign(true);
    try {
      await rewardService.saveSpinConfig(next);
      await adminService.log({
        action: "spin.config.update",
        entity: "siteSettings",
        entityId: "spin",
        note: `Campaign rules saved (wheel ${next.enabled ? "enabled" : "disabled"}, paid spin ${next.spinPricePaise ? formatINR(next.spinPricePaise) : "off"})`,
        before: config.data
          ? { enabled: config.data.enabled, spinPricePaise: config.data.spinPricePaise ?? 0 }
          : undefined,
        after: { enabled: next.enabled, spinPricePaise: next.spinPricePaise },
      });
      toast.success("Campaign rules saved", next.enabled ? "The wheel is live." : "The wheel is disabled.");
      setCampaign(null);
      config.reload();
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "The campaign rules could not be saved.");
    } finally {
      setSavingCampaign(false);
    }
  };

  const saveWheel = async () => {
    if (!baseConfig) {
      toast.error("Spin settings not loaded", "Reload the page before saving the wheel.");
      return;
    }
    if (segments.some((s) => !s.label.trim())) {
      toast.error("Every segment needs a label", "Remove or rename empty segments before saving.");
      return;
    }
    if (segments.every((s) => s.weight <= 0 || !s.active)) {
      toast.error("No winnable segments", "At least one active segment must have a positive weight.");
      return;
    }
    setSavingSegments(true);
    try {
      const next: SpinConfig = { ...baseConfig, segments, updatedAt: new Date().toISOString() };
      await rewardService.saveSpinConfig(next);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "spin.config.update",
        entity: "siteSettings",
        entityId: "spin",
        note: `${segments.length} segments saved`,
      });
      toast.success("Wheel saved", "The new weighting applies to the next spin.");
      config.reload();
    } catch (error) {
      toast.error("Could not save", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setSavingSegments(false);
    }
  };

  const columns: Array<Column<Reward>> = [
    {
      key: "reward",
      header: "Reward",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="line-clamp-1 text-[11px] text-muted">{row.description}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => <Badge tone={TYPE_TONE[row.type]}>{TYPE_LABEL[row.type]}</Badge>,
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      hideBelow: "sm",
      render: (row) => (
        <span className="tabular-nums text-muted">
          {row.type === "wallet_credit" && row.valuePaise ? formatINR(row.valuePaise) : "—"}
        </span>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-ink">
          {formatNumber(row.remaining)} / {formatNumber(row.inventory)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.active ? "emerald" : "muted"}>{row.active ? "Active" : "Inactive"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit reward">
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(row)} aria-label="Delete reward">
            <Trash2 className="size-3.5 text-brand" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Draws & prizes"
        icon={Gift}
        title="Spin rewards"
        description="Define what the wheel can award and set how often each segment is selected. Rewards are promotional benefits — never a guaranteed or monetary return."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus className="size-4" aria-hidden />}>
            New reward
          </Button>
        }
      />

      <LoadErrors className="mt-4" sources={[rewards, config]} />

      <Alert tone="info" className="mt-4" title="Informational outcomes only">
        Outcomes such as “Try again” are valid segments and must never be disguised as wins. The wheel is
        weighted, not deceptive — configure the odds you intend to honour.
      </Alert>

      <Card className="mt-4">
        <CardHeader icon={Package} title="Reward catalogue" description="Inventory counts are decremented server-side on each award." />
        <CardBody>
          {rewards.loading ? (
            <Skeleton className="h-64" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={allRewards}
              keyOf={(row) => row.id}
              caption="Rewards"
              emptyTitle="No rewards configured"
              emptyDescription="Create a reward before adding it to the wheel."
              emptyAction={<Button onClick={openCreate}>Create the first reward</Button>}
            />
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          icon={Settings2}
          title="Campaign rules"
          description="Saved to `siteSettings/spin`. The server enforces every limit when awarding and executing spins."
          action={
            <Button
              size="sm"
              onClick={() => void saveCampaign()}
              loading={savingCampaign}
              disabled={!campaign || !baseConfig}
              iconLeft={<Save className="size-3.5" aria-hidden />}
            >
              Save rules
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {spinUnconfigured ? (
            <Alert tone="warning" title="Spin campaign not configured yet">
              No spin settings exist. The wheel stays off until you save these rules with the wheel enabled.
            </Alert>
          ) : null}
          {campaignError ? <FieldError>{campaignError}</FieldError> : null}
          {!campaign ? (
            config.loading ? <Skeleton className="h-48" rounded="lg" /> : null
          ) : (
            <>
              <div className="rounded-xl border border-line bg-ivory/50 p-3">
                <Switch
                  checked={campaign.enabled}
                  onChange={(value) => setCampaign({ ...campaign, enabled: value })}
                  label="Wheel enabled"
                  description="When off, customers cannot spin and no referral spins are advertised."
                />
              </div>
              <div>
                <Label htmlFor="spin-qualification">A referral qualifies when the new participant…</Label>
                <Select
                  id="spin-qualification"
                  value={campaign.referralQualification}
                  onChange={(event) =>
                    setCampaign({
                      ...campaign,
                      referralQualification: event.target.value as CampaignDraft["referralQualification"],
                    })
                  }
                >
                  {Object.entries(QUALIFICATION_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <FormRow columns={3}>
                {(
                  [
                    ["spinsPerReferral", "Spins per qualified referral", ""],
                    ["maxReferralsPerAccount", "Max qualified referrals per referrer", ""],
                    ["maxRewardsPerReferrer", "Max referral spins per referrer", "Lifetime total"],
                    ["referralClaimWindowHours", "Referral claim window", "Hours after signup"],
                    ["maxSpinsPerUser", "Max unused spins per account", ""],
                    ["dailySpinLimit", "Spins allowed per day", ""],
                    ["rewardValidDays", "Reward validity", "Days"],
                    ["minAge", "Minimum age", "Years"],
                    ["spinPriceRupees", "Price per paid spin (₹)", "0 = earned spins only"],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div key={key}>
                    <Label htmlFor={`spin-${key}`} hint={hint || undefined}>
                      {label}
                    </Label>
                    <Input
                      id={`spin-${key}`}
                      inputMode="numeric"
                      value={campaign[key]}
                      onChange={(event) => setCampaign({ ...campaign, [key]: event.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                ))}
              </FormRow>
              <FormRow columns={2}>
                <div>
                  <Label htmlFor="spin-start" hint="Optional">
                    Campaign starts
                  </Label>
                  <Input
                    id="spin-start"
                    type="datetime-local"
                    value={campaign.campaignStart}
                    onChange={(event) => setCampaign({ ...campaign, campaignStart: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="spin-end" hint="Optional">
                    Campaign ends
                  </Label>
                  <Input
                    id="spin-end"
                    type="datetime-local"
                    value={campaign.campaignEnd}
                    onChange={(event) => setCampaign({ ...campaign, campaignEnd: event.target.value })}
                  />
                </div>
              </FormRow>
            </>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          icon={Sparkles}
          title="Wheel weighting"
          description="Relative weights determine the probability of each segment. The server performs the weighted selection."
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addSegment} iconLeft={<Plus className="size-3.5" aria-hidden />}>
                Add segment
              </Button>
              <Button
                size="sm"
                onClick={() => void saveWheel()}
                loading={savingSegments}
                iconLeft={<Save className="size-3.5" aria-hidden />}
              >
                Save wheel
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-3">
          {config.loading ? (
            <Skeleton className="h-56" rounded="lg" />
          ) : segments.length ? (
            segments.map((segment) => (
              <div
                key={segment.id}
                className="grid gap-3 rounded-xl border border-line bg-ivory/50 p-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
              >
                <div>
                  <Label htmlFor={`seg-label-${segment.id}`}>Label</Label>
                  <Input
                    id={`seg-label-${segment.id}`}
                    value={segment.label}
                    onChange={(event) => updateSegment(segment.id, { label: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`seg-reward-${segment.id}`}>Reward</Label>
                  <Select
                    id={`seg-reward-${segment.id}`}
                    value={segment.rewardId}
                    onChange={(event) => updateSegment(segment.id, { rewardId: event.target.value })}
                  >
                    {allRewards.map((reward) => (
                      <option key={reward.id} value={reward.id}>
                        {reward.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`seg-weight-${segment.id}`} hint="Relative">
                    Weight
                  </Label>
                  <Input
                    id={`seg-weight-${segment.id}`}
                    inputMode="numeric"
                    className="w-24"
                    value={String(segment.weight)}
                    onChange={(event) =>
                      updateSegment(segment.id, { weight: Math.max(0, Number(event.target.value) || 0) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={`seg-color-${segment.id}`}>Colour</Label>
                  <Input
                    id={`seg-color-${segment.id}`}
                    type="color"
                    value={segment.color}
                    onChange={(event) => updateSegment(segment.id, { color: event.target.value })}
                    className="h-11 w-16 p-1"
                  />
                </div>
                <div className="flex items-end gap-1.5">
                  <Button
                    size="sm"
                    variant={segment.active ? "primary" : "outline"}
                    onClick={() => updateSegment(segment.id, { active: !segment.active })}
                  >
                    {segment.active ? "On" : "Off"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSegment(segment.id)}
                    aria-label="Remove segment"
                  >
                    <Trash2 className="size-3.5 text-brand" aria-hidden />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-[13px] text-muted">
              No segments yet — add at least one.
            </p>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        size="lg"
        dismissible={!saving}
        title={editing ? `Edit ${editing.name}` : "New reward"}
        description="Rewards can be coupons, gifts, free tickets or welcome credits. Nothing is promised in advance."
      >
        <div className="space-y-4">
          {formError ? <FieldError>{formError}</FieldError> : null}

          <FormRow columns={2}>
            <div>
              <Label htmlFor="reward-name" required>
                Name
              </Label>
              <Input
                id="reward-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. ₹50 Festival Coupon"
              />
            </div>
            <div>
              <Label htmlFor="reward-type" required>
                Type
              </Label>
              <Select
                id="reward-type"
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value as RewardType })}
              >
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </FormRow>

          <div>
            <Label htmlFor="reward-description" required>
              Description
            </Label>
            <Textarea
              id="reward-description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              className="min-h-20"
              placeholder="State exactly what the customer receives and any conditions."
            />
          </div>

          <FormRow columns={2}>
            {draft.type === "wallet_credit" ? (
              <div>
                <Label htmlFor="reward-value" required hint="Rupees">
                  Credit value
                </Label>
                <Input
                  id="reward-value"
                  inputMode="decimal"
                  prefix="₹"
                  value={draft.valueRupees}
                  onChange={(event) =>
                    setDraft({ ...draft, valueRupees: event.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="reward-coupon">Coupon / voucher code</Label>
                <Input
                  id="reward-coupon"
                  value={draft.couponCode}
                  onChange={(event) => setDraft({ ...draft, couponCode: event.target.value })}
                  placeholder="Optional"
                />
              </div>
            )}
            <div>
              <Label htmlFor="reward-valid" hint="Days">
                Validity
              </Label>
              <Input
                id="reward-valid"
                inputMode="numeric"
                value={draft.validDays}
                onChange={(event) => setDraft({ ...draft, validDays: event.target.value.replace(/\D/g, "") })}
              />
            </div>
          </FormRow>

          <div>
            <Label htmlFor="reward-inventory" required hint="Total units available">
              Inventory
            </Label>
            <Input
              id="reward-inventory"
              inputMode="numeric"
              value={draft.inventory}
              onChange={(event) => setDraft({ ...draft, inventory: event.target.value.replace(/\D/g, "") })}
            />
          </div>

          <div className="rounded-xl border border-line bg-ivory/50 p-3">
            <Switch
              checked={draft.active}
              onChange={(value) => setDraft({ ...draft, active: value })}
              label="Active"
              description="Inactive rewards stay stored but cannot be awarded."
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing ? "Save changes" : "Create reward"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        tone="danger"
        title={removing ? `Delete “${removing.name}”?` : "Delete reward"}
        description="Past spin records keep the reward name they awarded. Remove the reward from the wheel first if it is still in use."
        confirmLabel="Delete reward"
      />
    </>
  );
}
