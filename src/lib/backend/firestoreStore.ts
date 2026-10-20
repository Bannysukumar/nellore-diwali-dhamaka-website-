import {
  addDoc,
  collection,
  count,
  deleteDoc,
  deleteField,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy as fsOrderBy,
  query as fsQuery,
  setDoc,
  startAfter,
  sum,
  updateDoc,
  where as fsWhere,
  type AggregateField,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Paginated } from "@/types";
import {
  type ListQuery,
  type OrderByClause,
  type Store,
  StoreError,
  type WhereClause,
} from "@/lib/backend/store";
import { firestore } from "@/lib/firebase/client";
import { BACKEND_MODE } from "@/lib/firebase/config";
import type { BackendMode } from "@/lib/firebase/envValidation";

/** Firestore-backed {@link Store} (production project or the Emulator Suite). */
export class FirestoreStore implements Store {
  readonly mode: BackendMode = BACKEND_MODE;

  private col(path: string) {
    return collection(firestore(), path);
  }

  private toConstraints(query?: ListQuery): QueryConstraint[] {
    const out: QueryConstraint[] = [];
    for (const clause of query?.where ?? []) {
      out.push(fsWhere(clause.field, clause.op as never, clause.value));
    }
    for (const clause of query?.orderBy ?? []) {
      out.push(fsOrderBy(clause.field, clause.dir ?? "asc"));
    }
    if (query?.limit) out.push(fsLimit(query.limit));
    return out;
  }

  async list<T>(path: string, query?: ListQuery): Promise<T[]> {
    try {
      const snap = await getDocs(fsQuery(this.col(path), ...this.toConstraints(query)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
    } catch (error) {
      throw wrap(error, path);
    }
  }

  async get<T>(path: string, id: string): Promise<T | null> {
    try {
      const snap = await getDoc(doc(firestore(), path, id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
    } catch (error) {
      throw wrap(error, path);
    }
  }

  async create<T extends Record<string, unknown>>(path: string, data: T, id?: string): Promise<string> {
    try {
      if (id) {
        await setDoc(doc(firestore(), path, id), data);
        return id;
      }
      const ref = await addDoc(this.col(path), data);
      return ref.id;
    } catch (error) {
      throw wrap(error, path);
    }
  }

  async set<T extends Record<string, unknown>>(path: string, id: string, data: T): Promise<void> {
    try {
      await setDoc(doc(firestore(), path, id), data, { merge: false });
    } catch (error) {
      throw wrap(error, path);
    }
  }

  async update(path: string, id: string, patch: Record<string, unknown>): Promise<void> {
    // An explicit `undefined` in a patch means "clear this field".
    const data: DocumentData = {};
    for (const [key, value] of Object.entries(patch)) {
      data[key] = value === undefined ? deleteField() : value;
    }
    try {
      await updateDoc(doc(firestore(), path, id), data);
    } catch (error) {
      throw wrap(error, path);
    }
  }

  async remove(path: string, id: string): Promise<void> {
    try {
      await deleteDoc(doc(firestore(), path, id));
    } catch (error) {
      throw wrap(error, path);
    }
  }

  /** Server-side count aggregation. Errors propagate — a count is never guessed. */
  async count(path: string, query?: ListQuery): Promise<number> {
    try {
      const snap = await getCountFromServer(fsQuery(this.col(path), ...this.toConstraints(query)));
      return snap.data().count;
    } catch (error) {
      throw wrap(error, path);
    }
  }

  async aggregate(
    path: string,
    query: ListQuery | undefined,
    sumFields: readonly string[],
  ): Promise<{ count: number; sums: Record<string, number> }> {
    const spec: Record<string, AggregateField<number | null>> = { count: count() };
    sumFields.forEach((field, index) => {
      spec[`s${index}`] = sum(field);
    });
    try {
      const snap = await getAggregateFromServer(
        fsQuery(this.col(path), ...this.toConstraints(query)),
        spec,
      );
      const data = snap.data();
      const sums: Record<string, number> = {};
      sumFields.forEach((field, index) => {
        sums[field] = Number(data[`s${index}`] ?? 0);
      });
      return { count: Number(data.count ?? 0), sums };
    } catch (error) {
      throw wrap(error, path);
    }
  }

  subscribe<T>(
    path: string,
    query: ListQuery | undefined,
    cb: (rows: T[]) => void,
    onError?: (error: StoreError) => void,
  ): () => void {
    return onSnapshot(
      fsQuery(this.col(path), ...this.toConstraints(query)),
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      (error) => {
        console.error(`[firestore] subscription failed for ${path}`, error);
        onError?.(wrap(error, path));
      },
    );
  }

  /**
   * Cursor pagination. Firestore has no offset support, so the caller passes
   * the value of the leading `orderBy` field from the previous page.
   */
  async page<T>(path: string, query?: ListQuery): Promise<Paginated<T>> {
    const limit = query?.limit ?? 100;
    const lead = query?.orderBy?.[0];
    if (!lead) {
      const rows = await this.list<T>(path, { ...query, limit: limit + 1 });
      const items = rows.slice(0, limit);
      return { items, cursor: null, hasMore: rows.length > limit };
    }

    const constraints = this.toConstraints({ ...query, limit: limit + 1 });
    if (query?.startAfterValue !== undefined) {
      constraints.push(startAfter(query.startAfterValue));
    }
    try {
      const snap = await getDocs(fsQuery(this.col(path), ...constraints));
      const docs = snap.docs as QueryDocumentSnapshot[];
      const hasMore = docs.length > limit;
      const kept = docs.slice(0, limit);
      const items = kept.map((d) => ({ id: d.id, ...d.data() }) as T);
      const last = kept[kept.length - 1];
      const cursor = last ? (last.data()[lead.field as string] as string | number) : null;
      return { items, cursor, hasMore };
    } catch (error) {
      throw wrap(error, path);
    }
  }
}

function wrap(error: unknown, path: string): StoreError {
  const e = error as { code?: string; message?: string };
  return new StoreError(
    e?.code ?? "store/error",
    e?.message ?? `Request failed for ${path}`,
  );
}

/* Re-exported so callers can build typed queries without importing the SDK. */
export type { OrderByClause, WhereClause };
