import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import type { TransferFundsResponse } from "@/lib/backend/api";
import { formatINR } from "@/utils/money";
import { formatDateTime } from "@/utils/format";

/** Full-screen "payment successful" receipt shown right after a transfer. */
export function PaymentSuccess({
  receipt,
  phoneMasked,
  onDone,
}: {
  receipt: TransferFundsResponse;
  phoneMasked?: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigator.vibrate?.(60);
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Payment successful"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[95] flex flex-col overflow-y-auto bg-gradient-to-b from-[#1d8a55] to-emerald text-white"
    >
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))]">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="grid size-24 place-items-center rounded-full bg-white shadow-[0_0_0_12px_rgb(255_255_255/0.15)]"
          >
            <svg viewBox="0 0 52 52" className="size-14 text-emerald" aria-hidden>
              <motion.path
                d="M14 27 l8 8 l16 -18"
                fill="none"
                stroke="currentColor"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.25, duration: 0.45, ease: "easeOut" }}
              />
            </svg>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.35 }}
          >
            <p className="mt-6 text-[15px] font-semibold text-white/90">Payment successful</p>
            <p className="mt-1 font-display text-[44px] font-bold leading-tight tabular-nums">
              {formatINR(receipt.amountPaise)}
            </p>
            <p className="mt-1 text-[15px]">
              Paid to <span className="font-semibold">{receipt.recipientName}</span>
            </p>
            {phoneMasked ? <p className="text-[13px] text-white/75">{phoneMasked}</p> : null}
            <p className="mt-2 text-[12.5px] text-white/75">{formatDateTime(receipt.createdAt)}</p>
          </motion.div>
        </div>

        <motion.dl
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.35 }}
          className="mt-8 space-y-3 rounded-2xl bg-white p-4 text-[13px] text-ink shadow-lg"
        >
          <div className="border-b border-line pb-3">
            <dt className="text-muted">Transaction ID</dt>
            <dd className="mt-0.5 break-all font-mono text-[11.5px] font-semibold">{receipt.transferId}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Debited from</dt>
            <dd className="text-right font-semibold">Festival wallet</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Wallet balance</dt>
            <dd className="text-right font-semibold tabular-nums">{formatINR(receipt.balancePaise)}</dd>
          </div>
        </motion.dl>

        <div className="mt-auto space-y-3 pt-8">
          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-full bg-white py-3.5 text-[15px] font-bold text-emerald shadow-lg transition hover:bg-white/90"
          >
            Done
          </button>
          <Link
            to="/dashboard/wallet"
            className="block w-full rounded-full border border-white/50 py-3 text-center text-[14px] font-semibold text-white transition hover:bg-white/10"
          >
            View wallet
          </Link>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
