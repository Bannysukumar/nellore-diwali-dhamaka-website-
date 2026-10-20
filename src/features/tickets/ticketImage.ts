import type { Draw, Ticket } from "@/types";
import { APP_ORIGIN } from "@/lib/firebase/config";
import { formatINRPlain } from "@/utils/money";
import { formatDateTime } from "@/utils/format";

/** Host shown on tickets, e.g. "nellorediwalidhamaka.com". */
export const SITE_HOST = APP_ORIGIN.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** "+919876543210" → "+91 98765 43210"; other formats are returned unchanged. */
export function formatMobile(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

export interface TicketHolder {
  name?: string;
  phone?: string;
}

/** Bar pattern seeded by the ticket id; it encodes nothing and cannot be scanned. */
export function dummyBars(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  state ||= 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const bars: Array<{ y: number; h: number }> = [];
  let y = 0;
  while (y < 120) {
    const h = 1 + Math.floor(next() * 3);
    bars.push({ y, h });
    y += h + 1 + Math.floor(next() * 3);
  }
  return { bars, total: y };
}

const COLORS = {
  page: "#fff9ed",
  ivory: "#fff9ed",
  ivoryDim: "rgba(255, 249, 237, 0.62)",
  goldSoft: "#f3e3ad",
  gold: "#d4af37",
  goldDeep: "#a8842a",
  maroon: "#651b24",
  maroonDeep: "#4a121a",
  brand: "#9f2028",
  cream: "#fdf3d4",
  ink: "#202522",
  muted: "#6b706d",
  emerald: "#177245",
  emeraldSoft: "#e2f2e9",
  pending: "#a06a00",
  pendingSoft: "#fdf1d3",
};

const DISPLAY = "'Playfair Display', Georgia, serif";
const SANS = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";

const WIDTH = 720;
const PAD = 24;
const CARD_W = WIDTH - PAD * 2;
const CARD_H = 300;
const GAP = 24;
const HEIGHT = PAD * 2 + CARD_H * 2 + GAP;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: { font: string; color: string; align?: CanvasTextAlign; maxWidth?: number; spacing?: number },
) {
  ctx.font = opts.font;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align ?? "left";
  setSpacing(ctx, opts.spacing ?? 0);
  let output = value;
  if (opts.maxWidth) {
    while (output.length > 1 && ctx.measureText(output).width > opts.maxWidth) output = output.slice(0, -1);
    if (output !== value) output = `${output.slice(0, -1)}…`;
  }
  ctx.fillText(output, x, y);
  setSpacing(ctx, 0);
}

function pill(ctx: CanvasRenderingContext2D, label: string, cx: number, cy: number, bg: string, fg: string) {
  ctx.font = `800 15px ${SANS}`;
  setSpacing(ctx, 1);
  const w = ctx.measureText(label).width + 28;
  roundedRect(ctx, cx - w / 2, cy - 16, w, 32, 16);
  ctx.fillStyle = bg;
  ctx.fill();
  text(ctx, label, cx, cy + 5, { font: `800 15px ${SANS}`, color: fg, align: "center", spacing: 1 });
}

function perforation(ctx: CanvasRenderingContext2D, x: number, top: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(x, top + 16);
  ctx.lineTo(x, top + CARD_H - 16);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = COLORS.page;
  for (const cy of [top, top + CARD_H]) {
    ctx.beginPath();
    ctx.arc(x, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFront(ctx: CanvasRenderingContext2D, ticket: Ticket, draw: Draw | null, holder: TicketHolder) {
  const x = PAD;
  const y = PAD;
  const stubW = 180;
  const perfX = x + CARD_W - stubW;

  ctx.save();
  roundedRect(ctx, x, y, CARD_W, CARD_H, 28);
  ctx.clip();
  const linear = ctx.createLinearGradient(x, y, x + CARD_W, y + CARD_H);
  linear.addColorStop(0, COLORS.maroon);
  linear.addColorStop(1, COLORS.brand);
  ctx.fillStyle = linear;
  ctx.fillRect(x, y, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(x + CARD_W, y, 0, x + CARD_W, y, CARD_W * 0.7);
  glow.addColorStop(0, "rgba(242, 140, 40, 0.45)");
  glow.addColorStop(1, "rgba(242, 140, 40, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, CARD_W, CARD_H);
  ctx.restore();

  const left = x + 32;
  const leftMax = perfX - left - 20;
  text(ctx, "DIWALI DHAMAKA TICKET", left, y + 44, { font: `800 15px ${SANS}`, color: COLORS.goldSoft, spacing: 3 });
  text(ctx, draw?.title ?? "Festival draw", left, y + 80, {
    font: `600 25px ${DISPLAY}`,
    color: COLORS.ivory,
    maxWidth: leftMax,
  });
  text(ctx, `#${ticket.numberLabel}`, left, y + 146, { font: `800 58px ${SANS}`, color: COLORS.goldSoft, spacing: 2 });

  const col2 = left + 180;
  const col3 = left + 360;
  text(ctx, "Holder", left, y + 186, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, holder.name || "Ticket holder", left, y + 210, {
    font: `700 18px ${SANS}`,
    color: COLORS.ivory,
    maxWidth: 168,
  });
  text(ctx, "Mobile number", col2, y + 186, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, holder.phone ? formatMobile(holder.phone) : "—", col2, y + 210, {
    font: `700 18px ${SANS}`,
    color: COLORS.ivory,
    maxWidth: 172,
  });
  text(ctx, "Paid", col3, y + 186, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, formatINRPlain(ticket.pricePaise), col3, y + 210, { font: `700 18px ${SANS}`, color: COLORS.ivory });
  text(ctx, "Draw date", left, y + 242, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, draw ? formatDateTime(draw.drawAt) : "—", left, y + 266, {
    font: `700 18px ${SANS}`,
    color: COLORS.ivory,
    maxWidth: leftMax,
  });

  perforation(ctx, perfX, y, "rgba(255, 249, 237, 0.35)");

  const cx = perfX + stubW / 2;
  if (ticket.resultStatus === "winner") {
    pill(ctx, "WINNER", cx, y + 104, COLORS.gold, COLORS.maroonDeep);
    if (ticket.prizeTitle) {
      text(ctx, ticket.prizeTitle, cx, y + 146, {
        font: `700 16px ${SANS}`,
        color: COLORS.goldSoft,
        align: "center",
        maxWidth: stubW - 24,
      });
    }
  } else if (ticket.status === "booked") {
    pill(ctx, "CONFIRMED", cx, y + 104, COLORS.emeraldSoft, COLORS.emerald);
  } else {
    pill(ctx, ticket.status.toUpperCase(), cx, y + 104, COLORS.pendingSoft, COLORS.pending);
  }
  text(ctx, formatINRPlain(ticket.pricePaise), cx, y + 204, {
    font: `700 32px ${DISPLAY}`,
    color: COLORS.ivory,
    align: "center",
  });
  text(ctx, "Ticket price", cx, y + 228, { font: `500 14px ${SANS}`, color: COLORS.ivoryDim, align: "center" });
}

function drawBack(ctx: CanvasRenderingContext2D, ticket: Ticket) {
  const x = PAD;
  const y = PAD + CARD_H + GAP;
  const stubW = 130;
  const perfX = x + CARD_W - stubW;
  const cx = (x + perfX) / 2;
  const maxW = perfX - x - 48;

  roundedRect(ctx, x, y, CARD_W, CARD_H, 28);
  ctx.fillStyle = COLORS.cream;
  ctx.fill();
  ctx.save();
  roundedRect(ctx, x + 2, y + 2, CARD_W - 4, CARD_H - 4, 26);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.restore();

  text(ctx, "DIWALI DISCOUNT COUPON", cx, y + 52, {
    font: `800 28px ${DISPLAY}`,
    color: COLORS.maroon,
    align: "center",
    maxWidth: maxW,
  });
  text(ctx, "UP TO 50% OFF", cx, y + 80, { font: `800 16px ${SANS}`, color: COLORS.goldDeep, align: "center", spacing: 2 });

  if (ticket.status === "booked") {
    text(ctx, "Use coupon code:", cx, y + 116, { font: `600 18px ${SANS}`, color: COLORS.ink, align: "center" });
    text(ctx, ticket.numberLabel, cx, y + 168, {
      font: `800 52px ${SANS}`,
      color: COLORS.brand,
      align: "center",
      spacing: 8,
    });
    text(ctx, "Show this ticket @ billing", cx, y + 202, { font: `700 17px ${SANS}`, color: COLORS.ink, align: "center" });
    text(ctx, "Valid at all VRC Ground stalls", cx, y + 226, {
      font: `700 17px ${SANS}`,
      color: COLORS.ink,
      align: "center",
    });
  } else {
    text(ctx, "Your coupon code appears once", cx, y + 140, { font: `600 18px ${SANS}`, color: COLORS.muted, align: "center" });
    text(ctx, "this ticket is confirmed.", cx, y + 166, { font: `600 18px ${SANS}`, color: COLORS.muted, align: "center" });
  }
  text(ctx, SITE_HOST, cx, y + 258, { font: `800 18px ${SANS}`, color: COLORS.brand, align: "center", maxWidth: maxW });
  text(ctx, "Ts & Cs apply", cx, y + 280, { font: `500 13px ${SANS}`, color: COLORS.muted, align: "center" });

  perforation(ctx, perfX, y, COLORS.gold);

  const bx = perfX + 25;
  const by = y + 30;
  const bw = stubW - 50;
  const bh = CARD_H - 60;
  roundedRect(ctx, bx, by, bw, bh, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const { bars, total } = dummyBars(ticket.id);
  const scale = (bh - 24) / total;
  ctx.fillStyle = COLORS.ink;
  for (const bar of bars) ctx.fillRect(bx + 12, by + 12 + bar.y * scale, bw - 24, bar.h * scale);
}

/** Renders both sides of a ticket into one PNG and downloads it. */
export async function downloadTicketImage(ticket: Ticket, draw: Draw | null, holder: TicketHolder = {}) {
  try {
    await Promise.all([
      document.fonts.load(`800 28px ${DISPLAY}`),
      document.fonts.load(`600 25px ${DISPLAY}`),
      document.fonts.load(`800 52px ${SANS}`),
    ]);
  } catch {
    /* Fallback fonts are acceptable. */
  }

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot create images.");
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawFront(ctx, ticket, draw, holder);
  drawBack(ctx, ticket);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The ticket image could not be created.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `diwali-dhamaka-ticket-${ticket.numberLabel}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
