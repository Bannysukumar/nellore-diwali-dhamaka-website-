import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, Store } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useCollection } from "@/hooks/useCollection";
import { useAuth } from "@/app/AuthProvider";
import { couponService } from "@/services/couponService";
import { rewardService } from "@/services/rewardService";
import { callBackend } from "@/lib/backend/callBackend";
import type { RedeemCouponPinRequest, RedeemCouponPinResponse } from "@/lib/backend/api";
import type { CouponRedemption } from "@/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  FieldError,
  Input,
  Label,
  LoadErrors,
  Skeleton,
  StatCard,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyViewNotice, useReadOnlyView } from "@/features/auth/ViewAs";
import { formatDateTime, formatNumber } from "@/utils/format";

const istDay = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

export function ShopDashboardPage() {
  const { uid } = useAuth();
  const readOnly = useReadOnlyView();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<RedeemCouponPinResponse | null>(null);

  const shop = useAsync(async () => (uid ? await couponService.shop(uid) : null), [uid], { enabled: Boolean(uid) });
  const isShop = Boolean(shop.data?.active);
  const rewards = useAsync(() => rewardService.rewards(), []);
  const redemptions = useCollection<CouponRedemption>(
    "couponRedemptions",
    {
      where: [{ field: "shopUid", op: "==", value: uid ?? "" }],
      orderBy: [{ field: "redeemedAt", dir: "desc" }],
      limit: 200,
    },
    { enabled: Boolean(uid) && isShop },
  );

  const accepted = useMemo(
    () => (rewards.data ?? []).filter((reward) => shop.data?.rewardIds.includes(reward.id)),
    [rewards.data, shop.data],
  );
  const today = istDay(new Date().toISOString());
  const usedToday = redemptions.data.filter((row) => istDay(row.redeemedAt) === today).length;

  const redeem = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLast(null);
    if (!/^\d{6}$/.test(pin)) {
      setError("Enter the 6-digit PIN shown on the customer's phone.");
      return;
    }
    setBusy(true);
    try {
      setLast(await callBackend<RedeemCouponPinRequest, RedeemCouponPinResponse>("redeemCouponPin", { pin }));
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The coupon could not be marked as used.");
    } finally {
      setBusy(false);
    }
  };

  const columns: Array<Column<CouponRedemption>> = [
    {
      key: "when",
      header: "Used at",
      render: (row) => <span className="whitespace-nowrap text-muted">{formatDateTime(row.redeemedAt)}</span>,
    },
    {
      key: "coupon",
      header: "Coupon",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold tracking-[0.06em] text-brand">{row.couponId}</p>
          <p className="truncate text-[12px] text-ink">{row.rewardName}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.customerName}</p>
          <p className="text-[11px] text-muted">{row.customerPhoneMasked}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="page py-6">
      <PageHeader
        eyebrow="Shop dashboard"
        icon={Store}
        title={shop.data?.active ? shop.data.shopName : "Coupon shop dashboard"}
        description="Customers show a 6-digit PIN from their Coupons page. Enter it here to mark that coupon as used."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Shop dashboard" },
        ]}
      />

      <ReadOnlyViewNotice action="Marking coupons as used" className="mt-5" />
      <LoadErrors className="mt-4" sources={[shop, rewards, redemptions]} title="The shop dashboard could not be loaded" />

      {shop.loading ? (
        <Skeleton className="mt-5 h-48" rounded="lg" />
      ) : shop.error ? null : !isShop ? (
        <div className="mt-5">
          <EmptyState
            title="This page is for coupon shop owners"
            description="If you run a shop that accepts Diwali Dhamaka coupons, ask the organiser to give your account coupon shop access."
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <Card>
              <CardHeader icon={KeyRound} title="Mark a coupon as used" description="Each PIN works once and expires after 10 minutes." />
              <CardBody>
                <form onSubmit={(event) => void redeem(event)} className="space-y-3">
                  {error ? <FieldError>{error}</FieldError> : null}
                  <div>
                    <Label htmlFor="coupon-pin" required>
                      Coupon PIN
                    </Label>
                    <Input
                      id="coupon-pin"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="••••••"
                      className="text-center font-display text-[28px] tracking-[0.4em] tabular-nums"
                    />
                  </div>
                  <Button type="submit" block size="lg" loading={busy} disabled={readOnly || pin.length !== 6}>
                    Mark coupon as used
                  </Button>
                </form>

                {last ? (
                  <Alert tone="success" className="mt-4" title={`Coupon ${last.couponId} marked as used`}>
                    {last.rewardName} for {last.customerName}
                    {last.customerPhoneMasked ? ` (${last.customerPhoneMasked})` : ""} ·{" "}
                    {formatDateTime(last.redeemedAt)}. Give the customer their reward.
                  </Alert>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Coupons used at your shop" description="Newest first." />
              <CardBody>
                {redemptions.loading ? (
                  <Skeleton className="h-40" rounded="lg" />
                ) : (
                  <DataTable
                    columns={columns}
                    rows={redemptions.data}
                    keyOf={(row) => row.spinId}
                    emptyTitle="No coupons used yet"
                    emptyDescription="Coupons you mark as used appear here."
                  />
                )}
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Used today" value={formatNumber(usedToday)} tone="gold" />
              <StatCard label="Used in total" value={formatNumber(redemptions.data.length)} />
            </div>
            <Card>
              <CardHeader title="Coupons you accept" />
              <CardBody>
                {accepted.length ? (
                  <ul className="space-y-2">
                    {accepted.map((reward) => (
                      <li key={reward.id} className="rounded-xl border border-line bg-ivory/50 p-2.5">
                        <p className="text-[13px] font-semibold text-ink">{reward.name}</p>
                        {reward.couponLocation ? (
                          <p className="text-[11.5px] leading-snug text-muted">{reward.couponLocation}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">No coupons are linked to your shop yet.</p>
                )}
                <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                  Only coupons for these rewards can be used here. A PIN for any other coupon is refused.
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
