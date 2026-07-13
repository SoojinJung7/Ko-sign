/**
 * Shared contract between the public /verify page, its client components, and
 * the /api/verify route handler. Kept framework-agnostic (no server imports) so
 * both the client bundle and the route can depend on it.
 */

export type VerifyStatus = "authentic" | "tampered" | "unknown";

export interface VerifySigner {
  name: string;
  email: string;
  /** ISO timestamp of when this recipient signed, if they did. */
  signedAt: string | null;
}

export interface VerifySummary {
  documentId: string;
  title: string;
  /** ISO timestamp; present once the envelope is completed. */
  completedAt: string | null;
  /** Lowercase hex SHA-256 of the finalized PDF on record. */
  finalHash: string;
  signers: VerifySigner[];
}

export interface VerifyResponse {
  status: VerifyStatus;
  /** Populated when we located a document (authentic, or an id lookup). */
  summary?: VerifySummary;
  /** SHA-256 we computed from an uploaded file, for side-by-side display. */
  computedHash?: string;
  /** Human-readable explanation, always safe to surface to the public. */
  message: string;
}
