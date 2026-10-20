import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductCatalog } from "@/features/shop/ProductCatalog";

export function DashboardProductsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Shop"
        icon={ShoppingBag}
        title="Products"
        description="Add products to your cart. If you have bought a ticket, your coupon prices and codes are shown on each product."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Products" },
        ]}
      />
      <ProductCatalog />
    </>
  );
}
