import { useSyncExternalStore } from "react";

export interface CartLine {
  productId: string;
  quantity: number;
}

const CART_KEY = "dd:cart";
export const MAX_QUANTITY = 20;

const listeners = new Set<() => void>();
let lines: CartLine[] = read();

function read(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as CartLine[];
    return Array.isArray(parsed)
      ? parsed.filter((line) => typeof line.productId === "string" && Number.isInteger(line.quantity) && line.quantity > 0)
      : [];
  } catch {
    return [];
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  } catch {
    /* Storage unavailable: the cart lasts for this page view only. */
  }
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== CART_KEY) return;
    lines = read();
    listeners.forEach((listener) => listener());
  });
}

export const cart = {
  add(productId: string) {
    const existing = lines.find((line) => line.productId === productId);
    if (existing) cart.setQuantity(productId, existing.quantity + 1);
    else commit([...lines, { productId, quantity: 1 }]);
  },
  setQuantity(productId: string, quantity: number) {
    if (quantity <= 0) return cart.remove(productId);
    const clamped = Math.min(quantity, MAX_QUANTITY);
    commit(lines.map((line) => (line.productId === productId ? { ...line, quantity: clamped } : line)));
  },
  remove(productId: string) {
    commit(lines.filter((line) => line.productId !== productId));
  },
  clear() {
    commit([]);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, () => lines, () => lines);
}
