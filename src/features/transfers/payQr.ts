export const SEND_MONEY_PATH = "/dashboard/send-money";

/** Returns the 10-digit mobile number for an Indian phone in any common format, or null. */
export function tenDigitMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * The text inside a customer's "receive money" QR: a link to the send-money
 * page with their number, so a phone camera scan opens the payment screen too.
 */
export function payQrValue(phone: string, origin: string): string | null {
  const mobile = tenDigitMobile(phone);
  return mobile ? `${origin}${SEND_MONEY_PATH}?to=${mobile}` : null;
}

export type ParsedPayQr = { ok: true; mobile: string } | { ok: false; reason: string };

/** Reads a scanned QR: our pay link, or a plain mobile number. */
export function parsePayQr(text: string): ParsedPayQr {
  const value = text.trim();
  if (/^upi:/i.test(value)) {
    return {
      ok: false,
      reason: "This is a bank UPI QR. Scan the Diwali Dhamaka wallet QR from the receiver's Send money page.",
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (url) {
    const mobile = url.pathname.replace(/\/+$/, "") === SEND_MONEY_PATH ? tenDigitMobile(url.searchParams.get("to") ?? "") : null;
    return mobile
      ? { ok: true, mobile }
      : { ok: false, reason: "This QR is not a Diwali Dhamaka wallet QR." };
  }

  const mobile = tenDigitMobile(value);
  return mobile ? { ok: true, mobile } : { ok: false, reason: "This QR is not a Diwali Dhamaka wallet QR." };
}
