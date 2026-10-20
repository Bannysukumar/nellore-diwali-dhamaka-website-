import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/types";

const authState = vi.hoisted(() => ({
  current: { user: null, isAdmin: false, loading: false } as Record<string, unknown>,
}));

vi.mock("@/app/AuthProvider", () => ({
  useAuth: () => authState.current,
}));

import { RequireAdmin, RequireAuth } from "./guards";

const profile = (overrides: Partial<UserProfile> = {}) =>
  ({ uid: "u1", fullName: "Test", role: "customer", status: "active", ...overrides }) as UserProfile;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/register" element={<p>register page</p>} />
        <Route path="/account-suspended" element={<p>suspended page</p>} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard/wallet" element={<p>wallet page</p>} />
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<p>admin page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  beforeEach(() => {
    authState.current = { user: null, isAdmin: false, loading: false };
  });

  it("sends signed-out visitors to login", () => {
    renderAt("/dashboard/wallet");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("sends a verified number without a profile to registration", () => {
    authState.current = { user: { uid: "u1", profile: null, profileError: false }, isAdmin: false, loading: false };
    renderAt("/dashboard/wallet");
    expect(screen.getByText("register page")).toBeInTheDocument();
  });

  it("shows an error, not registration, when the profile could not be read", () => {
    authState.current = { user: { uid: "u1", profile: null, profileError: true }, isAdmin: false, loading: false };
    renderAt("/dashboard/wallet");
    expect(screen.getByText(/could not load your account/i)).toBeInTheDocument();
  });

  it("routes suspended accounts away from the dashboard", () => {
    authState.current = {
      user: { uid: "u1", profile: profile({ status: "suspended" }), profileError: false },
      isAdmin: false,
      loading: false,
    };
    renderAt("/dashboard/wallet");
    expect(screen.getByText("suspended page")).toBeInTheDocument();
  });

  it("lets active customers in", () => {
    authState.current = { user: { uid: "u1", profile: profile(), profileError: false }, isAdmin: false, loading: false };
    renderAt("/dashboard/wallet");
    expect(screen.getByText("wallet page")).toBeInTheDocument();
  });

  it("keeps customers out of admin even if their profile says admin", () => {
    authState.current = {
      user: { uid: "u1", profile: profile({ role: "admin" }), profileError: false },
      isAdmin: false,
      loading: false,
    };
    renderAt("/admin");
    expect(screen.getByText("dashboard page")).toBeInTheDocument();
  });

  it("admits accounts whose token carries the admin claim", () => {
    authState.current = { user: { uid: "a1", profile: profile(), profileError: false }, isAdmin: true, loading: false };
    renderAt("/admin");
    expect(screen.getByText("admin page")).toBeInTheDocument();
  });
});
