/** Identifier helpers. Outcome selection (draws, spins) happens server-side only. */

export function newId(prefix = ""): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return prefix ? `${prefix}_${rand}` : rand;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
