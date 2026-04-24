/**
 * Normalizes email for uniqueness checks (case-insensitive storage/compare).
 * See `docs/New folder/data_model.md` §5.1 (email uniqueness).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
