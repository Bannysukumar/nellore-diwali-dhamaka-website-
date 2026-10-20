export type DevicePlatform = "android" | "ios" | "desktop";

export interface UpiApp {
  id: string;
  name: string;
  short: string;
  color: string;
  androidPackage?: string;
  iosPrefix?: string;
}

/**
 * Browsers cannot list installed apps. On Android, the generic "any" entry
 * opens the system chooser, which shows only the UPI apps that are installed;
 * a named app that is missing falls back to `upi_missing` on this page.
 */
export const UPI_APPS: UpiApp[] = [
  {
    id: "gpay",
    name: "Google Pay",
    short: "G",
    color: "#1a73e8",
    androidPackage: "com.google.android.apps.nbu.paisa.user",
    iosPrefix: "tez://upi/pay",
  },
  { id: "phonepe", name: "PhonePe", short: "Pe", color: "#5f259f", androidPackage: "com.phonepe.app", iosPrefix: "phonepe://pay" },
  { id: "paytm", name: "Paytm", short: "P", color: "#00baf2", androidPackage: "net.one97.paytm", iosPrefix: "paytmmp://pay" },
  { id: "bhim", name: "BHIM", short: "B", color: "#f47920", androidPackage: "in.org.npci.upiapp", iosPrefix: "bhim://pay" },
  { id: "cred", name: "CRED", short: "C", color: "#1b1b1b", androidPackage: "com.dreamplug.androidapp", iosPrefix: "credpay://upi/pay" },
  { id: "amazonpay", name: "Amazon Pay", short: "a", color: "#ff9900", androidPackage: "in.amazon.mShop.android.shopping" },
];

export function detectPlatform(userAgent = navigator.userAgent): DevicePlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1) return "ios";
  return "desktop";
}

export function appsForPlatform(platform: DevicePlatform): UpiApp[] {
  if (platform === "android") return UPI_APPS.filter((app) => app.androidPackage);
  if (platform === "ios") return UPI_APPS.filter((app) => app.iosPrefix);
  return [];
}

export interface UpiPayment {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  note: string;
}

/** Encoded by hand: several UPI apps do not decode `+` as a space. */
export function upiQuery({ upiId, payeeName, amountPaise, note }: UpiPayment): string {
  const params: Array<[string, string]> = [
    ["pa", upiId.trim()],
    ["pn", payeeName.trim()],
    ["am", (amountPaise / 100).toFixed(2)],
    ["cu", "INR"],
    ["tn", note.trim().slice(0, 50)],
  ];
  return params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

export function upiLaunchUrl(
  app: UpiApp | null,
  platform: DevicePlatform,
  payment: UpiPayment,
  fallbackUrl: string,
): string {
  const query = upiQuery(payment);
  if (!app) return `upi://pay?${query}`;
  if (platform === "android" && app.androidPackage) {
    return `intent://pay?${query}#Intent;scheme=upi;package=${app.androidPackage};S.browser_fallback_url=${encodeURIComponent(
      fallbackUrl,
    )};end`;
  }
  if (platform === "ios" && app.iosPrefix) return `${app.iosPrefix}?${query}`;
  return `upi://pay?${query}`;
}