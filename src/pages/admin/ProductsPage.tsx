import { useMemo, useState } from "react";
import { Pencil, Plus, ShoppingBag, Trash2, Upload } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useDebounced } from "@/hooks/useCollection";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { store } from "@/lib/backend";
import { productService } from "@/services/productService";
import { uploadImage, validateImage } from "@/services/storageService";
import { adminService } from "@/services/adminService";
import type { Product } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dialog,
  FieldError,
  FormRow,
  Input,
  Label,
  LoadErrors,
  Skeleton,
  Switch,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, paiseToRupees, parseRupeesToPaise } from "@/utils/money";

interface ProductDraft {
  name: string;
  description: string;
  imageUrl: string;
  imagePath: string;
  originalPrice: string;
  discountPrice: string;
  couponCode: string;
  couponPrice: string;
  sortOrder: string;
  active: boolean;
}

const EMPTY: ProductDraft = {
  name: "",
  description: "",
  imageUrl: "",
  imagePath: "",
  originalPrice: "",
  discountPrice: "",
  couponCode: "",
  couponPrice: "",
  sortOrder: "0",
  active: true,
};

const COUPON_PATTERN = /^[A-Z0-9-]{3,40}$/;
const rupees = (value: string) => value.replace(/[^\d.]/g, "");

export function AdminProductsPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250).trim().toLowerCase();
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [removing, setRemoving] = useState<Product | null>(null);

  const products = useAsync(() => productService.all(), []);
  const coupons = useAsync(
    async () => {
      const rows = await store.list<{ id: string; code: string }>("productCoupons", { limit: 500 });
      return Object.fromEntries(rows.map((row) => [row.id, row.code]));
    },
    [products.data],
  );
  const all = useMemo(() => products.data ?? [], [products.data]);
  const codes = coupons.data ?? {};
  const rows = useMemo(
    () => (debounced ? all.filter((p) => p.name.toLowerCase().includes(debounced)) : all),
    [all, debounced],
  );

  const audit = (action: string, entityId: string, note: string) =>
    adminService.log({
      actorUid: profile?.uid ?? "",
      actorName: profile?.fullName ?? "Administrator",
      action,
      entity: "products",
      entityId,
      note,
    });

  const openCreate = () => {
    setDraft({ ...EMPTY, sortOrder: String(all.length) });
    setEditing(null);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = async (product: Product) => {
    setDraft({
      name: product.name,
      description: product.description ?? "",
      imageUrl: product.imageUrl,
      imagePath: product.imagePath,
      originalPrice: String(paiseToRupees(product.originalPricePaise)),
      discountPrice: String(paiseToRupees(product.discountPricePaise)),
      couponCode: codes[product.id] ?? "",
      couponPrice: product.couponPricePaise ? String(paiseToRupees(product.couponPricePaise)) : "",
      sortOrder: String(product.sortOrder),
      active: product.active,
    });
    setEditing(product);
    setFormError(null);
    setOpen(true);
    setLoadingCoupon(true);
    try {
      const code = await productService.couponCode(product.id);
      setDraft((d) => ({ ...d, couponCode: code }));
    } catch {
      /* The table value is used if the fresh read fails. */
    } finally {
      setLoadingCoupon(false);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) return setFormError(problem);
    setUploading(true);
    setFormError(null);
    try {
      const result = await uploadImage("products", file, profile?.uid ?? "admin");
      setDraft((d) => ({ ...d, imageUrl: result.url, imagePath: result.path }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setFormError(null);
    const name = draft.name.trim();
    const originalPricePaise = parseRupeesToPaise(draft.originalPrice || "0");
    const discountPricePaise = parseRupeesToPaise(draft.discountPrice || "0");
    const couponPricePaise = draft.couponPrice ? parseRupeesToPaise(draft.couponPrice) : 0;
    const couponCode = draft.couponCode.trim().toUpperCase();

    if (name.length < 2) return setFormError("Enter the product name.");
    if (!draft.imageUrl) return setFormError("Upload the product image before saving.");
    if (!(originalPricePaise > 0)) return setFormError("Enter the original price.");
    if (!(discountPricePaise > 0)) return setFormError("Enter the discount (selling) price.");
    if (discountPricePaise > originalPricePaise) {
      return setFormError("The discount price cannot be higher than the original price.");
    }
    if (Boolean(couponCode) !== Boolean(couponPricePaise)) {
      return setFormError("Enter both a coupon code and a coupon price, or leave both empty.");
    }
    if (couponCode && !COUPON_PATTERN.test(couponCode)) {
      return setFormError("Coupon codes use 3–40 letters, digits or dashes, e.g. DIWALI-100.");
    }
    if (couponPricePaise && couponPricePaise > discountPricePaise) {
      return setFormError("The coupon price cannot be higher than the discount price.");
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: draft.description.trim() || undefined,
        imageUrl: draft.imageUrl,
        imagePath: draft.imagePath,
        originalPricePaise,
        discountPricePaise,
        couponPricePaise: couponPricePaise || undefined,
        active: draft.active,
        sortOrder: Number(draft.sortOrder) || 0,
        updatedAt: new Date().toISOString(),
      };
      let id: string;
      if (editing) {
        id = editing.id;
        await store.update("products", id, payload);
        await audit("product.update", id, name);
      } else {
        id = await store.create("products", { ...payload, createdAt: new Date().toISOString() });
        await audit("product.create", id, name);
      }
      if (couponCode !== (editing ? (codes[editing.id] ?? "") : "")) {
        await productService.setCouponCode(id, couponCode);
      }
      toast.success(editing ? "Product updated" : "Product added", name);
      setOpen(false);
      setEditing(null);
      products.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The product could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: Product) => {
    try {
      await store.update("products", product.id, { active: !product.active, updatedAt: new Date().toISOString() });
      toast.success(product.active ? "Product hidden" : "Product shown", product.name);
      products.reload();
    } catch (error) {
      toast.error("Could not update", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await store.remove("products", removing.id);
      if (codes[removing.id]) await productService.setCouponCode(removing.id, "");
      await audit("product.delete", removing.id, removing.name);
      toast.success("Product deleted", removing.name);
      setRemoving(null);
      products.reload();
    } catch (error) {
      toast.error("Could not delete", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const columns: Array<Column<Product>> = [
    {
      key: "product",
      header: "Product",
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-ivory">
            <img src={row.imageUrl} alt="" className="size-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            {row.description ? <p className="truncate text-[11px] text-muted">{row.description}</p> : null}
          </div>
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      render: (row) => (
        <div className="text-[12.5px] tabular-nums">
          <p className="font-semibold text-ink">{formatINR(row.discountPricePaise)}</p>
          <p className="text-muted line-through">{formatINR(row.originalPricePaise)}</p>
        </div>
      ),
    },
    {
      key: "coupon",
      header: "Ticket-buyer coupon",
      hideBelow: "sm",
      render: (row) =>
        row.couponPricePaise ? (
          <div className="text-[12.5px]">
            <p className="font-mono font-semibold text-ink">{codes[row.id] ?? "—"}</p>
            <p className="tabular-nums text-emerald">{formatINR(row.couponPricePaise)}</p>
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "order",
      header: "Order",
      align: "right",
      hideBelow: "md",
      render: (row) => <span className="tabular-nums text-muted">{row.sortOrder}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={row.active ? "emerald" : "muted"}>{row.active ? "Live" : "Hidden"}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => void toggleActive(row)}>
            {row.active ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void openEdit(row)} aria-label={`Edit ${row.name}`}>
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(row)} aria-label={`Delete ${row.name}`}>
            <Trash2 className="size-3.5 text-brand" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Content"
        icon={ShoppingBag}
        title="Products"
        description="Products shown on the public Products page and in customer dashboards. Customers add them to a cart and are told to visit the shop to buy."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus className="size-4" aria-hidden />}>
            New product
          </Button>
        }
      />

      <LoadErrors className="mt-4" sources={[products, coupons]} />

      <Alert tone="info" className="mt-4" title="Coupon codes are private">
        A coupon code is shown only to customers who have bought at least one ticket. Everyone else sees the coupon
        price with a prompt to book a ticket.
      </Alert>

      <div className="mt-5 flex justify-end">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products"
          aria-label="Search products"
          className="w-full sm:w-72"
        />
      </div>

      <Card className="mt-4">
        <CardHeader icon={ShoppingBag} title="Catalogue" description={`${rows.length} product(s), lowest order first.`} />
        <CardBody>
          {products.loading ? (
            <Skeleton className="h-64" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Products"
              emptyTitle={debounced ? "No products match" : "No products yet"}
              emptyDescription="Add a product with an image and prices to show it on the site."
              emptyAction={debounced ? undefined : <Button onClick={openCreate}>Add the first product</Button>}
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        size="lg"
        dismissible={!saving && !uploading}
        title={editing ? `Edit ${editing.name}` : "New product"}
        description="Prices are in rupees. The coupon price is for ticket buyers using the coupon code."
      >
        <div className="space-y-4">
          {formError ? <FieldError>{formError}</FieldError> : null}

          <div>
            <Label htmlFor="product-name" required>
              Product name
            </Label>
            <Input
              id="product-name"
              value={draft.name}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="e.g. Silver diya set"
            />
          </div>

          <div>
            <Label htmlFor="product-description" hint="Optional">
              Short description
            </Label>
            <Input
              id="product-description"
              value={draft.description}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>

          <FormRow columns={2}>
            <div>
              <Label htmlFor="product-original" required>
                Original price
              </Label>
              <Input
                id="product-original"
                inputMode="decimal"
                prefix="₹"
                value={draft.originalPrice}
                onChange={(event) => setDraft({ ...draft, originalPrice: rupees(event.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="product-discount" required hint="Selling price">
                Discount price
              </Label>
              <Input
                id="product-discount"
                inputMode="decimal"
                prefix="₹"
                value={draft.discountPrice}
                onChange={(event) => setDraft({ ...draft, discountPrice: rupees(event.target.value) })}
              />
            </div>
          </FormRow>

          <FormRow columns={2}>
            <div>
              <Label htmlFor="product-coupon" hint="For ticket buyers">
                Coupon code
              </Label>
              <Input
                id="product-coupon"
                value={draft.couponCode}
                disabled={loadingCoupon}
                maxLength={40}
                className="font-mono uppercase"
                placeholder={loadingCoupon ? "Loading…" : "e.g. DIWALI-100"}
                onChange={(event) =>
                  setDraft({ ...draft, couponCode: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })
                }
              />
            </div>
            <div>
              <Label htmlFor="product-coupon-price" hint="With the coupon">
                Coupon price
              </Label>
              <Input
                id="product-coupon-price"
                inputMode="decimal"
                prefix="₹"
                value={draft.couponPrice}
                onChange={(event) => setDraft({ ...draft, couponPrice: rupees(event.target.value) })}
              />
            </div>
          </FormRow>

          <div>
            <Label htmlFor="product-order" hint="Lower shows first">
              Sort order
            </Label>
            <Input
              id="product-order"
              inputMode="numeric"
              value={draft.sortOrder}
              className="sm:w-40"
              onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value.replace(/[^\d-]/g, "") })}
            />
          </div>

          <div>
            <Label htmlFor="product-image" required hint="PNG, JPEG or WebP, up to 5 MB">
              Product image
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink transition hover:border-gold">
                <Upload className="size-4" aria-hidden />
                {uploading ? "Uploading…" : draft.imageUrl ? "Replace image" : "Upload image"}
                <input
                  id="product-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => void pickImage(event.target.files?.[0])}
                />
              </label>
              {draft.imageUrl ? (
                <span className="size-16 overflow-hidden rounded-lg border border-line bg-ivory">
                  <img src={draft.imageUrl} alt="" className="size-full object-cover" />
                </span>
              ) : (
                <span className="text-[12px] text-muted">No image selected yet.</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-ivory/50 p-3">
            <Switch
              checked={draft.active}
              onChange={(value) => setDraft({ ...draft, active: value })}
              label="Show on the site"
              description="Hidden products stay saved but are not shown to customers."
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving} disabled={uploading || loadingCoupon}>
              {editing ? "Save changes" : "Add product"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        tone="danger"
        title={removing ? `Delete “${removing.name}”?` : "Delete product"}
        description="The product is removed from the site immediately, along with its coupon code."
        confirmLabel="Delete product"
      />
    </>
  );
}
