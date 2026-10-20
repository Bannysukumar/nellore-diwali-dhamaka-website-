import { newId } from "@/utils/id";

export interface UploadResult {
  path: string;
  /**
   * A displayable URL. Empty for private uploads: payment screenshots never
   * get a shareable download URL, they are fetched through Storage rules on
   * demand (see {@link getPrivateFileUrl}).
   */
  url: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/heic"];

/** Folders whose contents are private financial evidence. */
const PRIVATE_FOLDERS = new Set(["deposit-screenshots"]);

export function validateImage(file: File): string | null {
  if (!ALLOWED.includes(file.type)) {
    return "Upload a PNG, JPEG or WebP image.";
  }
  if (file.size > MAX_BYTES) {
    return "Image must be smaller than 5 MB.";
  }
  return null;
}

/** Uploads a file to Cloud Storage under `{folder}/{ownerUid}/…`. */
export async function uploadImage(
  folder: string,
  file: File,
  ownerUid: string,
): Promise<UploadResult> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);

  const extension = (file.name.split(".").pop()?.toLowerCase() || "png").replace(/[^a-z0-9]/g, "") || "png";
  const path = `${folder}/${ownerUid}/${newId("f")}.${extension}`;

  const [{ ref, uploadBytes, getDownloadURL }, { firebaseStorage }] = await Promise.all([
    import("firebase/storage"),
    import("@/lib/firebase/client"),
  ]);
  const storageRef = ref(firebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  if (PRIVATE_FOLDERS.has(folder)) return { path, url: "" };
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

export async function deleteUpload(path: string): Promise<void> {
  const [{ ref, deleteObject }, { firebaseStorage }] = await Promise.all([
    import("firebase/storage"),
    import("@/lib/firebase/client"),
  ]);
  await deleteObject(ref(firebaseStorage(), path));
}

/**
 * Loads a private file (a payment screenshot) for display.
 *
 * The bytes are fetched with the viewer's own credentials, so Storage rules
 * decide — only the owner and administrators get through. No bearer download
 * URL is created or stored. Returns a `blob:` object URL; the caller must
 * `URL.revokeObjectURL` it when done. Requires the bucket CORS configuration in
 * `storage.cors.json` (see README).
 */
export async function getPrivateFileUrl(path: string): Promise<string | null> {
  const [{ getBlob, ref }, { firebaseStorage }] = await Promise.all([
    import("firebase/storage"),
    import("@/lib/firebase/client"),
  ]);
  try {
    const blob = await getBlob(ref(firebaseStorage(), path));
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn("[storage] private file could not be loaded", error);
    return null;
  }
}
