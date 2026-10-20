import { useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Phone, Search, Send, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
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

export function SendMoneyPage() {
  const { uid } = useAuth();
  const readOnly = useReadOnlyView();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [recipient, setRecipient] = useState<FindTransferRecipientResponse | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [receipt, setReceipt] = useState<TransferFundsResponse | null>(null);
  const requestId = useRef(newId("trf"));

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

  const find = async () => {
    if (readOnly) return;
    setError(null);
    setRecipient(null);
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Enter the receiver's 10-digit mobile number.");
      return;
    }
    setFinding(true);
    try {
      setRecipient(
        await callBackend<FindTransferRecipientRequest, FindTransferRecipientResponse>("findTransferRecipient", {
          phone,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not look up that number.");
    } finally {
      setFinding(false);
    }
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

  return (
    <>
      <PageHeader
        eyebrow="Wallet"
        icon={Send}
        title="Send money"
        description="Transfer wallet balance to another registered customer using their mobile number. Transfers are instant and cannot be reversed."
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

          {receipt ? (
            <Card>
              <CardHeader icon={CheckCircle2} title="Transfer complete" />
              <CardBody className="space-y-4">
                <dl className="space-y-2 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
                  <Row label="Sent to" value={receipt.recipientName} />
                  <Row label="Amount" value={formatINR(receipt.amountPaise)} />
                  <Row label="Your new balance" value={formatINR(receipt.balancePaise)} />
                  <Row label="Reference" value={<span className="font-mono text-[12px]">{receipt.transferId}</span>} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={reset}>Send another</Button>
                  <Link to="/dashboard/wallet">
                    <Button variant="outline">View wallet</Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader icon={Send} title="Who are you sending to?" />
              <CardBody className="space-y-4">
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
                      onChange={(event) => {
                        setPhone(event.target.value.replace(/[^\d+ ]/g, ""));
                        setRecipient(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void find();
                      }}
                    />
                    <Button
                      variant="outline"
                      loading={finding}
                      disabled={readOnly}
                      onClick={() => void find()}
                      iconLeft={<Search className="size-4" aria-hidden />}
                    >
                      Find
                    </Button>
                  </div>
                  <p className="text-[12px] text-muted">
                    Only registered customers can receive money. Administrator accounts cannot.
                  </p>
                </div>

                {recipient ? (
                  <>
                    <div className="flex items-center gap-3 rounded-xl border border-emerald/30 bg-emerald/5 p-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald/10 text-emerald">
                        <UserRound className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{recipient.maskedName}</p>
                        <p className="text-[12px] text-muted">{recipient.phoneMasked}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="transfer-amount" required hint="Rupees">
                          Amount
                        </Label>
                        <Input
                          id="transfer-amount"
                          inputMode="decimal"
                          prefix="₹"
                          placeholder="100"
                          value={amountInput}
                          invalid={Boolean(amountInput) && (!amountValid || overBalance)}
                          onChange={(event) => setAmountInput(event.target.value.replace(/[^\d.]/g, ""))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="transfer-note" hint="Optional">
                          Note
                        </Label>
                        <Input
                          id="transfer-note"
                          maxLength={140}
                          placeholder="e.g. For Diwali tickets"
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                        />
                      </div>
                    </div>

                    <Button block size="lg" disabled={!amountInput} onClick={openConfirm}>
                      Send {amountValid ? formatINR(amountPaise) : "money"}
                    </Button>
                  </>
                ) : null}
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
        title="Confirm transfer"
        description="The amount is moved from your wallet immediately."
        confirmLabel={`Send ${amountValid ? formatINR(amountPaise) : ""}`}
        tone="success"
        busy={sending}
      >
        <dl className="space-y-2 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
          <Row label="To" value={recipient ? `${recipient.maskedName} · ${recipient.phoneMasked}` : "—"} />
          <Row label="Amount" value={formatINR(amountPaise)} />
          {note.trim() ? <Row label="Note" value={note.trim()} /> : null}
          <Row label="Balance after" value={formatINR(Math.max(0, balance - amountPaise))} />
        </dl>
      </ConfirmDialog>
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
