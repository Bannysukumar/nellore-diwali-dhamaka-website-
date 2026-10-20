import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { ErrorState, LoadingBlock } from "@/components/ui";

/** Requires a signed-in, non-suspended account. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page py-16">
        <LoadingBlock label="Checking your session" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (user.profileError) {
    return (
      <div className="page py-16">
        <ErrorState
          title="We could not load your account"
          description="Your sign-in is valid, but your profile could not be read. Check your connection and retry."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
  if (!user.profile) {
    // Verified number without an account yet: finish registration first.
    return <Navigate to="/register" replace />;
  }
  if (user.profile.status === "suspended") {
    return <Navigate to="/account-suspended" replace />;
  }
  return <Outlet />;
}

/**
 * Requires an administrator. This is a UX guard only — the real enforcement
 * lives in Firestore rules and Cloud Function authorization.
 */
export function RequireAdmin() {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page py-16">
        <LoadingBlock label="Verifying administrator access" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname, admin: true }} />;
  }
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace state={{ denied: true }} />;
  }
  return <Outlet />;
}
