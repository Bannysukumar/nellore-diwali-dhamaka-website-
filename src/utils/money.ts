/**
 * Currency helpers. All money in this application is stored and computed as
 * integer paise. These helpers only exist for display and for parsing user
 * input — never for authoritative arithmetic.
 */

export const PAISE_PER_RUPEE = 100;

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / PAISE_PER_RUPEE;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/**
 * Formats paise as an Indian-locale rupee string, e.g. 49900 -> "₹499.00".
 * Unknown amounts (failed or pending reads) render as "—", never as ₹0.
 */
export function formatINR(paise: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (paise == null || Number.isNaN(paise)) return "—";
  const decimals = opts.decimals ?? paise % PAISE_PER_RUPEE !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(paiseToRupees(paise));
}

/** Compact form for dashboards: ₹1.2L, ₹45.6K. */
export function formatINRCompact(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) return "—";
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(rupees);
}

/** Parses a user-entered rupee string ("1,499.50") into integer paise. */
export function parseRupeesToPaise(input: string | number): number {
  if (typeof input === "number") return Math.round(input * PAISE_PER_RUPEE);
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!cleaned || Number.isNaN(Number(cleaned))) return Number.NaN;
  return Math.round(Number(cleaned) * PAISE_PER_RUPEE);
}

/** Sum helper that keeps integer semantics explicit. */
export function sumPaise(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

export function formatINRPlain(paise: number): string {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
