import { useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { useToast } from "@/app/ToastProvider";
import { rewardService } from "@/services/rewardService";
import { Button, Card, CardBody } from "@/components/ui";
import { copyText } from "@/utils/clipboard";
import { cn } from "@/utils/cn";

/** Compact "invite friends" card with the customer's referral link, copy and share actions. */
export function ReferralLinkCard({ className }: { className?: string }) {
  const { profile } = useAuth();
  const settings = useSiteSettings();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const code = profile?.referralCode ?? "";
  if (!code) return null;
  const link = rewardService.referralLink(code);
  const whatsappUrl = rewardService.whatsappShareUrl(code, settings.brandName, settings.referralShareMessage);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    if (await copyText(link)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Referral link copied", "Share it with a friend to earn a free spin.");
    } else {
      toast.error("Could not copy", "Open Referrals to copy the link manually.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: settings.brandName,
        text: `Join ${settings.brandName} with my referral code ${code}`,
        url: link,
      });
    } catch {
      /* The customer closed the share sheet. */
    }
  };

  return (
    <Card className={cn("gradient-reward text-ivory", className)}>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-soft">
              <Gift className="size-3.5" aria-hidden />
              Invite friends · earn free spins
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-ivory/80">
              Your code <span className="font-bold tracking-[0.08em] text-ivory">{code}</span>
            </p>
          </div>
          <Link to="/dashboard/referrals" className="shrink-0 text-[12px] font-semibold text-gold-soft hover:underline">
            Details
          </Link>
        </div>

        <button
          type="button"
          onClick={() => void copy()}
          className="block w-full truncate rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-left font-mono text-[12px] text-ivory"
          aria-label="Copy your referral link"
          title={link}
        >
          {link}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="gold"
            onClick={() => void copy()}
            iconLeft={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          {canShare ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void share()}
              iconLeft={<Share2 className="size-4" aria-hidden />}
            >
              Share
            </Button>
          ) : (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="contents">
              <Button size="sm" variant="secondary" iconLeft={<Share2 className="size-4" aria-hidden />}>
                WhatsApp
              </Button>
            </a>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
