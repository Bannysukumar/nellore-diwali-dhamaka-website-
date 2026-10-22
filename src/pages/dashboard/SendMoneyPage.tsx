import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Phone, QrCode, ScanLine, Search, Send, ShieldCheck, Wallet } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/ToastProvider";
import { callBackend } from "@/lib/backend/callBackend";
import type {
  FindTransferRecipientRequest,
  FindTransferRecipientResponse,
  TransferFundsRequest,
  TransferFundsResponse,
} from "@/lib/backend/api";
import { walletService } from "@/services/walletService";
import { ReadOnlyViewNotice, useReadOnlyView } from "@/features/auth/ViewAs";
import { MyPayQrDialog } from "@/features/transfers/MyPayQrDialog";
import { PaymentSuccess } from "@/features/transfers/PaymentSuccess";
import { QrScanner } from "@/features/transfers/QrScanner";
import { parsePayQr, tenDigitMobile } from "@/features/transfers/payQr";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Input,
  Label,
  LoadErrors,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, parseRupeesToPaise } from "@/utils/money";
import { newId } from "@/utils/id";

const MIN_TRANSFER_PAISE = 100;
const MAX_TRANSFER_PAISE = 5_000_000;

function initials(name: string): string {
  return name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function SendMoneyPage() {
  const { uid, isAdmin } = useAuth();
  const readOnly = useReadOnlyView();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [phone, setPhone] = useState("");
  const [recipient, setRecipient] = useState<FindTransferRecipientResponse | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [myQrOpen, setMyQrOpen] = useState(false);
  const [receipt, setReceipt] = useState<TransferFundsResponse | null>(null);
  const requestId = useRef(newId("trf"));
  const amountRef = useRef<HTMLInputElement>(null);

  const wallet = useAsync(
    async () => (uid ? await walletService.account(uid) : null),
    [uid, receipt?.transferId],
    { enabled: Boolean(uid) },
  );
  const balance = wallet.data?.balancePaise ?? 0;
  const amountPaise = parseRupeesToPaise(amountInput || "0");
  const amountValid =
    Number.isInteger(amountPaise) && amountPaise >= MIN_TRANSFER_PAISE && amountPaise <= MAX_TRANSFER_PAISE;
  const overBalance = Boolean(wallet.data) && amountPaise > balance;

  const find = useCallback(
    async (number: string) => {
      if (readOnly) return;
      setError(null);
      setRecipient(null);
      if (!tenDigitMobile(number)) {
        setError("Enter the receiver's 10-digit mobile number.");
        return;
      }
      setFinding(true);
      try {
        setRecipient(
          await callBackend<FindTransferRecipientRequest, FindTransferRecipientResponse>("findTransferRecipient", {
            phone: number,
          }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not look up that number.");
      } finally {
        setFinding(false);
      }
    },
    [readOnly],
  );

  const scannedTo = searchParams.get("to");
  const openScanner = searchParams.get("scan") === "1";
  useEffect(() => {
    if (!openScanner) return;
    setSearchParams({}, { replace: true });
    if (!readOnly) setScannerOpen(true);
  }, [openScanner, readOnly, setSearchParams]);

  useEffect(() => {
    if (!scannedTo) return;
    setSearchParams({}, { replace: true });
    const mobile = tenDigitMobile(scannedTo);
    if (!mobile) {
      setError("That QR link does not contain a valid mobile number.");
      return;
    }
    setPhone(mobile);
    void find(mobile);
  }, [scannedTo, setSearchParams, find]);

  useEffect(() => {
    if (recipient) amountRef.current?.focus();
  }, [recipient]);

  const onScan = (text: string): string | null => {
    const parsed = parsePayQr(text);
    if (!parsed.ok) return parsed.reason;
    setScannerOpen(false);
    setPhone(parsed.mobile);
    void find(parsed.mobile);
    return null;
  };

  const openConfirm = () => {
    setError(null);
    if (!amountValid) {
      setError(`Enter an amount between ${formatINR(MIN_TRANSFER_PAISE)} and ${formatINR(MAX_TRANSFER_PAISE)}.`);
      return;
    }
    if (overBalance) {
      setError(`You only have ${formatINR(balance)} in your wallet.`);
      return;
    }
    setConfirmOpen(true);
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await callBackend<TransferFundsRequest, TransferFundsResponse>("transferFunds", {
        requestId: requestId.current,
        toPhone: phone,
        amountPaise,
        note: note.trim() || undefined,
      });
      setReceipt(result);
      setConfirmOpen(false);
      toast.success("Money sent", `${formatINR(result.amountPaise)} sent to ${result.recipientName}.`);
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : "The transfer could not be completed.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    requestId.current = newId("trf");
    setPhone("");
    setRecipient(null);
    setAmountInput("");
    setNote("");
    setReceipt(null);
    setError(null);
  };

  const changeReceiver = () => {
    setRecipient(null);
    setAmountInput("");
    setNote("");
    setError(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="Wallet"
        icon={Send}
        title="Send money"
        description="Scan a customer's QR or enter their mobile number to transfer wallet balance. Transfers are instant and cannot be reversed."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Send money" },
        ]}
        actions={
          <Link to="/dashboard/wallet">
            <Button variant="outline">Wallet &amp; ledger</Button>
          </Link>
        }
      />

      <LoadErrors className="mt-5" sources={[wallet]} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <ReadOnlyViewNotice action="Sending money" />
          {error ? (
            <Alert tone="danger" title="We could not continue">
              {error}
            </Alert>
          ) : null}

          {recipient ? (
            <Card>
              <CardBody className="space-y-5">
                <button
                  type="button"
                  onClick={changeReceiver}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Change receiver
                </button>

                <div className="flex flex-col items-center text-center">
                  <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-brand to-maroon font-display text-xl font-bold text-white shadow-[var(--shadow-card)]">
                    {initials(recipient.maskedName) || "?"}
                  </span>
                  <p className="mt-3 text-[13px] text-muted">Paying</p>
                  <p className="font-display text-xl text-ink">{recipient.maskedName}</p>
                  <p className="text-[12.5px] text-muted">{recipient.phoneMasked}</p>
                </div>

                <div className="mx-auto w-full max-w-xs">
                  <label htmlFor="transfer-amount" className="sr-only">
                    Amount in rupees
                  </label>
                  <div
                    className={`flex items-center justify-center gap-1 border-b-2 pb-1 transition ${
                      amountInput && (!amountValid || overBalance) ? "border-status-booked" : "border-line-strong focus-within:border-brand"
                    }`}
                  >
                    <span className="font-display text-[34px] font-bold text-ink">₹</span>
                    <input
                      ref={amountRef}
                      id="transfer-amount"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={amountInput}
                      onChange={(event) => setAmountInput(event.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") openConfirm();
                      }}
                      className="min-w-0 bg-transparent font-display text-[40px] font-bold tabular-nums text-ink placeholder:text-muted/40 focus:outline-none"
                      style={{ width: `${Math.max(1, amountInput.length) + 0.3}ch` }}
                    />
                  </div>
                  <p className={`mt-2 text-center text-[12px] ${overBalance ? "font-semibold text-status-booked" : "text-muted"}`}>
                    {overBalance
                      ? `Not enough balance. You have ${formatINR(balance)}.`
                      : `Wallet balance: ${wallet.loading || wallet.error ? "—" : formatINR(balance)}`}
                  </p>
                </div>

                <div className="mx-auto w-full max-w-sm">
                  <Input
                    id="transfer-note"
                    aria-label="Add a note"
                    maxLength={140}
                    placeholder="Add a note (optional)"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="text-center"
                  />
                </div>

                <Button block size="lg" disabled={!amountInput || readOnly} onClick={openConfirm}>
                  Pay {amountValid ? formatINR(amountPaise) : ""}
                </Button>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader icon={Send} title="Who are you paying?" />
              <CardBody className="space-y-5">
                <div className={`grid gap-3 ${isAdmin ? "grid-cols-1" : "grid-cols-2"}`}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setError(null);
                      setScannerOpen(true);
                    }}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-brand to-maroon px-3 py-5 text-white shadow-[var(--shadow-card)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ScanLine className="size-8" aria-hidden />
                    <span className="text-[14px] font-bold">Scan QR</span>
                    <span className="text-[11.5px] text-white/80">Scan &amp; pay</span>
                  </button>
                  {!isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setMyQrOpen(true)}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-gold/50 bg-gold-soft/40 px-3 py-5 text-maroon shadow-[var(--shadow-card)] transition hover:bg-gold-soft/70"
                    >
                      <QrCode className="size-8" aria-hidden />
                      <span className="text-[14px] font-bold">My QR</span>
                      <span className="text-[11.5px] text-muted">Receive money</span>
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wide text-muted">
                  <span className="h-px flex-1 bg-line" />
                  or enter mobile number
                  <span className="h-px flex-1 bg-line" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="transfer-phone" required>
                    Receiver's mobile number
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="transfer-phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder="90000 00000"
                      prefix={<Phone className="size-4" aria-hidden />}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value.replace(/[^\d+ ]/g, ""))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void find(phone);
                      }}
                    />
                    <Button
                      variant="outline"
                      loading={finding}
                      disabled={readOnly}
                      onClick={() => void find(phone)}
                      iconLeft={<Search className="size-4" aria-hidden />}
                    >
                      Find
                    </Button>
                  </div>
                  <p className="text-[12px] text-muted">
                    Only registered customers can receive money. Administrator accounts cannot.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="side-panel space-y-4">
          <Card>
            <CardHeader icon={Wallet} title="Available balance" />
            <CardBody>
              <p className="font-display text-[26px] font-bold tabular-nums text-emerald">
                {wallet.loading || wallet.error ? "—" : formatINR(balance)}
              </p>
              <Link to="/dashboard/add-money" className="mt-1 inline-flex text-[12.5px] font-semibold text-brand hover:underline">
                Add money
              </Link>
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={ShieldCheck} title="Before you send" />
            <CardBody className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
              <p>• Check the receiver's name before confirming. Transfers cannot be reversed.</p>
              <p>
                • Limits: {formatINR(MIN_TRANSFER_PAISE)} to {formatINR(MAX_TRANSFER_PAISE)} per transfer, up to 10
                transfers an hour.
              </p>
              <p>• Never send money to someone who contacts you claiming to be from support.</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void send()}
        title={`Pay ${amountValid ? formatINR(amountPaise) : ""}?`}
        description="The amount leaves your wallet immediately and cannot be reversed."
        confirmLabel={`Confirm & pay ${amountValid ? formatINR(amountPaise) : ""}`}
        tone="success"
        busy={sending}
      >
        <dl className="space-y-2 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
          <Row label="To" value={recipient ? recipient.maskedName : "—"} />
          <Row label="Mobile" value={recipient?.phoneMasked ?? "—"} />
          <Row label="Amount" value={formatINR(amountPaise)} />
          {note.trim() ? <Row label="Note" value={note.trim()} /> : null}
          <Row label="Balance after" value={formatINR(Math.max(0, balance - amountPaise))} />
        </dl>
      </ConfirmDialog>

      <QrScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDecode={onScan} />
      <MyPayQrDialog open={myQrOpen} onClose={() => setMyQrOpen(false)} />
      {receipt ? <PaymentSuccess receipt={receipt} phoneMasked={recipient?.phoneMasked} onDone={reset} /> : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[65%] text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}
