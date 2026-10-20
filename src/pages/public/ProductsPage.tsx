import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductCatalog } from "@/features/shop/ProductCatalog";

export function ProductsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Shop"
        icon={ShoppingBag}
        title="Festival products & offers"
        description="Browse our products and add them to your cart. Ticket buyers unlock special coupon prices."
        crumbs={[{ label: "Home", to: "/" }, { label: "Products" }]}
      />
      <div className="page py-8">
        <ProductCatalog />
      </div>
    </>
  );
}
