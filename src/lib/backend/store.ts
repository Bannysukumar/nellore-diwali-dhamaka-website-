import type { Paginated } from "@/types";
import type { BackendMode } from "@/lib/firebase/envValidation";

export type WhereOp =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "not-in"
  | "array-contains"
  | "array-contains-any";

export interface WhereClause {
  field: string;
  op: WhereOp;
  value: unknown;
}

export interface OrderByClause {
  field: string;
  dir?: "asc" | "desc";
}

export interface ListQuery {
  where?: WhereClause[];
  orderBy?: OrderByClause[];
  limit?: number;
  /**
   * Cursor support. Firestore cannot skip by offset, so we page with the value
   * of the leading `orderBy` field of the previous page.
   */
  startAfterValue?: string | number;
}

export interface Store {
  readonly mode: BackendMode;
  list<T>(path: string, query?: ListQuery): Promise<T[]>;
  get<T>(path: string, id: string): Promise<T | null>;
  /** Creates a document; returns the new id. Pass `id` for a deterministic key. */
  create<T extends Record<string, unknown>>(path: string, data: T, id?: string): Promise<string>;
  set<T extends Record<string, unknown>>(path: string, id: string, data: T): Promise<void>;
  update(path: string, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(path: string, id: string): Promise<void>;
  count(path: string, query?: ListQuery): Promise<number>;
  /**
   * Server-side aggregation: document count plus the sum of each named numeric
   * field over every matching document (no row limit, no client-side reads).
   */
  aggregate(
    path: string,
    query: ListQuery | undefined,
    sumFields: readonly string[],
  ): Promise<{ count: number; sums: Record<string, number> }>;
  /**
   * Realtime subscription. Returns an unsubscribe function. A failed listener
   * reports through `onError`; it never pretends the collection is empty.
   */
  subscribe<T>(
    path: string,
    query: ListQuery | undefined,
    cb: (rows: T[]) => void,
    onError?: (error: StoreError) => void,
  ): () => void;
  page<T>(path: string, query?: ListQuery): Promise<Paginated<T>>;
}

export class StoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

/** Plain-language description of a data-loading failure, for error states. */
export function describeStoreError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (code.endsWith("permission-denied")) return "You do not have access to this information.";
  if (code.endsWith("unavailable")) return "The service is unreachable. Check your connection and retry.";
  if (code.endsWith("failed-precondition")) {
    return "This view needs a database index that is still being built. Try again in a few minutes.";
  }
  return "We could not load this information. Please retry.";
}
