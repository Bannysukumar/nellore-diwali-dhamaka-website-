import { useState } from "react";
import { ArrowDown, ArrowUp, Navigation, RotateCcw, Save } from "lucide-react";
import { useSettings } from "@/app/SettingsProvider";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { describeStoreError } from "@/lib/backend";
import { contentService } from "@/services/contentService";
import { adminService } from "@/services/adminService";
import { BOTTOM_NAV_ITEMS } from "@/components/layout/BottomNav";
import {
  BOTTOM_NAV_KEYS,
  BOTTOM_NAV_LABELS,
  MIN_VISIBLE_NAV_ITEMS,
  resolveBottomNav,
} from "@/features/navigation/bottomNav";
import type { BottomNavSetting } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Switch,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/utils/cn";

export function AdminNavigationPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const { bottomNav } = useSettings();
  const [draft, setDraft] = useState<BottomNavSetting[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = draft ?? resolveBottomNav(bottomNav);
  const shown = items.filter((item) => item.visible);
  const tooFew = shown.length < MIN_VISIBLE_NAV_ITEMS;

  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setDraft(next);
  };
  const setVisible = (index: number, visible: boolean) =>
    setDraft(
      items.map((item, i) => (i === index ? { ...item, visible } : item)),
    );

  const save = async () => {
    if (tooFew) return;
    setError(null);
    setSaving(true);
    try {
      await contentService.saveBottomNav(items);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "navigation.update",
        entity: "siteSettings",
        entityId: "navigation",
        note: shown.map((item) => BOTTOM_NAV_LABELS[item.key]).join(" · "),
      });
      toast.success(
        "Bottom bar saved",
        "Customers see the new order straight away.",
      );
      setDraft(null);
    } catch (err) {
      setError(describeStoreError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Content"
        icon={Navigation}
        title="Mobile bottom bar"
        description="Choose the order of the tabs in the bar at the bottom of the phone screen, and which ones appear. Changes reach open phones without a redeploy."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDraft(BOTTOM_NAV_KEYS.map((key) => ({ key, visible: true })))
              }
              iconLeft={<RotateCcw className="size-4" aria-hidden />}
            >
              Default order
            </Button>
            <Button
              onClick={() => void save()}
              loading={saving}
              disabled={draft === null || tooFew}
              iconLeft={<Save className="size-4" aria-hidden />}
            >
              Save order
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert tone="danger" title="Not saved" className="mt-5">
          {error}
        </Alert>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Tab order"
            description="Position 1 is the left-most tab. Use the arrows to move a tab; switch it off to hide it."
          />
          <CardBody>
            <ol className="space-y-2">
              {items.map((item, index) => {
                const { icon: Icon } = BOTTOM_NAV_ITEMS[item.key];
                const position = shown.indexOf(item) + 1;
                return (
                  <li
                    key={item.key}
                    className={cn(
                      "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-paper px-3 py-2.5",
                      !item.visible && "opacity-60",
                    )}
                  >
                    <div className="flex min-w-[9rem] flex-1 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ivory font-display text-[14px] font-bold text-brand">
                        {item.visible ? position : "–"}
                      </span>
                      <Icon className="size-5 shrink-0 text-ink" aria-hidden />
                      <span className="font-semibold text-ink">
                        {BOTTOM_NAV_LABELS[item.key]}
                      </span>
                      {!item.visible ? (
                        <Badge tone="neutral">Hidden</Badge>
                      ) : null}
                    </div>
                    <Switch
                      checked={item.visible}
                      onChange={(visible) => setVisible(index, visible)}
                      label="Show"
                    />
                    <div className="ml-auto flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        aria-label={`Move ${BOTTOM_NAV_LABELS[item.key]} left`}
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={index === items.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={`Move ${BOTTOM_NAV_LABELS[item.key]} right`}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {tooFew ? (
              <Alert
                tone="warning"
                title="Show at least three tabs"
                className="mt-3"
              >
                The bar needs at least {MIN_VISIBLE_NAV_ITEMS} tabs so customers
                can always reach Home, booking and their account.
              </Alert>
            ) : null}
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader
            title="Preview"
            description="How the bar looks on a phone."
          />
          <CardBody>
            <div className="overflow-hidden rounded-2xl border border-line bg-paper">
              <div
                className="grid border-t border-line"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(shown.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {shown.map((item) => {
                  const { icon: Icon, highlight } = BOTTOM_NAV_ITEMS[item.key];
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-semibold",
                        highlight ? "text-gold-deep" : "text-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-8 place-items-center rounded-full",
                          highlight &&
                            "bg-gradient-to-br from-gold to-gold-deep text-white",
                        )}
                      >
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      {BOTTOM_NAV_LABELS[item.key]}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
