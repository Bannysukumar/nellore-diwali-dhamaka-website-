import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { Alert, Button, Dialog } from "@/components/ui";
import { payQrValue } from "./payQr";

const QR_SIZE = 240;

/** Renders the QR on a white card with the owner's name, ready to print or share. */
function downloadCard(qr: HTMLCanvasElement, name: string) {
  const pad = 48;
  const width = QR_SIZE * 2 + pad * 2;
  const card = document.createElement("canvas");
  card.width = width;
  card.height = width + 200;
  const ctx = card.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, card.width, card.height);
  ctx.fillStyle = "#651b24";
  ctx.textAlign = "center";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(name, width / 2, 70);
  ctx.fillStyle = "#6b6259";
  ctx.font = "22px sans-serif";
  ctx.fillText("Scan to pay with your Diwali Dhamaka wallet", width / 2, 110);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, pad, 140, QR_SIZE * 2, QR_SIZE * 2);
  ctx.fillStyle = "#a8842a";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Nellore Diwali Dhamaka", width / 2, card.height - 30);

  const link = document.createElement("a");
  link.href = card.toDataURL("image/png");
  link.download = "diwali-dhamaka-pay-qr.png";
  link.click();
}

export function MyPayQrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const value = profile ? payQrValue(profile.phone, window.location.origin) : null;
  const name = profile?.fullName?.trim() || "Customer";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="My QR"
      description="Show this to anyone on Diwali Dhamaka. They scan it to send money to your wallet."
      footer={
        value ? (
          <Button
            variant="outline"
            onClick={() => canvasRef.current && downloadCard(canvasRef.current, name)}
            iconLeft={<Download className="size-4" aria-hidden />}
          >
            Download QR
          </Button>
        ) : null
      }
    >
      {value ? (
        <div className="flex flex-col items-center text-center">
          <p className="font-display text-xl text-ink">{name}</p>
          <p className="text-[12.5px] text-muted">{profile?.phoneMasked}</p>
          <div className="mt-4 rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-card)]">
            <QRCodeCanvas ref={canvasRef} value={value} size={QR_SIZE} level="M" marginSize={1} />
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            The QR contains your mobile number. Share it only with people you want to receive money from.
          </p>
        </div>
      ) : (
        <Alert tone="warning" title="QR not available">
          Your profile does not have a valid Indian mobile number yet.
        </Alert>
      )}
    </Dialog>
  );
}
