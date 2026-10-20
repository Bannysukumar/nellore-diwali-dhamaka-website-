/** Privacy helpers — public surfaces must never leak full personal data. */

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  const cc = digits.slice(0, digits.length - 10);
  const local = digits.slice(-10);
  const head = local.slice(0, 2);
  const tail = local.slice(-3);
  return `${cc ? `+${cc} ` : "+91 "}${head}•••••${tail}`;
}

/** 100245 -> "100••45" (keeps enough to recognise, not to identify). */
export function maskTicketNumber(value: string | number): string {
  const s = String(value);
  if (s.length <= 4) return s.replace(/\d/g, "•");
  return `${s.slice(0, s.length - 4)}••${s.slice(-2)}`;
}

export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part, i) => (i === 0 ? part : `${part.charAt(0)}.`))
    .join(" ");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function maskUtr(utr: string): string {
  if (utr.length <= 4) return "••••";
  return `${"•".repeat(Math.max(0, utr.length - 4))}${utr.slice(-4)}`;
}

/** Masks an email for public display: rahul@x.com -> r•••@x.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}
