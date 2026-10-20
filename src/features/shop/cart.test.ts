import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { cart, MAX_QUANTITY, useCart } from "./cart";

describe("shop cart", () => {
  beforeEach(() => cart.clear());

  it("adds a product once and bumps its quantity on repeat adds", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      cart.add("lamp");
      cart.add("lamp");
      cart.add("sweets");
    });
    expect(result.current).toEqual([
      { productId: "lamp", quantity: 2 },
      { productId: "sweets", quantity: 1 },
    ]);
  });

  it("caps quantities and removes a line set to zero", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      cart.add("lamp");
      cart.setQuantity("lamp", MAX_QUANTITY + 5);
    });
    expect(result.current).toEqual([{ productId: "lamp", quantity: MAX_QUANTITY }]);
    act(() => cart.setQuantity("lamp", 0));
    expect(result.current).toEqual([]);
  });
});
