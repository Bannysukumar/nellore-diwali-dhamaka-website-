import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ current: { user: null } as Record<string, unknown> }));

vi.mock("@/app/AuthProvider", () => ({ useAuth: () => authState.current }));
vi.mock("@/services/authService", () => ({ endViewAs: vi.fn(), signInForViewAs: vi.fn() }));

import { ReadOnlyViewNotice } from "./ViewAs";

describe("ReadOnlyViewNotice", () => {
  beforeEach(() => {
    authState.current = { user: null };
  });

  it("stays hidden for a customer's own session", () => {
    authState.current = { user: { uid: "u1" } };
    render(<ReadOnlyViewNotice action="Sending money" />);
    expect(screen.queryByText("Admin view is read-only")).toBeNull();
  });

  it("explains the block in an administrator's view-as session", () => {
    authState.current = { user: { uid: "u1", impersonatedBy: "admin1" } };
    render(<ReadOnlyViewNotice action="Sending money" />);
    expect(screen.getByText("Admin view is read-only")).toBeTruthy();
    expect(screen.getByText(/Sending money is switched off/)).toBeTruthy();
  });
});
