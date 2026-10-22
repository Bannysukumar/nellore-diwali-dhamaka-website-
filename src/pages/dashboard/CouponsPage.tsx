import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, KeyRound, TicketPercent } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useCollection } from "@/hooks/useCollection";
import { useAuth } from "@/app/AuthProvider";
import { rewardService } from "@/services/rewardService";
import type { Reward, SpinTransaction } from "@/types";
import { Button, Card, CardBody, EmptyState, LoadErrors, Segmented, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyViewNotice, useReadOnlyView } from "@/features/auth/ViewAs";
import { couponState, isCouponReward, toCouponView, type CouponState } from "@/features/coupons/coupon";
import { CouponDownloadButton, FlipCoupon } from "@/features/coupons/FlipCoupon";
import { UseCouponDialog } from "@/features/coupons/UseCouponDialog";

type FilterValue = CouponState | "all";

const EMPTY_LABEL: Record<FilterValue, string> = {
  valid: "No coupons ready to use",
  used: "No used coupons",
  expired: "No expired coupons",
  all: "No coupons",
};

export function CouponsPage() {
  const { uid, profile } = useAuth();
  const readOnly = useReadOnlyView();
  const [filter, setFilter] = useState<FilterValue>("valid");
  const [usingId, setUsingId] = useState<string | null>(null);

  const spins = useCollection<SpinTransaction>(
    "spinTransactions",
    {
      where: [{ field: "uid", op: "==", value: uid ?? "" }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit: 300,
    },
    { enabled: Boolean(uid) },
  );
  const rewards = useAsync(() => rewardService.rewards(), []);

  const coupons = useMemo(() => {
    const byId = new Map<string, Reward>((rewards.data ?? []).map((reward) => [reward.id, reward]));
    return spins.data
      .filter((spin) => spin.status === "awarded" && isCouponReward(spin.rewardType))
      .map((spin) => toCouponView(spin, byId.get(spin.rewardId)));
  }, [spins.data, rewards.data]);

  const visible = coupons.filter((coupon) => filter === "all" || couponState(coupon) === filter);
  const countOf = (state: CouponState) => coupons.filter((coupon) => couponState(coupon) === state).length;
  const using = coupons.find((coupon) => coupon.spinId === usingId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Coupons"
        icon={TicketPercent}
        title="Your spin coupons"
        description="Coupons and gifts you won on the spin wheel. At the shop, tap “Use coupon” and show the PIN — the shop enters it to mark the coupon used."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Coupons" },
        ]}
        actions={
          <Link to="/dashboard/spin">
            <Button variant="gold">Spin the wheel</Button>
          </Link>
        }
      />

      <ReadOnlyViewNotice action="Using a coupon" className="mt-5" />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "valid", label: `Ready to use (${countOf("valid")})` },
            { value: "used", label: `Used (${countOf("used")})` },
            { value: "expired", label: "Expired" },
            { value: "all", label: "All" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter coupons"
        />
      </div>

      <LoadErrors className="mt-4" sources={[spins, rewards]} title="Your coupons could not be loaded" />

      {spins.loading || rewards.loading ? (
        <Skeleton className="mt-4 h-56" rounded="lg" />
      ) : spins.error ? null : !coupons.length ? (
        <div className="mt-5">
          <EmptyState
            title="No coupons yet"
            description="When you win a coupon or gift on the spin wheel, it appears here with the shop location."
            action={
              <Link to="/dashboard/spin">
                <Button>Go to the spin wheel</Button>
              </Link>
            }
          />
        </div>
      ) : !visible.length ? (
        <div className="mt-5">
          <EmptyState
            title={EMPTY_LABEL[filter]}
            description="Switch the filter to see your other coupons."
            action={
              <Button variant="outline" onClick={() => setFilter("all")}>
                Show all coupons
              </Button>
            }
          />
        </div>
      ) : (
        <Card className="mt-5">
          <CardBody className="space-y-4">
            <p className="text-[12px] text-muted">
              Tap a coupon to flip it and see the shop location. Download saves both sides as an image.
            </p>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map((coupon) => (
                <div key={coupon.spinId} className="space-y-1.5">
                  <FlipCoupon coupon={coupon} holderName={profile?.fullName} holderPhone={profile?.phone} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {coupon.link ? (
                      <a
                        href={coupon.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                        Open location
                      </a>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-2">
                      {couponState(coupon) === "valid" ? (
                        <Button
                          size="sm"
                          variant="gold"
                          disabled={readOnly}
                          onClick={() => setUsingId(coupon.spinId)}
                          iconLeft={<KeyRound className="size-3.5" aria-hidden />}
                        >
                          Use coupon
                        </Button>
                      ) : null}
                      <CouponDownloadButton coupon={coupon} holderName={profile?.fullName} holderPhone={profile?.phone} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <UseCouponDialog coupon={using} onClose={() => setUsingId(null)} />
    </>
  );
}
