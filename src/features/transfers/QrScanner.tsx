import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ImageUp, Loader2, X } from "lucide-react";
import type JsQrDecoder from "jsqr";

type JsQr = typeof JsQrDecoder;

const SCAN_EVERY_MS = 150;
const MAX_FRAME_EDGE = 720;

/**
 * Full-screen camera QR scanner. `onDecode` returns an error message to show
 * (scanning continues) or null when the code was accepted.
 */
export function QrScanner({
  open,
  onClose,
  onDecode,
}: {
  open: boolean;
  onClose: () => void;
  onDecode: (text: string) => string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onDecodeRef = useRef(onDecode);
  const onCloseRef = useRef(onClose);
  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onDecodeRef.current = onDecode;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastScan = 0;
    let pausedUntil = 0;
    let lastRejected = "";
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    setStarting(true);
    setCameraError(null);
    setMessage(null);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);

    const handle = (text: string) => {
      if (text === lastRejected && Date.now() < pausedUntil + 3000) return;
      const error = onDecodeRef.current(text);
      if (error) {
        lastRejected = text;
        pausedUntil = Date.now() + 1500;
        setMessage(error);
      }
    };

    const tick = (jsQR: JsQr) => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => tick(jsQR));
      const video = videoRef.current;
      const now = Date.now();
      if (!video || !context || video.readyState < 2 || now - lastScan < SCAN_EVERY_MS || now < pausedUntil) return;
      lastScan = now;
      const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
      if (code?.data) handle(code.data);
    };

    void (async () => {
      try {
        const { default: jsQR } = await import("jsqr");
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("unsupported");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setStarting(false);
        tick(jsQR);
      } catch (error) {
        if (cancelled) return;
        setStarting(false);
        const name = error instanceof DOMException ? error.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow camera access in your browser settings, or upload a photo of the QR."
            : "The camera could not be started on this device. Upload a photo of the QR instead.",
        );
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const scanPhoto = async (file: File) => {
    setMessage(null);
    try {
      const [{ default: jsQR }, bitmap] = await Promise.all([import("jsqr"), createImageBitmap(file)]);
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
      if (!code?.data) {
        setMessage("No QR code was found in that photo. Try a clearer, closer picture.");
        return;
      }
      const error = onDecodeRef.current(code.data);
      if (error) setMessage(error);
    } catch {
      setMessage("That photo could not be read. Try another picture.");
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Scan a QR code">
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted aria-hidden />

      <div className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="font-display text-lg">Scan &amp; pay</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="grid size-10 place-items-center rounded-full bg-black/45 backdrop-blur transition hover:bg-black/60"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative aspect-square w-full max-w-[270px] rounded-3xl shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)]">
          {(["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl"] as const).map((corner) => (
            <span key={corner} className={`absolute size-12 border-gold ${corner}`} aria-hidden />
          ))}
          {!starting && !cameraError ? (
            <motion.span
              aria-hidden
              className="absolute inset-x-4 h-0.5 rounded-full bg-gold shadow-[0_0_12px_2px_rgb(212_175_55/0.7)]"
              initial={{ top: "8%" }}
              animate={{ top: ["8%", "92%", "8%"] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
          {starting ? (
            <span className="absolute inset-0 grid place-items-center">
              <Loader2 className="size-8 animate-spin text-white/80" aria-hidden />
            </span>
          ) : null}
        </div>

        <p className="mt-6 max-w-xs text-center text-[13.5px] text-white/85">
          {cameraError ?? "Point the camera at the receiver's Diwali Dhamaka wallet QR."}
        </p>
        {message ? (
          <p role="alert" className="mt-3 max-w-xs rounded-xl bg-white/95 px-3.5 py-2.5 text-center text-[13px] font-medium text-maroon">
            {message}
          </p>
        ) : null}
      </div>

      <div className="relative z-10 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-[14px] font-semibold backdrop-blur transition hover:bg-white/25"
        >
          <ImageUp className="size-4" aria-hidden />
          Upload QR from gallery
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void scanPhoto(file);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
