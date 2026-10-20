import type { Store } from "./store";
import { FirestoreStore } from "./firestoreStore";

/**
 * The single data-access entry point for the whole application.
 *
 * Feature code never imports the Firebase SDK directly — it depends on this
 * `Store` contract, fulfilled by Firestore (production project or the local
 * Emulator Suite).
 */
export const store: Store = new FirestoreStore();

export { FirestoreStore };
export * from "./store";
