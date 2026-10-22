import { useEffect, useMemo, useState } from "react";
import { Store } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { couponService } from "@/services/couponService";
import { rewardService } from "@/services/rewardService";
import { callBackend } from "@/lib/backend/callBackend";
import type { SetCouponShopRequest, SetCouponShopResponse } from "@/lib/backend/api";
import type { UserProfile } from "@/types";
import { Badge, Button, FieldError, Input, Label, Skeleton } from "@/components/ui";
import { isCouponReward } from "./coupon";

/** Admin control that turns a customer account into a coupon shop owner. */
export function CouponShopAccess({ user }: { user: UserProfile }) {
  const toast = useToast();
  const shop = useAsync(() => couponService.shop(user.uid), [user.uid]);
  const rewards = useAsync(() => rewardService.rewards(), []);
  const [shopName, setShopName] = useState("");
  const [rewardIds, setRewardIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "remove" | null>(null);

  const couponRewards = useMemo(
    () => (rewards.data ?? []).filter((reward) => isCouponReward(reward.type)),
    [rewards.data],
  );
  const active = Boolean(shop.data?.active);

  useEffect(() => {
    setShopName(shop.data?.shopName ?? "");
    setRewardIds(shop.data?.active ? shop.data.rewardIds : []);
    setError(null);
  }, [shop.data]);

  const toggle = (id: string) =>
    setRewardIds((current) => (current.includes(id) ? current.filter((r) => r !== id) : [...current, id]));

  const save = async (makeActive: boolean) => {
    setError(null);
    if (makeActive && shopName.trim().length < 2) return setError("Enter the shop name.");
    if (makeActive && !rewardIds.length) return setError("Tick at least one coupon this shop can accept.");
    setSaving(makeActive ? "save" : "remove");
    try {
      await callBackend<SetCouponShopRequest, SetCouponShopResponse>(
        "setCouponShop",
        makeActive ? { uid: user.uid, active: true, shopName: shopName.trim(), rewardIds } : { uid: user.uid, active: false },
      );
      toast.success(
        makeActive ? "Coupon shop access saved" : "Coupon shop access removed",
        makeActive ? `${user.fullName} can now open the shop dashboard.` : user.fullName,
      );
      shop.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coupon shop access could not be changed.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-ivory/60 p-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
        <Store className="size-3.5" aria-hidden />
        Coupon shop owner
        {active ? (
          <Badge tone="emerald" className="ml-1">
            Active
          </Badge>
        ) : null}
      </p>
      <p className="mt-2 max-w-xl text-[13px] text-muted">
        A shop owner opens the shop dashboard and enters the PIN a customer shows to mark that customer's coupon as
        used. They can only use coupons you tick here.
      </p>

      {shop.loading || rewards.loading ? (
        <Skeleton className="mt-3 h-24" rounded="lg" />
      ) : (
        <div className="mt-3 space-y-3">
          {error ? <FieldError>{error}</FieldError> : null}
          <div>
            <Label htmlFor={`shop-name-${user.uid}`}>Shop name</Label>
            <Input
              id={`shop-name-${user.uid}`}
              value={shopName}
              maxLength={80}
              onChange={(event) => setShopName(event.target.value)}
              placeholder="e.g. Saagaz Coffee Express"
            />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold text-ink">Coupons this shop accepts</legend>
            {couponRewards.length ? (
              <div className="space-y-1.5">
                {couponRewards.map((reward) => (
                  <label key={reward.id} className="flex items-center gap-2 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      checked={rewardIds.includes(reward.id)}
                      onChange={() => toggle(reward.id)}
                    />
                    {reward.name}
                    {!reward.active ? <span className="text-[11px] text-muted">(inactive)</span> : null}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted">Create a coupon reward in Rewards first.</p>
            )}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={saving === "save"}
              disabled={Boolean(saving) || user.status !== "active"}
              onClick={() => void save(true)}
            >
              {active ? "Save shop access" : "Make coupon shop owner"}
            </Button>
            {active ? (
              <Button
                size="sm"
                variant="danger"
                loading={saving === "remove"}
                disabled={Boolean(saving)}
                onClick={() => void save(false)}
              >
                Remove shop access
              </Button>
            ) : null}
          </div>
          {user.status !== "active" ? (
            <p className="text-[12px] text-muted">Reactivate the account before giving it shop access.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
