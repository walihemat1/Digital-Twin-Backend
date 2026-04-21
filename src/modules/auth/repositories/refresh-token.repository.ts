/**
 * This interface defines the structure for a refresh token record,
 * representing a persisted refresh token belonging to a specific user.
 *
 * - `userId`: The unique identifier of the user who owns the refresh token.
 * - `tokenHash`: The hashed value of the refresh token for secure storage and comparison.
 * - `expiresAt`: The exact date and time when the refresh token will expire.
 */
export interface RefreshTokenRecord {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * The purpose of this abstract class is to define the contract for a repository
 * that handles the persistence and management of refresh tokens.
 *
 * - The `save` method is intended to store a new refresh token record, typically when a user logs in or receives a new refresh token.
 * - The `revokeByUserId` method is intended to revoke all refresh tokens associated with a given user, commonly used when a user logs out or when all tokens for a user need to be invalidated.
 *
 * Implementations of this abstract class should provide concrete logic for these operations,
 * such as interacting with a database or in-memory store.
 */
export abstract class RefreshTokenRepository {
  abstract save(record: RefreshTokenRecord): Promise<void>;
  abstract revokeByUserId(userId: string): Promise<void>;
}

/**
 * --------------------------------------------------------------------------
 * Purpose of this File (`refresh-token.repository.ts`)
 * --------------------------------------------------------------------------
 *
 * This file defines the `RefreshTokenRepository` abstract class and the
 * `RefreshTokenRecord` interface, which together establish the contract and
 * structure for storing, managing, and revoking refresh tokens for user sessions.
 *
 * Why we need it:
 * - Centralizes all persistence logic related to refresh tokens, ensuring
 *   consistent, secure handling of token storage and revocation.
 * - Allows for different storage backends (e.g., database, in-memory, etc.) to
 *   provide their own implementations while maintaining a consistent interface.
 * - Improves separation of concerns by abstracting the persistence details away
 *   from the rest of the authentication logic.
 */
