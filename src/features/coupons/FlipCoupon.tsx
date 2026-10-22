import { useMemo, useState } from "react";
import { Download, Gift, MapPin, RotateCw } from "lucide-react";
import { useToast } from "@/app/ToastProvider";
import { Button } from "@/components/ui";
import { cn } from "@/utils/cn";
import { formatDateTime } from "@/utils/format";
import { SITE_HOST, dummyBars, formatMobile } from "@/features/tickets/ticketImage";
import { shortLink, type CouponView } from "./coupon";
import { downloadCouponImage } from "./couponImage";

const notch = "absolute size-5 rounded-full bg-paper";

function DummyBarcode({ seed }: { seed: string }) {
  const { bars, total } = useMemo(() => dummyBars(seed), [seed]);
  return (
    <svg viewBox={`0 0 30 ${total}`} preserveAspectRatio="none" className="h-full w-8" aria-hidden focusable="false">
      {bars.map((bar) => (
        <rect key={bar.y} x={0} y={bar.y} width={30} height={bar.h} fill="#202522" />
      ))}
    </svg>
  );
}

export function CouponDownloadButton({
  coupon,
  holderName,
  holderPhone,
}: {
  coupon: CouponView;
  holderName?: string;
  holderPhone?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadCouponImage(coupon, { name: holderName, phone: holderPhone });
    } catch (error) {
      toast.error("Download failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={() => void download()}
      iconLeft={<Download className="size-3.5" aria-hidden />}
    >
      Download
    </Button>
  );
}

export function FlipCoupon({
  coupon,
  holderName,
  holderPhone,
}: {
  coupon: CouponView;
  holderName?: string;
  holderPhone?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setFlipped((value) => !value)}
      aria-pressed={flipped}
      aria-label={`${coupon.name} coupon ${coupon.couponId}. Tap to ${flipped ? "see the coupon" : "see where to redeem it"}.`}
      className="group block w-full rounded-2xl text-left perspective-[1200px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
    >
      <div
        className={cn(
          "grid transition-transform duration-500 transform-3d motion-reduce:transition-none",
          flipped && "rotate-y-180",
        )}
      >
        <div
          aria-hidden={flipped}
          className="gradient-reward relative flex min-h-[188px] overflow-hidden rounded-2xl text-ivory shadow-[var(--shadow-card)] backface-hidden [grid-area:1/1]"
        >
          <div className="min-w-0 flex-1 p-4">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold-soft">
              <Gift className="size-3.5" aria-hidden />
              Spin reward coupon
            </p>
            <p className="mt-1 truncate font-display text-[15px] leading-tight">{coupon.name}</p>
            <p className="mt-2 font-display text-[26px] font-bold leading-none tracking-[0.06em] lining-nums text-gold-soft">
              {coupon.couponId}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
              <div className="min-w-0">
                <dt className="text-ivory/60">Winner</dt>
                <dd className="truncate font-semibold">{holderName || "You"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ivory/60">Mobile number</dt>
                <dd className="truncate font-semibold tabular-nums">{holderPhone ? formatMobile(holderPhone) : "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ivory/60">Won on</dt>
                <dd className="font-semibold">{formatDateTime(coupon.wonAt)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ivory/60">Valid until</dt>
                <dd className="font-semibold">{coupon.expiresAt ? formatDateTime(coupon.expiresAt) : "No expiry"}</dd>
              </div>
            </dl>
          </div>

          <div className="relative flex w-[88px] shrink-0 flex-col items-center justify-center gap-2 border-l-2 border-dashed border-ivory/30 px-2 text-center">
            <span className={cn(notch, "-left-[11px] -top-2.5")} aria-hidden />
            <span className={cn(notch, "-bottom-2.5 -left-[11px]")} aria-hidden />
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
                coupon.expired ? "bg-status-pending-bg text-status-pending" : "bg-emerald-soft text-emerald",
              )}
            >
              {coupon.expired ? "Expired" : "Valid"}
            </span>
            <span className="mt-1 flex flex-col items-center gap-1 text-[10.5px] font-semibold leading-tight text-ivory/80">
              <RotateCw className="size-4 transition-transform group-hover:rotate-90" aria-hidden />
              Tap for location
            </span>
          </div>
        </div>

        <div
          aria-hidden={!flipped}
          className="relative flex min-h-[188px] overflow-hidden rounded-2xl border-2 border-dashed border-gold bg-[#fdf3d4] text-ink shadow-[var(--shadow-card)] backface-hidden rotate-y-180 [grid-area:1/1]"
        >
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3 py-3 text-center">
            <p className="font-display text-[17px] font-bold uppercase leading-tight text-maroon">Where to redeem</p>
            <p className="mt-1.5 flex items-start gap-1 text-[12px] font-semibold leading-snug">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
              <span className="line-clamp-3">{coupon.location || "Ask the organiser for the redemption place."}</span>
            </p>
            {coupon.link ? (
              <p className="mt-1 max-w-full truncate text-[11.5px] font-semibold text-brand">{shortLink(coupon.link)}</p>
            ) : null}
            {coupon.terms ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{coupon.terms}</p>
            ) : null}
            {coupon.code ? (
              <p className="mt-1 text-[12px] font-extrabold tracking-[0.08em] text-brand">Code: {coupon.code}</p>
            ) : null}
            <p className="mt-1.5 text-[12px] font-extrabold tracking-[0.02em] text-brand">{SITE_HOST}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
              {coupon.couponId} ·
              <RotateCw className="size-3" aria-hidden />
              Tap to see coupon
            </p>
          </div>

          <div className="relative flex w-[60px] shrink-0 items-center justify-center border-l-2 border-dashed border-gold py-3">
            <span className={cn(notch, "-left-[11px] -top-3")} aria-hidden />
            <span className={cn(notch, "-bottom-3 -left-[11px]")} aria-hidden />
            <div className="h-full max-h-[140px] rounded-md bg-white p-1.5 shadow-sm">
              <DummyBarcode seed={coupon.couponId} />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
