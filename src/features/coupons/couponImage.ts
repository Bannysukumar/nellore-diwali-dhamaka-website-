import { formatDateTime } from "@/utils/format";
import {
  CARD_H,
  CARD_W,
  COLORS,
  DISPLAY,
  GAP,
  PAD,
  SANS,
  SITE_HOST,
  downloadCardImage,
  dummyBars,
  formatMobile,
  perforation,
  pill,
  roundedRect,
  text,
  type TicketHolder,
} from "@/features/tickets/ticketImage";
import { couponState, shortLink, type CouponView } from "./coupon";

function wrapLines(ctx: CanvasRenderingContext2D, value: string, font: string, maxWidth: number, maxLines: number) {
  ctx.font = font;
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (ctx.measureText(line).width > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
  }
  return lines;
}

function drawFront(ctx: CanvasRenderingContext2D, coupon: CouponView, holder: TicketHolder) {
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
  ctx.restore();

  const left = x + 32;
  const leftMax = perfX - left - 20;
  text(ctx, "SPIN REWARD COUPON", left, y + 44, { font: `800 15px ${SANS}`, color: COLORS.goldSoft, spacing: 3 });
  text(ctx, coupon.name, left, y + 80, { font: `600 25px ${DISPLAY}`, color: COLORS.ivory, maxWidth: leftMax });
  text(ctx, coupon.couponId, left, y + 140, { font: `800 46px ${SANS}`, color: COLORS.goldSoft, spacing: 3 });

  const col2 = left + 210;
  text(ctx, "Winner", left, y + 186, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, holder.name || "Coupon holder", left, y + 210, {
    font: `700 18px ${SANS}`,
    color: COLORS.ivory,
    maxWidth: 196,
  });
  text(ctx, "Mobile number", col2, y + 186, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, holder.phone ? formatMobile(holder.phone) : "—", col2, y + 210, {
    font: `700 18px ${SANS}`,
    color: COLORS.ivory,
    maxWidth: leftMax - 210,
  });
  text(ctx, "Won on", left, y + 242, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, formatDateTime(coupon.wonAt), left, y + 266, { font: `700 17px ${SANS}`, color: COLORS.ivory, maxWidth: 196 });
  text(ctx, "Valid until", col2, y + 242, { font: `500 15px ${SANS}`, color: COLORS.ivoryDim });
  text(ctx, coupon.expiresAt ? formatDateTime(coupon.expiresAt) : "No expiry", col2, y + 266, {
    font: `700 17px ${SANS}`,
    color: COLORS.ivory,
    maxWidth: leftMax - 210,
  });

  perforation(ctx, perfX, y, "rgba(255, 249, 237, 0.35)");
  const cx = perfX + stubW / 2;
  const state = couponState(coupon);
  if (state === "used") pill(ctx, "USED", cx, y + 120, COLORS.ivory, COLORS.muted);
  else if (state === "expired") pill(ctx, "EXPIRED", cx, y + 120, COLORS.pendingSoft, COLORS.pending);
  else pill(ctx, "VALID", cx, y + 120, COLORS.emeraldSoft, COLORS.emerald);
  text(ctx, state === "used" ? `at ${coupon.usedShop ?? "the shop"}` : "Show at the shop", cx, y + 172, {
    font: `600 15px ${SANS}`,
    color: COLORS.ivoryDim,
    align: "center",
    maxWidth: stubW - 20,
  });
}

function drawBack(ctx: CanvasRenderingContext2D, coupon: CouponView) {
  const x = PAD;
  const y = PAD + CARD_H + GAP;
  const stubW = 130;
  const perfX = x + CARD_W - stubW;
  const cx = (x + perfX) / 2;
  const maxW = perfX - x - 56;

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

  text(ctx, "WHERE TO REDEEM", cx, y + 46, { font: `800 24px ${DISPLAY}`, color: COLORS.maroon, align: "center" });
  let lineY = y + 78;
  const locationFont = `700 17px ${SANS}`;
  for (const line of wrapLines(ctx, coupon.location || "Ask the organiser for the redemption place.", locationFont, maxW, 3)) {
    text(ctx, line, cx, lineY, { font: locationFont, color: COLORS.ink, align: "center" });
    lineY += 23;
  }
  if (coupon.link) {
    text(ctx, shortLink(coupon.link), cx, lineY + 4, {
      font: `600 15px ${SANS}`,
      color: COLORS.brand,
      align: "center",
      maxWidth: maxW,
    });
    lineY += 26;
  }
  if (coupon.terms) {
    const termsFont = `500 14px ${SANS}`;
    for (const line of wrapLines(ctx, coupon.terms, termsFont, maxW, 2)) {
      text(ctx, line, cx, lineY + 6, { font: termsFont, color: COLORS.muted, align: "center" });
      lineY += 19;
    }
  }
  if (coupon.code) {
    text(ctx, `Code: ${coupon.code}`, cx, y + 236, { font: `800 18px ${SANS}`, color: COLORS.brand, align: "center", maxWidth: maxW });
  }
  text(ctx, SITE_HOST, cx, y + 262, { font: `800 18px ${SANS}`, color: COLORS.brand, align: "center", maxWidth: maxW });
  text(ctx, `${coupon.couponId} · Ts & Cs apply`, cx, y + 282, { font: `500 13px ${SANS}`, color: COLORS.muted, align: "center" });

  perforation(ctx, perfX, y, COLORS.gold);
  const bx = perfX + 25;
  const by = y + 30;
  const bw = stubW - 50;
  const bh = CARD_H - 60;
  roundedRect(ctx, bx, by, bw, bh, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const { bars, total } = dummyBars(coupon.couponId);
  const scale = (bh - 24) / total;
  ctx.fillStyle = COLORS.ink;
  for (const bar of bars) ctx.fillRect(bx + 12, by + 12 + bar.y * scale, bw - 24, bar.h * scale);
}

/** Renders both sides of a coupon into one PNG and downloads it. */
export async function downloadCouponImage(coupon: CouponView, holder: TicketHolder = {}) {
  await downloadCardImage(`diwali-dhamaka-coupon-${coupon.couponId}.png`, (ctx) => {
    drawFront(ctx, coupon, holder);
    drawBack(ctx, coupon);
  });
}
