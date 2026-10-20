import { useEffect, useRef, useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { endViewAs, signInForViewAs } from "@/services/authService";
import { Alert, Button, LoadingBlock } from "@/components/ui";

/**
 * Landing page of a view-as tab. The admin customers page opens it with a
 * one-hour custom token in the URL fragment (never sent to the server); the
 * fragment is stripped from history before the token is used.
 */
export function ViewAsPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setError("This link has no access token. Open the customer again from Admin → Customers.");
      return;
    }
    signInForViewAs(token)
      .then(() => navigate("/dashboard", { replace: true }))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not open the customer's dashboard."),
      );
  }, [navigate]);

  return (
    <div className="grid min-h-dvh place-items-center bg-ivory px-6">
      {error ? (
        <div className="w-full max-w-md space-y-4">
          <Alert tone="danger" title="Could not open the customer view">
            {error}
          </Alert>
          <Button block variant="outline" onClick={() => window.close()}>
            Close this tab
          </Button>
        </div>
      ) : (
        <LoadingBlock label="Opening the customer's dashboard…" />
      )}
    </div>
  );
}

/** Always-visible notice while an administrator is viewing as a customer. */
export function ViewAsBanner() {
  const { user, profile } = useAuth();
  const [leaving, setLeaving] = useState(false);
  if (!user?.impersonatedBy) return null;

  const exit = async () => {
    setLeaving(true);
    await endViewAs().catch(() => undefined);
    window.close();
    // Tabs not opened by script cannot close themselves; reload as the admin instead.
    window.location.replace("/admin/customers");
  };

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-2xl border border-gold/50 bg-ink/95 px-4 py-3 text-ivory shadow-[var(--shadow-raised)] backdrop-blur lg:inset-x-auto lg:bottom-5 lg:right-5 lg:max-w-md"
    >
      <Eye className="size-5 shrink-0 text-gold" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold">Admin view: {profile?.fullName ?? "customer"}</span>
        <span className="block text-ivory/70">Read-only — nothing can be bought, spun or changed.</span>
      </p>
      <Button size="sm" variant="gold" loading={leaving} onClick={() => void exit()}>
        <LogOut className="size-4" aria-hidden />
        Exit
      </Button>
    </div>
  );
}
