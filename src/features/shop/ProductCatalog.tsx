import { useMemo, useState } from "react";
import { Check, Copy, Minus, Plus, ShoppingBag, ShoppingCart, Store, Tag, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/ToastProvider";
import { productService } from "@/services/productService";
import type { Product } from "@/types";
import { Button, Card, Dialog, EmptyState, LoadErrors, Skeleton } from "@/components/ui";
import { formatINR } from "@/utils/money";
import { copyText } from "@/utils/clipboard";
import { cart, MAX_QUANTITY, useCart } from "./cart";

export const SHOP_MESSAGE_TITLE = "Visit our shop to buy";
export const SHOP_MESSAGE_BODY = "Our shop address will be coming soon.";

const percentOff = (p: Product) => Math.round((1 - p.discountPricePaise / p.originalPricePaise) * 100);

export function ProductCatalog() {
  const { user } = useAuth();
  const toast = useToast();
  const lines = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const products = useAsync(() => productService.active(), []);
  const coupons = useAsync(async () => (user ? await productService.myCoupons() : null), [user?.uid], {
    enabled: Boolean(user),
  });

  const all = useMemo(() => products.data ?? [], [products.data]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const codes = coupons.data?.eligible ? coupons.data.coupons : {};
  const isTicketBuyer = Boolean(coupons.data?.eligible);

  const unitPrice = (p: Product) =>
    p.couponPricePaise && codes[p.id] ? p.couponPricePaise : p.discountPricePaise;

  const cartRows = lines
    .map((line) => ({ line, product: byId.get(line.productId) }))
    .filter((row): row is { line: typeof row.line; product: Product } => Boolean(row.product));
  const itemCount = cartRows.reduce((sum, row) => sum + row.line.quantity, 0);
  const totals = cartRows.reduce(
    (acc, { line, product }) => ({
      mrp: acc.mrp + product.originalPricePaise * line.quantity,
      discounted: acc.discounted + product.discountPricePaise * line.quantity,
      payable: acc.payable + unitPrice(product) * line.quantity,
    }),
    { mrp: 0, discounted: 0, payable: 0 },
  );
  const cartCodes = cartRows.filter(({ product }) => product.couponPricePaise && codes[product.id]);

  const copyCode = async (code: string) => {
    if (await copyText(code)) {
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000);
      toast.success("Coupon copied", `Show ${code} at the shop.`);
    } else {
      toast.error("Could not copy", `Note the code ${code} down.`);
    }
  };

  const add = (p: Product) => {
    cart.add(p.id);
    toast.success("Added to cart", p.name);
  };

  return (
    <>
      <LoadErrors className="mt-4" sources={[products]} />

      {isTicketBuyer ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald/30 bg-emerald/5 px-3 py-2.5 text-[12.5px] text-ink">
          <Tag className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
          You are a ticket buyer — coupon prices and codes are unlocked below.
        </div>
      ) : null}

      <div className="mt-5">
        {products.loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" rounded="lg" />
            ))}
          </div>
        ) : all.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {all.map((product) => {
              const inCart = lines.find((line) => line.productId === product.id);
              const code = codes[product.id];
              const off = percentOff(product);
              return (
                <Card key={product.id} className="flex flex-col overflow-hidden">
                  <div className="relative aspect-square bg-ivory">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {off > 0 ? (
                      <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                        {off}% off
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink">{product.name}</h3>
                      {product.description ? (
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{product.description}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-display text-[18px] font-bold tabular-nums text-brand">
                        {formatINR(product.discountPricePaise)}
                      </span>
                      {product.originalPricePaise > product.discountPricePaise ? (
                        <span className="text-[12px] tabular-nums text-muted line-through">
                          {formatINR(product.originalPricePaise)}
                        </span>
                      ) : null}
                    </div>

                    {product.couponPricePaise ? (
                      code ? (
                        <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-2 text-[11.5px]">
                          <p className="font-semibold text-emerald">
                            Ticket-buyer price {formatINR(product.couponPricePaise)}
                          </p>
                          <button
                            type="button"
                            onClick={() => void copyCode(code)}
                            className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-dashed border-emerald/50 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink"
                            aria-label={`Copy coupon ${code}`}
                          >
                            <span className="truncate">{code}</span>
                            {copiedCode === code ? (
                              <Check className="size-3 shrink-0" aria-hidden />
                            ) : (
                              <Copy className="size-3 shrink-0" aria-hidden />
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-gold bg-gold-soft/30 p-2 text-[11.5px] leading-snug text-gold-deep">
                          Ticket buyers pay <strong>{formatINR(product.couponPricePaise)}</strong> with a coupon.{" "}
                          <Link to={user ? "/book" : "/login"} className="font-semibold text-brand hover:underline">
                            {user ? "Book a ticket" : "Sign in"}
                          </Link>
                        </div>
                      )
                    ) : null}

                    <div className="mt-auto pt-1">
                      {inCart ? (
                        <QuantityStepper
                          quantity={inCart.quantity}
                          onChange={(q) => cart.setQuantity(product.id, q)}
                          label={product.name}
                        />
                      ) : (
                        <Button
                          block
                          size="sm"
                          onClick={() => add(product)}
                          iconLeft={<ShoppingCart className="size-4" aria-hidden />}
                        >
                          Add to cart
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : products.error ? null : (
          <EmptyState
            title="No products yet"
            description="Festival offers will appear here soon. Check back later."
          />
        )}
      </div>

      {itemCount > 0 ? (
        <div className="sticky bottom-[84px] z-20 mt-5 lg:bottom-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper/95 px-4 py-3 shadow-[var(--shadow-raised)] backdrop-blur">
            <div className="min-w-0">
              <p className="text-[12px] text-muted">
                {itemCount} item{itemCount === 1 ? "" : "s"} in cart
              </p>
              <p className="font-display text-[18px] font-bold tabular-nums text-ink">{formatINR(totals.payable)}</p>
            </div>
            <Button onClick={() => setCartOpen(true)} iconLeft={<ShoppingBag className="size-4" aria-hidden />}>
              View cart
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <ShoppingBag className="size-5 text-brand" aria-hidden />
            Your cart
          </span>
        }
        description={itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Your cart is empty."}
        footer={
          cartRows.length ? (
            <>
              <Button variant="outline" onClick={() => cart.clear()}>
                Clear cart
              </Button>
              <Button
                onClick={() => {
                  setCartOpen(false);
                  setShopOpen(true);
                }}
                iconLeft={<Store className="size-4" aria-hidden />}
              >
                Buy now
              </Button>
            </>
          ) : undefined
        }
      >
        {cartRows.length ? (
          <div className="space-y-4">
            <ul className="divide-y divide-line">
              {cartRows.map(({ line, product }) => (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-lg border border-line object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{product.name}</p>
                    <p className="text-[12px] tabular-nums text-muted">
                      {formatINR(unitPrice(product))} each
                      {unitPrice(product) < product.discountPricePaise ? " · coupon price" : ""}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <QuantityStepper
                        compact
                        quantity={line.quantity}
                        onChange={(q) => cart.setQuantity(product.id, q)}
                        label={product.name}
                      />
                      <button
                        type="button"
                        onClick={() => cart.remove(product.id)}
                        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ivory hover:text-brand"
                        aria-label={`Remove ${product.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 text-[13.5px] font-semibold tabular-nums text-ink">
                    {formatINR(unitPrice(product) * line.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="space-y-1.5 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
              <SummaryRow label="Price (MRP)" value={formatINR(totals.mrp)} />
              {totals.mrp > totals.discounted ? (
                <SummaryRow label="Discount" value={`− ${formatINR(totals.mrp - totals.discounted)}`} tone="emerald" />
              ) : null}
              {totals.discounted > totals.payable ? (
                <SummaryRow
                  label="Ticket-buyer coupons"
                  value={`− ${formatINR(totals.discounted - totals.payable)}`}
                  tone="emerald"
                />
              ) : null}
              <div className="flex justify-between gap-3 border-t border-line pt-2">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="font-display text-[18px] font-bold tabular-nums text-brand">{formatINR(totals.payable)}</dd>
              </div>
            </dl>

            {cartCodes.length ? (
              <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3 text-[12px]">
                <p className="font-semibold text-emerald">Show these coupon codes at the shop</p>
                <ul className="mt-1.5 space-y-1">
                  {cartCodes.map(({ product }) => (
                    <li key={product.id} className="flex justify-between gap-3">
                      <span className="truncate text-muted">{product.name}</span>
                      <span className="font-mono font-bold text-ink">{codes[product.id]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Your cart is empty" description="Add products to see them here." />
        )}
      </Dialog>

      <Dialog
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <Store className="size-5 text-brand" aria-hidden />
            {SHOP_MESSAGE_TITLE}
          </span>
        }
        footer={<Button onClick={() => setShopOpen(false)}>OK</Button>}
      >
        <div className="space-y-3 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-gold-soft/50 text-gold-deep">
            <Store className="size-7" aria-hidden />
          </span>
          <p className="font-display text-[18px] text-ink">{SHOP_MESSAGE_BODY}</p>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Products are sold at our shop, not online. Your cart is saved on this device
            {cartCodes.length ? ", and your ticket-buyer coupon codes are listed in the cart" : ""}.
          </p>
        </div>
      </Dialog>
    </>
  );
}

function QuantityStepper({
  quantity,
  onChange,
  label,
  compact = false,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  label: string;
  compact?: boolean;
}) {
  const size = compact ? "size-8" : "size-9";
  return (
    <div className={compact ? "inline-flex items-center gap-1" : "flex items-center justify-between gap-1"}>
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        className={`grid ${size} place-items-center rounded-lg border border-line bg-paper text-ink hover:border-brand`}
        aria-label={`Decrease ${label}`}
      >
        <Minus className="size-3.5" aria-hidden />
      </button>
      <span className="min-w-8 text-center text-[13.5px] font-semibold tabular-nums text-ink" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_QUANTITY}
        className={`grid ${size} place-items-center rounded-lg border border-line bg-paper text-ink hover:border-brand disabled:opacity-40`}
        aria-label={`Increase ${label}`}
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === "emerald" ? "tabular-nums text-emerald" : "tabular-nums text-ink"}>{value}</dd>
    </div>
  );
}
