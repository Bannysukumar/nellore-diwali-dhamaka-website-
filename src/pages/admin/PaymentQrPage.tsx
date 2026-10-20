import { useState } from "react";
import { ImageIcon, Pencil, Plus, QrCode, Trash2, Upload } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { store } from "@/lib/backend";
import { walletService } from "@/services/walletService";
import { uploadImage, validateImage } from "@/services/storageService";
import { adminService } from "@/services/adminService";
import type { PaymentQrCode } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dialog,
  FieldError,
  FormRow,
  Input,
  Label,
  LoadErrors,
  Skeleton,
  Switch,
  Textarea,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/utils/format";

interface QrDraft {
  label: string;
  payeeName: string;
  upiId: string;
  appHint: string;
  notes: string;
  active: boolean;
  imageUrl: string;
  imagePath: string;
}

const EMPTY: QrDraft = {
  label: "",
  payeeName: "",
  upiId: "",
  appHint: "",
  notes: "",
  active: true,
  imageUrl: "",
  imagePath: "",
};

const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/;

export function AdminPaymentQrPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentQrCode | null>(null);
  const [draft, setDraft] = useState<QrDraft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<PaymentQrCode | null>(null);

  const qrCodes = useAsync(() => walletService.qrCodes(false), []);

  const openCreate = () => {
    setDraft(EMPTY);
    setEditing(null);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (qr: PaymentQrCode) => {
    setDraft({
      label: qr.label,
      payeeName: qr.payeeName,
      upiId: qr.upiId,
      appHint: qr.appHint ?? "",
      notes: qr.notes ?? "",
      active: qr.active,
      imageUrl: qr.imageUrl,
      imagePath: qr.imagePath,
    });
    setEditing(qr);
    setFormError(null);
    setOpen(true);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setFormError(problem);
      return;
    }
    setUploading(true);
    setFormError(null);
    try {
      const result = await uploadImage("payment-qr", file, profile?.uid ?? "admin");
      setDraft((d) => ({ ...d, imageUrl: result.url, imagePath: result.path }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The QR image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setFormError(null);
    if (draft.label.trim().length < 2) return setFormError("Give this QR code an internal label.");
    if (draft.payeeName.trim().length < 2) return setFormError("Enter the payee name shown in the UPI app.");
    if (!UPI_PATTERN.test(draft.upiId.trim())) {
      return setFormError("Enter a valid UPI ID, e.g. business@okhdfcbank.");
    }
    if (!draft.imageUrl) return setFormError("Upload the QR code image customers will scan.");

    setSaving(true);
    try {
      const payload = {
        label: draft.label.trim(),
        payeeName: draft.payeeName.trim(),
        upiId: draft.upiId.trim(),
        appHint: draft.appHint.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        active: draft.active,
        imageUrl: draft.imageUrl,
        imagePath: draft.imagePath,
      };

      if (editing) {
        await store.update("paymentQrCodes", editing.id, {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
        await adminService.log({
          actorUid: profile?.uid ?? "",
          actorName: profile?.fullName ?? "Administrator",
          action: "paymentQr.update",
          entity: "paymentQrCodes",
          entityId: editing.id,
          note: payload.label,
        });
        toast.success("QR code updated", payload.label);
      } else {
        const id = await store.create("paymentQrCodes", {
          ...payload,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await adminService.log({
          actorUid: profile?.uid ?? "",
          actorName: profile?.fullName ?? "Administrator",
          action: "paymentQr.create",
          entity: "paymentQrCodes",
          entityId: id,
          note: payload.label,
        });
        toast.success("QR code added", "It can now be offered during deposits.");
      }
      setOpen(false);
      setEditing(null);
      qrCodes.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The QR code could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (qr: PaymentQrCode) => {
    try {
      await store.update("paymentQrCodes", qr.id, {
        active: !qr.active,
        updatedAt: new Date().toISOString(),
      });
      toast.success(qr.active ? "QR disabled" : "QR enabled", qr.label);
      qrCodes.reload();
    } catch (error) {
      toast.error("Could not update", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await store.remove("paymentQrCodes", removing.id);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "paymentQr.delete",
        entity: "paymentQrCodes",
        entityId: removing.id,
        note: removing.label,
      });
      toast.success("QR code deleted", removing.label);
      setRemoving(null);
      qrCodes.reload();
    } catch (error) {
      toast.error("Could not delete", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const columns: Array<Column<PaymentQrCode>> = [
    {
      key: "qr",
      header: "QR code",
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white">
            {row.imageUrl ? (
              <img src={row.imageUrl} alt="" className="size-full object-contain" />
            ) : (
              <ImageIcon className="size-5 text-muted" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.label}</p>
            <p className="font-mono text-[11px] text-muted">{row.upiId}</p>
          </div>
        </div>
      ),
    },
    {
      key: "payee",
      header: "Payee",
      hideBelow: "sm",
      render: (row) => <span className="text-[12.5px] text-ink">{row.payeeName}</span>,
    },
    {
      key: "hint",
      header: "App hint",
      hideBelow: "lg",
      render: (row) => <span className="text-[12.5px] text-muted">{row.appHint ?? "—"}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      hideBelow: "md",
      render: (row) => <span className="text-muted">{formatDateTime(row.updatedAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.active ? "emerald" : "muted"}>{row.active ? "Active" : "Disabled"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => void toggleActive(row)}>
            {row.active ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit QR code">
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(row)} aria-label="Delete QR code">
            <Trash2 className="size-3.5 text-brand" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Money"
        icon={QrCode}
        title="Payment QR codes"
        description="The UPI codes a customer is shown when adding money. Each deposit request stores which code was displayed, so the verification step can cross-check it."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus className="size-4" aria-hidden />}>
            Add QR code
          </Button>
        }
      />

      <LoadErrors className="mt-4" sources={[qrCodes]} />

      <Alert tone="warning" className="mt-4" title="Verify before publishing">
        Only upload QR codes that belong to the operating entity. Always confirm a payment against your own
        banking statement before approving a deposit — a screenshot alone is never proof of payment.
      </Alert>

      <Card className="mt-4">
        <CardHeader
          icon={QrCode}
          title="Configured codes"
          description="Choose which codes are offered; disabled codes are hidden from customers."
        />
        <CardBody>
          {qrCodes.loading ? (
            <Skeleton className="h-64" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={qrCodes.data ?? []}
              keyOf={(row) => row.id}
              caption="Payment QR codes"
              emptyTitle="No payment QR codes yet"
              emptyDescription="Add at least one active UPI QR code before customers can deposit."
              emptyAction={<Button onClick={openCreate}>Add the first QR code</Button>}
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        size="lg"
        dismissible={!saving && !uploading}
        title={editing ? `Edit ${editing.label}` : "Add a payment QR code"}
        description="Stored in Cloud Storage; the UPI ID and payee name are also recorded for verification."
      >
        <div className="space-y-4">
          {formError ? <FieldError>{formError}</FieldError> : null}

          <FormRow columns={2}>
            <div>
              <Label htmlFor="qr-label" required hint="Internal only">
                Label
              </Label>
              <Input
                id="qr-label"
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                placeholder="e.g. Primary HDFC UPI"
              />
            </div>
            <div>
              <Label htmlFor="qr-payee" required>
                Payee name
              </Label>
              <Input
                id="qr-payee"
                value={draft.payeeName}
                onChange={(event) => setDraft({ ...draft, payeeName: event.target.value })}
                placeholder="Exactly as registered"
              />
            </div>
          </FormRow>

          <FormRow columns={2}>
            <div>
              <Label htmlFor="qr-upi" required>
                UPI ID
              </Label>
              <Input
                id="qr-upi"
                value={draft.upiId}
                onChange={(event) => setDraft({ ...draft, upiId: event.target.value })}
                placeholder="business@okhdfcbank"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="qr-hint">App hint</Label>
              <Input
                id="qr-hint"
                value={draft.appHint}
                onChange={(event) => setDraft({ ...draft, appHint: event.target.value })}
                placeholder="e.g. Works with GPay, PhonePe"
              />
            </div>
          </FormRow>

          <div>
            <Label htmlFor="qr-image" required hint="PNG, JPEG or WebP, up to 5 MB">
              QR image
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink transition hover:border-gold">
                <Upload className="size-4" aria-hidden />
                {uploading ? "Uploading…" : draft.imageUrl ? "Replace image" : "Upload QR image"}
                <input
                  id="qr-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => void pickImage(event.target.files?.[0])}
                />
              </label>
              {draft.imageUrl ? (
                <span className="grid size-20 place-items-center overflow-hidden rounded-lg border border-line bg-white">
                  <img src={draft.imageUrl} alt="" className="size-full object-contain" />
                </span>
              ) : (
                <span className="text-[12px] text-muted">No image selected yet.</span>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="qr-notes" hint="Internal only">
              Notes
            </Label>
            <Textarea
              id="qr-notes"
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              className="min-h-20"
              placeholder="e.g. Daily settlement account, merchant id 12345."
            />
          </div>

          <div className="rounded-xl border border-line bg-ivory/50 p-3">
            <Switch
              checked={draft.active}
              onChange={(value) => setDraft({ ...draft, active: value })}
              label="Offer this code to customers"
              description="Disabled codes remain stored but are never shown during a deposit."
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving} disabled={uploading}>
              {editing ? "Save changes" : "Add QR code"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        tone="danger"
        title={removing ? `Delete “${removing.label}”?` : "Delete QR code"}
        description="Existing deposit requests keep their record of the code used. The uploaded file remains in Cloud Storage."
        confirmLabel="Delete QR code"
      />
    </>
  );
}
