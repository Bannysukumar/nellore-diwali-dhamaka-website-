/**
 * Pure helpers shared by every Cloud Function.
 *
 * These are deliberately free of Firebase imports so they can be unit tested
 * (and reasoned about) in isolation.
 */

import type { Prize } from "./types.js";

/** Prize tiers are always assigned in this order, highest value first. */
export const TIER_ORDER: Prize["tier"][] = ["gold", "silver", "bronze", "special"];

export const nowIso = (): string => new Date().toISOString();

/**
 * Cryptographically strong index in `[0, maxExclusive)`.
 *
 * Used for every outcome a participant could otherwise influence: spin results
 * and winning-ticket selection. Rejection sampling removes modulo bias.
 */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("maxExclusive must be a positive integer");
  }
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  let v = 0;
  do {
    v = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (v >= limit);
  return v % maxExclusive;
}

/** Weighted selection; weights must be positive. Mirrors `weightedPick` in the app. */
export function weightedPick<T extends { weight: number }>(
  items: readonly T[],
  rand: () => number = () => secureRandomInt(1_000_000) / 1_000_000,
): T {
  const active = items.filter((i) => i.weight > 0);
  if (!active.length) throw new Error("No weighted options available");
  const total = active.reduce((sum, i) => sum + i.weight, 0);
  let roll = rand() * total;
  for (const item of active) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return active[active.length - 1];
}

/** FNV-1a. Stable across processes — used for deterministic QR selection. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Public-facing ticket mask, e.g. `100245` -> `10••45`. */
export function maskTicket(label: string): string {
  if (label.length <= 4) return label.replace(/\d/g, "•");
  return `${label.slice(0, label.length - 4)}••${label.slice(-2)}`;
}

/** `Priya Sharma` -> `Priya S.` — never publish a full legal name. */
export function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "Participant";
  const initial = parts[1]?.charAt(0);
  return initial ? `${first} ${initial}.` : `${first}.`;
}

/** Masks a UTR for wallet descriptions, e.g. `1234567890` -> `••••••7890`. */
export function maskUtr(utr: string): string {
  if (utr.length <= 4) return utr.replace(/./g, "•");
  return `${"•".repeat(utr.length - 4)}${utr.slice(-4)}`;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Formats paise for user-facing copy without floating point drift. */
export function formatPaise(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const paisePart = Math.abs(paise % 100);
  return `₹${rupees.toLocaleString("en-IN")}.${String(paisePart).padStart(2, "0")}`;
}

/**
 * Order in which prizes receive winning tickets: by tier (gold first), then in
 * the order the administrator listed them. Every prize is included, even when
 * several share a tier.
 */
export function prizeAssignmentOrder(prizes: Prize[]): Prize[] {
  return prizes
    .map((prize, index) => ({ prize, index }))
    .filter(({ prize }) => prize.quantity > 0)
    .sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.prize.tier) - TIER_ORDER.indexOf(b.prize.tier) || a.index - b.index,
    )
    .map(({ prize }) => prize);
}

/**
 * Unbiased selection of `count` distinct items using secure random removal.
 * Every item has the same probability of being picked at each position.
 */
export function secureSample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(secureRandomInt(pool.length), 1)[0]);
  }
  return out;
}
