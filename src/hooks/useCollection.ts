import { useEffect, useMemo, useState } from "react";
import type { ListQuery } from "@/lib/backend";
import { store } from "@/lib/backend";

/** Realtime collection subscription with a cancellable lifecycle. */
export function useCollection<T>(
  path: string,
  query?: ListQuery,
  options: { enabled?: boolean } = {},
): { data: T[]; loading: boolean; error: Error | null; retry: () => void } {
  const { enabled = true } = options;
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = useMemo(() => JSON.stringify(query ?? {}), [query]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsubscribe = store.subscribe<T>(
      path,
      query,
      (rows) => {
        setData(rows);
        setLoading(false);
        setError(null);
      },
      (failure) => {
        setError(failure);
        setLoading(false);
      },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, nonce, enabled]);

  return { data, loading, error, retry: () => setNonce((n) => n + 1) };
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
