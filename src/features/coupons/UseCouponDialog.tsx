import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { callBackend } from "@/lib/backend/callBackend";
import type { GetCouponPinRequest, GetCouponPinResponse } from "@/lib/backend/api";
import { Alert, Button, Dialog, Spinner } from "@/components/ui";
import { formatDateTime } from "@/utils/format";
import type { CouponView } from "./coupon";

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return until ? Math.max(0, Math.round((Date.parse(until) - now) / 1000)) : 0;
}

/**
 * Shows the PIN the shop owner enters to mark this coupon used. The coupon
 * list is live, so the dialog switches to "used" as soon as the shop confirms.
 */
export function UseCouponDialog({ coupon, onClose }: { coupon: CouponView | null; onClose: () => void }) {
  const [pin, setPin] = useState<GetCouponPinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const spinId = coupon?.spinId ?? null;
  const used = Boolean(coupon?.usedAt);
  const secondsLeft = useCountdown(pin?.expiresAt ?? null);

  const load = useCallback(async () => {
    if (!spinId) return;
    setLoading(true);
    setError(null);
    try {
      setPin(await callBackend<GetCouponPinRequest, GetCouponPinResponse>("getCouponPin", { spinId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The PIN could not be created. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [spinId]);

  useEffect(() => {
    setPin(null);
    if (spinId && !used) void load();
  }, [spinId, used, load]);

  const expired = Boolean(pin) && secondsLeft === 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Dialog
      open={Boolean(coupon)}
      onClose={onClose}
      title={used ? "Coupon used" : "Use this coupon"}
      description={coupon ? `${coupon.name} · ${coupon.couponId}` : undefined}
    >
      {used && coupon ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="size-12 text-emerald" aria-hidden />
          <p className="font-display text-[20px] text-ink">Used{coupon.usedShop ? ` at ${coupon.usedShop}` : ""}</p>
          {coupon.usedAt ? <p className="text-[13px] text-muted">{formatDateTime(coupon.usedAt)}</p> : null}
          <Button className="mt-2" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          {error ? (
            <Alert tone="danger" title="No PIN">
              {error}
            </Alert>
          ) : null}
          {loading && !pin ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : pin ? (
            <>
              <p className="text-[13px] text-muted">Show this PIN to the shop. They enter it to mark your coupon used.</p>
              <p
                className={`font-display text-[44px] font-bold tracking-[0.3em] lining-nums tabular-nums ${expired ? "text-muted line-through" : "text-brand"}`}
                aria-live="polite"
              >
                {pin.pin}
              </p>
              <p className="text-[12.5px] text-muted">
                {expired ? "This PIN has expired." : `Expires in ${minutes}:${seconds}. It works only once.`}
              </p>
            </>
          ) : null}
          {expired || error ? (
            <Button
              variant="outline"
              loading={loading}
              onClick={() => void load()}
              iconLeft={<RefreshCw className="size-4" aria-hidden />}
            >
              Get a new PIN
            </Button>
          ) : null}
          <p className="text-[11.5px] leading-relaxed text-muted">
            Only share the PIN at the shop counter. Anyone with the PIN at that shop can use your coupon.
          </p>
        </div>
      )}
    </Dialog>
  );
}
