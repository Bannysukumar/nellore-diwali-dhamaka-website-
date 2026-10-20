import type { Product } from "@/types";
import { store } from "@/lib/backend";
import { callBackend } from "@/lib/backend/callBackend";
import type { ProductCouponsResponse } from "@/lib/backend/api";

export const productService = {
  /** Public catalogue; the rules only allow active products to non-admins. */
  async active(): Promise<Product[]> {
    const rows = await store.list<Product>("products", {
      where: [{ field: "active", op: "==", value: true }],
      limit: 200,
    });
    return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },

  async all(): Promise<Product[]> {
    return store.list<Product>("products", { orderBy: [{ field: "sortOrder", dir: "asc" }], limit: 500 });
  },

  /** Administrators only. */
  async couponCode(productId: string): Promise<string> {
    const row = await store.get<{ code?: string }>("productCoupons", productId);
    return row?.code ?? "";
  },

  async setCouponCode(productId: string, code: string): Promise<void> {
    if (code) {
      await store.set("productCoupons", productId, { code, updatedAt: new Date().toISOString() });
    } else {
      await store.remove("productCoupons", productId);
    }
  },

  /** Ticket buyers get the coupon codes; everyone else gets `eligible: false`. */
  async myCoupons(): Promise<ProductCouponsResponse> {
    return callBackend<Record<string, never>, ProductCouponsResponse>("getProductCoupons", {});
  },
};
